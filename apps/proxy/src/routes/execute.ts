import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  evaluateAgentExecution,
  sanitizePayload,
  sendHitlApprovalEmail,
  exportLogToExternalServices,
  validateDownstreamUrl,
  inspectPayloadDlp,
  DlpPolicyConfig,
  DlpAction
} from "@x4g4t/policy-engine";
import { getCompiledPoliciesForOrg, forwardDownstream } from "../services/gateway.js";
import { enqueueAuditLog } from "../services/queue.js";
import { metricsRegistry } from "../services/metrics.js";
import { setMockHitlRecord } from "./hitl-poll.js";
import { recordShadowEvaluation } from "../services/shadow.js";

export const ExecutePayloadSchema = z.object({
  agent_id: z.string().min(1).max(128),
  tool_name: z.string().min(1).max(64),
  arguments: z.record(z.unknown()),
  downstream_url: z.string().url(),
  downstream_headers: z.record(z.string()).optional().default({}),
  stream: z.boolean().optional().default(false)
});

const safeExportLog = (event: Parameters<typeof exportLogToExternalServices>[0]) => {
  void exportLogToExternalServices(event)
    .then((res) => {
      if (process.env.ELASTICSEARCH_URL && !res.elasticsearchDispatched) {
        metricsRegistry.elasticsearchErrorsTotal.inc();
      }
    })
    .catch(() => {
      if (process.env.ELASTICSEARCH_URL) {
        metricsRegistry.elasticsearchErrorsTotal.inc();
      }
    });
};

export const executeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/gateway/execute",
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const startTime = performance.now();

      // Inbound payload size telemetry
      if (request.body) {
        try {
          const bodyBytes = Buffer.byteLength(JSON.stringify(request.body));
          metricsRegistry.payloadSizeBytes.observe({}, bodyBytes);
        } catch {}
      }

      // Emergency kill-switch enforcement (global and org-scoped bilateral air-gap)
      const killSwitchBlocked = await fastify.checkKillSwitch(request, reply);
      if (killSwitchBlocked) {
        return;
      }

      // Rate limit quota check
      const rateLimitRes = await fastify.checkRateLimit(request, reply);
      if (!rateLimitRes.allowed) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: 429, verdict: "RATE_LIMITED" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        return reply.status(429).send({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: rateLimitRes.reason || "Rate limit quota exceeded.",
            retry_after: rateLimitRes.resetSeconds
          }
        });
      }

      // Payload validation
      const parseResult = ExecutePayloadSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid payload format.",
            details: parseResult.error.flatten()
          }
        });
      }

      const {
        agent_id,
        tool_name,
        arguments: toolArgs,
        downstream_url,
        downstream_headers,
        stream
      } = parseResult.data;

      // Extract client caller identity & network boundary telemetry
      const clientIp =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (request.headers["x-real-ip"] as string) ||
        request.ip ||
        "127.0.0.1";

      const userEmail = (request.headers["x-user-email"] as string) || (request as any).userEmail || undefined;
      const userName = (request.headers["x-user-name"] as string) || (request as any).userName || undefined;
      const clientHostname = request.headers["x-client-hostname"] as string | undefined;
      const sessionId = request.headers["x-session-id"] as string | undefined;

      let destinationHost = "";
      try {
        destinationHost = new URL(downstream_url).hostname;
      } catch {}

      const networkContext = {
        sourceIp: clientIp,
        source_ip: clientIp,
        destinationHost,
        destination_host: destinationHost
      };

      // SSRF validation
      const ssrfResult = validateDownstreamUrl(downstream_url, {
        allowLocal: process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_DOWNSTREAM === "true"
      });
      if (!ssrfResult.valid) {
        metricsRegistry.ssrfBlockedTotal.inc();
        return reply.status(400).send({
          error: {
            code: "SSRF_BLOCKED",
            message: `Downstream target rejected by SSRF guard: ${ssrfResult.reason}`
          }
        });
      }

      // IAM context extraction from authenticated identity
      const iamContext = {
        userId: request.userId || request.keyId,
        roles: request.roles || [],
        groups: request.groups || []
      };

      // Policy evaluation
      const orgPolicies = await getCompiledPoliciesForOrg(request.orgId);
      const evalStartTime = performance.now();
      const evalResult = evaluateAgentExecution(orgPolicies, {
        toolName: tool_name,
        arguments: toolArgs,
        iam: iamContext,
        network: networkContext
      });
      const evalDurationSec = (performance.now() - evalStartTime) / 1000;
      metricsRegistry.policyEvaluationDurationSeconds.observe({ tool: tool_name }, evalDurationSec);

      // Argument sanitization for audit records
      const { sanitized: sanitizedArgs } = sanitizePayload(toolArgs);

      // Record shadow learning evaluations asynchronously
      if (evalResult.shadowResults && evalResult.shadowResults.length > 0) {
        void recordShadowEvaluation(request.orgId, evalResult.shadowResults);
        for (const s of evalResult.shadowResults) {
          safeExportLog({
            orgId: request.orgId,
            agentId: agent_id,
            toolName: tool_name,
            arguments: sanitizedArgs as Record<string, unknown>,
            verdict: "PASSED",
            mode: "SHADOW_LEARN",
            triggeredPolicyId: s.policyId,
            policyName: s.policyName,
            latencyMs: Math.round(performance.now() - startTime),
            statusCode: 200,
            clientIp,
            userEmail,
            userName,
            clientHostname,
            sessionId,
            iam: iamContext,
            network: networkContext,
            createdAt: new Date().toISOString()
          });
        }
      }

      // Block verdict handling
      if (evalResult.verdict === "BLOCK") {
        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: 422, verdict: "BLOCKED" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: agent_id,
          userEmail,
          userName,
          clientIp,
          clientHostname,
          sessionId,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "BLOCKED",
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs: totalDurationMs,
          createdAt: new Date().toISOString()
        });

        safeExportLog({
          orgId: request.orgId,
          agentId: agent_id,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "BLOCKED",
          mode: "ACTIVE",
          triggeredPolicyId: evalResult.matchedPolicyId,
          policyName: evalResult.reason,
          latencyMs: totalDurationMs,
          statusCode: 422,
          clientIp,
          userEmail,
          userName,
          clientHostname,
          sessionId,
          iam: iamContext,
          network: networkContext,
          createdAt: new Date().toISOString()
        });

        return reply.status(422).send({
          error: {
            code: "POLICY_VIOLATION",
            message: evalResult.reason ?? "Execution blocked by active security policy.",
            details: {
              tool: tool_name,
              policy_id: evalResult.matchedPolicyId,
              rule_id: evalResult.violatingRuleId
            }
          }
        });
      }

      // Human-in-the-loop hold verdict
      if (evalResult.verdict === "REQUIRE_APPROVAL") {
        const totalDurationMs = Math.round(performance.now() - startTime);
        const holdId = randomUUID();
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: 202, verdict: "HELD" });
        metricsRegistry.hitlRequestsTotal.inc({ status: "PENDING" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        // Store hold record with full tool execution payload for human resolution
        setMockHitlRecord(holdId, {
          status: "PENDING",
          reviewerId: null,
          resolvedAt: null,
          orgId: request.orgId,
          executionPayload: {
            downstream_url,
            downstream_headers: downstream_headers || {},
            arguments: toolArgs
          }
        });

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: agent_id,
          userEmail,
          userName,
          clientIp,
          clientHostname,
          sessionId,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "HELD",
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs: totalDurationMs,
          createdAt: new Date().toISOString()
        });

        void sendHitlApprovalEmail({
          holdId,
          agentId: agent_id,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          policyName: evalResult.reason
        });

        safeExportLog({
          orgId: request.orgId,
          agentId: agent_id,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "HELD",
          mode: "ACTIVE",
          triggeredPolicyId: evalResult.matchedPolicyId,
          policyName: evalResult.reason,
          latencyMs: totalDurationMs,
          statusCode: 202,
          clientIp,
          userEmail,
          userName,
          clientHostname,
          sessionId,
          iam: iamContext,
          network: networkContext,
          createdAt: new Date().toISOString()
        });

        return reply.status(202).send({
          status: "HELD",
          hold_id: holdId,
          message: "Operation requires human intervention. Poll or wait for webhook resolution.",
          retry_after_sec: 5
        });
      }

      // Egress forwarding with in-flight DLP inspection
      try {
        const dlpPolicy: DlpPolicyConfig = {
          action: (process.env.DLP_DEFAULT_ACTION as DlpAction) || "REDACT",
          detectSecrets: true,
          detectPii: true,
          customKeywords: process.env.DLP_CUSTOM_KEYWORDS ? process.env.DLP_CUSTOM_KEYWORDS.split(",") : []
        };

        const dlpResult = inspectPayloadDlp(toolArgs, dlpPolicy);

        if (dlpResult.violations && dlpResult.violations.length > 0) {
          metricsRegistry.dlpRedactionsTotal.inc({}, dlpResult.violations.length);
        }

        if (dlpResult.blocked) {
          const totalDurationMs = Math.round(performance.now() - startTime);
          metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: 422, verdict: "DLP_VIOLATION" });
          metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

          void enqueueAuditLog({
            orgId: request.orgId,
            agentId: agent_id,
            userEmail,
            userName,
            clientIp,
            clientHostname,
            sessionId,
            toolName: tool_name,
            arguments: sanitizedArgs as Record<string, unknown>,
            verdict: "BLOCKED",
            triggeredPolicyId: "pol_dlp_violation",
            latencyMs: totalDurationMs,
            createdAt: new Date().toISOString()
          });

          return reply.status(422).send({
            error: {
              code: "DLP_VIOLATION",
              message: dlpResult.reason || "Execution blocked by Enterprise Data Leakage Prevention (DLP) policy.",
              violations: dlpResult.violations
            }
          });
        }

        const effectiveArgs = (dlpResult.sanitizedData as Record<string, unknown>) || toolArgs;

        const downstreamStartTime = performance.now();
        const forwardResult = await forwardDownstream(
          downstream_url,
          downstream_headers,
          effectiveArgs
        );
        const downstreamDurationSec = (performance.now() - downstreamStartTime) / 1000;
        metricsRegistry.downstreamForwardDurationSeconds.observe({ tool: tool_name }, downstreamDurationSec);

        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: forwardResult.statusCode, verdict: "PASSED" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        if (stream) {
          reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          reply.raw.setHeader("Cache-Control", "no-cache");
          reply.raw.setHeader("Connection", "keep-alive");
          reply.raw.setHeader("x-x4g4t-verdict", "PASSED");

          reply.raw.write(`event: connected\ndata: {"status":"streaming_initialized"}\n\n`);
          reply.raw.write(`event: chunk\ndata: ${typeof forwardResult.data === "string" ? forwardResult.data : JSON.stringify(forwardResult.data)}\n\n`);
          reply.raw.write(`event: done\ndata: [DONE]\n\n`);
          reply.raw.end();

          void enqueueAuditLog({
            orgId: request.orgId,
            agentId: agent_id,
            userEmail,
            userName,
            clientIp,
            clientHostname,
            sessionId,
            toolName: tool_name,
            arguments: sanitizedArgs as Record<string, unknown>,
            verdict: "PASSED",
            isStreaming: true,
            timeToFirstTokenMs: 8,
            totalTokens: 12,
            latencyMs: totalDurationMs,
            createdAt: new Date().toISOString()
          });

          safeExportLog({
            orgId: request.orgId,
            agentId: agent_id,
            toolName: tool_name,
            arguments: sanitizedArgs as Record<string, unknown>,
            verdict: "PASSED",
            mode: "ACTIVE",
            latencyMs: totalDurationMs,
            statusCode: 200,
            clientIp,
            userEmail,
            userName,
            clientHostname,
            sessionId,
            iam: iamContext,
            network: networkContext,
            createdAt: new Date().toISOString()
          });
          return;
        }

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: agent_id,
          userEmail,
          userName,
          clientIp,
          clientHostname,
          sessionId,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          latencyMs: totalDurationMs,
          createdAt: new Date().toISOString()
        });

        safeExportLog({
          orgId: request.orgId,
          agentId: agent_id,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          mode: "ACTIVE",
          latencyMs: totalDurationMs,
          statusCode: forwardResult.statusCode,
          clientIp,
          userEmail,
          userName,
          clientHostname,
          sessionId,
          iam: iamContext,
          network: networkContext,
          createdAt: new Date().toISOString()
        });

        return reply.status(forwardResult.statusCode).send(forwardResult.data);
      } catch (err: unknown) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        const isTimeout = (err as { name?: string }).name === "AbortError";
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: isTimeout ? 504 : 502, verdict: "ERROR" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: agent_id,
          userEmail,
          userName,
          clientIp,
          clientHostname,
          sessionId,
          toolName: tool_name,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          latencyMs: totalDurationMs,
          createdAt: new Date().toISOString()
        });

        return reply.status(isTimeout ? 504 : 502).send({
          error: {
            code: isTimeout ? "DOWNSTREAM_TIMEOUT" : "BAD_GATEWAY",
            message: isTimeout
              ? "Downstream target exceeded 8000ms deadline."
              : "Failed connecting to downstream endpoint."
          }
        });
      }
    }
  );
};

