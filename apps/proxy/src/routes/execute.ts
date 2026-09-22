import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  evaluateAgentExecution,
  sanitizePayload,
  sendHitlApprovalEmail,
  exportLogToExternalServices,
  isGlobalAiLockdownActive,
  validateDownstreamUrl,
  inspectPayloadDlp,
  DlpPolicyConfig,
  DlpAction
} from "@x4g4t/policy-engine";
import { getCompiledPoliciesForOrg, forwardDownstream } from "../services/gateway.js";
import { enqueueAuditLog } from "../services/queue.js";
import { metricsRegistry } from "../services/metrics.js";
import { setMockHitlRecord } from "./hitl-poll.js";

export const ExecutePayloadSchema = z.object({
  agent_id: z.string().min(1).max(128),
  tool_name: z.string().min(1).max(64),
  arguments: z.record(z.unknown()),
  downstream_url: z.string().url(),
  downstream_headers: z.record(z.string()).optional().default({})
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

      // Emergency kill-switch enforcement
      if (isGlobalAiLockdownActive()) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: 503, verdict: "AI_LOCKDOWN_ACTIVE" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        safeExportLog({
          orgId: request.orgId,
          agentId: (request.body as any)?.agent_id || "unknown",
          toolName: (request.body as any)?.tool_name || "unknown",
          arguments: {},
          verdict: "BLOCKED",
          triggeredPolicyId: "pol_emergency_ai_lockdown",
          latencyMs: totalDurationMs,
          statusCode: 503,
          createdAt: new Date().toISOString()
        });

        return reply.status(503).send({
          error: {
            code: "AI_LOCKDOWN_ACTIVE",
            message: "All autonomous AI agent executions are currently locked down by SecOps emergency kill-switch."
          }
        });
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
        downstream_headers
      } = parseResult.data;

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
        iam: iamContext
      });
      const evalDurationSec = (performance.now() - evalStartTime) / 1000;
      metricsRegistry.policyEvaluationDurationSeconds.observe({ tool: tool_name }, evalDurationSec);

      // Argument sanitization for audit records
      const { sanitized: sanitizedArgs } = sanitizePayload(toolArgs);

      // Block verdict handling
      if (evalResult.verdict === "BLOCK") {
        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/v1/gateway/execute", status: 422, verdict: "BLOCKED" });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/execute" }, totalDurationMs / 1000);

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: agent_id,
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
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs: totalDurationMs,
          statusCode: 422,
          iam: iamContext,
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
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs: totalDurationMs,
          statusCode: 202,
          iam: iamContext,
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

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: agent_id,
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
          latencyMs: totalDurationMs,
          statusCode: forwardResult.statusCode,
          iam: iamContext,
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

