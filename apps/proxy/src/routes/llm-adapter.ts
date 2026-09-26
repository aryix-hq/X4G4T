import { FastifyPluginAsync } from "fastify";
import {
  evaluateAgentExecution,
  inspectPayloadDlp,
  sanitizePayload,
  DlpPolicyConfig,
  DlpAction
} from "@x4g4t/policy-engine";
import { getCompiledPoliciesForOrg, getDbClient } from "../services/gateway.js";
import { enqueueAuditLog } from "../services/queue.js";
import { metricsRegistry } from "../services/metrics.js";
import { upstreamProviders } from "@x4g4t/db";
import { eq, and } from "drizzle-orm";

export interface UpstreamProviderConfig {
  id: string;
  orgId: string;
  name: string;
  providerType: "OLLAMA" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "CUSTOM";
  baseUrl: string;
  authToken?: string | null;
  isInternal: boolean;
  isActive: boolean;
}

const mockProviders = new Map<string, UpstreamProviderConfig>();

export function setMockProvider(provider: UpstreamProviderConfig): void {
  mockProviders.set(provider.id, provider);
}

export function clearMockProviders(): void {
  mockProviders.clear();
}

async function resolveProvider(providerId: string, orgId: string): Promise<UpstreamProviderConfig | null> {
  // Check mock/in-memory first (for tests and dev speed)
  const mock = mockProviders.get(providerId);
  if (mock) {
    if (mock.orgId === orgId) return mock;
    return null;
  }

  // Database lookup
  try {
    const db = getDbClient();
    const [row] = await db
      .select()
      .from(upstreamProviders)
      .where(and(eq(upstreamProviders.id, providerId), eq(upstreamProviders.orgId, orgId)))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      orgId: row.orgId,
      name: row.name,
      providerType: row.providerType as UpstreamProviderConfig["providerType"],
      baseUrl: row.baseUrl,
      authToken: row.authToken,
      isInternal: row.isInternal,
      isActive: row.isActive
    };
  } catch {
    return null;
  }
}

export const llmAdapterRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.all(
    "/v1/gateway/llm/:providerId/*",
    {
      preHandler: [fastify.authenticate]
    },
    async (request, reply) => {
      const startTime = performance.now();

      // 1. Ingress & Egress Bilateral Air-Gap Kill Switch Check
      const killSwitchBlocked = await fastify.checkKillSwitch(request, reply);
      if (killSwitchBlocked) {
        return;
      }

      // 2. Sliding-Window Rate Limit Check
      const rateLimitRes = await fastify.checkRateLimit(request, reply);
      if (!rateLimitRes.allowed) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({
          method: request.method,
          route: "/v1/gateway/llm",
          status: 429,
          verdict: "RATE_LIMITED"
        });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/llm" }, totalDurationMs / 1000);

        return reply.status(429).send({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: rateLimitRes.reason || "Rate limit quota exceeded.",
            retry_after: rateLimitRes.resetSeconds
          }
        });
      }

      // 3. Resolve Target Upstream Inference Provider
      const params = request.params as { providerId: string; "*": string };
      const providerId = params.providerId;
      const subPath = params["*"] || "";

      const provider = await resolveProvider(providerId, request.orgId);
      if (!provider || !provider.isActive) {
        return reply.status(404).send({
          error: {
            code: "PROVIDER_NOT_FOUND",
            message: `Inference provider '${providerId}' not found or inactive for organization.`
          }
        });
      }

      // 4. Uniform In-Flight Inspection (DLP + AST Policy Bounds)
      const body = request.body as Record<string, unknown> | undefined;
      let effectiveBody = body;

      if (body) {
        const dlpPolicy: DlpPolicyConfig = {
          action: (process.env.DLP_DEFAULT_ACTION as DlpAction) || "REDACT",
          detectSecrets: true,
          detectPii: true,
          customKeywords: process.env.DLP_CUSTOM_KEYWORDS ? process.env.DLP_CUSTOM_KEYWORDS.split(",") : []
        };

        const dlpResult = inspectPayloadDlp(body, dlpPolicy);

        if (dlpResult.violations && dlpResult.violations.length > 0) {
          metricsRegistry.dlpRedactionsTotal.inc({}, dlpResult.violations.length);
        }

        if (dlpResult.blocked) {
          const totalDurationMs = Math.round(performance.now() - startTime);
          metricsRegistry.httpRequestsTotal.inc({
            method: request.method,
            route: "/v1/gateway/llm",
            status: 422,
            verdict: "DLP_VIOLATION"
          });

          void enqueueAuditLog({
            orgId: request.orgId,
            agentId: (request.headers["x-agent-id"] as string) || "llm-client",
            toolName: `llm:${provider.providerType.toLowerCase()}`,
            arguments: {},
            verdict: "BLOCKED",
            triggeredPolicyId: "pol_dlp_llm_violation",
            latencyMs: totalDurationMs,
            createdAt: new Date().toISOString()
          });

          return reply.status(422).send({
            error: {
              code: "DLP_VIOLATION",
              message: dlpResult.reason || "Payload blocked by Data Leakage Prevention (DLP) guardrails.",
              violations: dlpResult.violations
            }
          });
        }

        effectiveBody = (dlpResult.sanitizedData as Record<string, unknown>) || body;

        // Check embedded tool calls or function arguments if present in request
        const orgPolicies = await getCompiledPoliciesForOrg(request.orgId);
        
        // Support OpenAI tool calls or custom tool parameters in payload
        const toolCalls = (body.tool_calls || body.tools || body.functions) as Array<{
          name?: string;
          function?: { name: string; arguments: string | Record<string, unknown> };
          arguments?: Record<string, unknown>;
        }> | undefined;

        if (Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            const toolName = tc.name || tc.function?.name;
            let rawArgs = tc.arguments || tc.function?.arguments;
            if (typeof rawArgs === "string") {
              try {
                rawArgs = JSON.parse(rawArgs);
              } catch {}
            }
            if (toolName && typeof rawArgs === "object" && rawArgs !== null) {
              const evalResult = evaluateAgentExecution(orgPolicies, {
                toolName,
                arguments: rawArgs as Record<string, unknown>
              });

              if (evalResult.verdict === "BLOCK") {
                const totalDurationMs = Math.round(performance.now() - startTime);
                metricsRegistry.httpRequestsTotal.inc({
                  method: request.method,
                  route: "/v1/gateway/llm",
                  status: 422,
                  verdict: "BLOCKED"
                });
                metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/llm" }, totalDurationMs / 1000);

                return reply.status(422).send({
                  error: {
                    code: "POLICY_VIOLATION",
                    message: evalResult.reason || `Tool call '${toolName}' blocked by policy firewall.`
                  }
                });
              }
            }
          }
        }
      }

      // 5. Proxy to Upstream Inference Node (Ollama / vLLM / Internal Cluster)
      const targetUrl = `${provider.baseUrl.replace(/\/+$/, "")}/${subPath.replace(/^\/+/, "")}`;
      const forwardHeaders: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (provider.authToken) {
        forwardHeaders["Authorization"] = `Bearer ${provider.authToken}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const fetchOptions: RequestInit = {
          method: request.method,
          headers: forwardHeaders,
          signal: controller.signal
        };

        if (request.method !== "GET" && request.method !== "HEAD" && effectiveBody) {
          fetchOptions.body = JSON.stringify(effectiveBody);
        }

        const upstreamResponse = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);

        const totalDurationMs = Math.round(performance.now() - startTime);
        metricsRegistry.httpRequestsTotal.inc({
          method: request.method,
          route: "/v1/gateway/llm",
          status: upstreamResponse.status,
          verdict: "PASSED"
        });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/llm" }, totalDurationMs / 1000);

        const responseText = await upstreamResponse.text();
        let responseData: unknown = responseText;
        try {
          responseData = JSON.parse(responseText);
        } catch {}

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId: (request.headers["x-agent-id"] as string) || "llm-client",
          toolName: `llm:${provider.providerType.toLowerCase()}:${subPath}`,
          arguments: (sanitizePayload(effectiveBody || {}).sanitized as Record<string, unknown>),
          verdict: "PASSED",
          latencyMs: totalDurationMs,
          createdAt: new Date().toISOString()
        });

        return reply.status(upstreamResponse.status).send(responseData);
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const totalDurationMs = Math.round(performance.now() - startTime);
        const isTimeout = (err as { name?: string }).name === "AbortError";

        metricsRegistry.httpRequestsTotal.inc({
          method: request.method,
          route: "/v1/gateway/llm",
          status: isTimeout ? 504 : 502,
          verdict: "ERROR"
        });
        metricsRegistry.httpRequestDurationSeconds.observe({ route: "/v1/gateway/llm" }, totalDurationMs / 1000);

        return reply.status(isTimeout ? 504 : 502).send({
          error: {
            code: isTimeout ? "UPSTREAM_TIMEOUT" : "BAD_GATEWAY",
            message: isTimeout
              ? "Upstream inference endpoint exceeded 8000ms deadline."
              : `Failed connecting to upstream inference endpoint at ${provider.baseUrl}`
          }
        });
      }
    }
  );
};
