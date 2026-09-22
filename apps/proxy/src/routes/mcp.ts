import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { evaluateAgentExecution, sanitizePayload, exportLogToExternalServices } from "@x4g4t/policy-engine";
import { getCompiledPoliciesForOrg, forwardDownstream } from "../services/gateway.js";
import { enqueueAuditLog } from "../services/queue.js";
import { metricsRegistry } from "../services/metrics.js";

// JSON-RPC 2.0 Base Schema
export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional()
});

export const McpToolCallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()).optional().default({})
});

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/gateway/mcp",
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

      // JSON-RPC schema validation
      const rpcParse = JsonRpcRequestSchema.safeParse(request.body);
      if (!rpcParse.success) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid Request: Malformed JSON-RPC 2.0 payload."
          }
        });
      }

      const { id, method, params } = rpcParse.data;
      const targetMcpUrl = request.headers["x-target-mcp-url"] as string | undefined;

      if (!targetMcpUrl) {
        return reply.status(400).send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Missing 'X-Target-MCP-URL' header indicating upstream MCP server."
          }
        });
      }

      const agentId = (request.headers["x-agent-id"] as string) || "mcp-client";

      // Direct pass-through for discovery and lifecycle methods
      if (method !== "tools/call") {
        try {
          metricsRegistry.mcpRequestsTotal.inc({ method, verdict: "PASSTHROUGH" });
          const passThroughRes = await forwardDownstream(
            targetMcpUrl,
            { "Content-Type": "application/json" },
            request.body as Record<string, unknown>
          );
          return reply.status(passThroughRes.statusCode).send(passThroughRes.data);
        } catch {
          return reply.status(502).send({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32000,
              message: "Failed routing lifecycle frame upstream."
            }
          });
        }
      }

      // Tool call parameter validation
      const toolParamsParse = McpToolCallParamsSchema.safeParse(params);
      if (!toolParamsParse.success) {
        metricsRegistry.mcpRequestsTotal.inc({ method: "tools/call", verdict: "BAD_REQUEST" });
        return reply.status(400).send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Invalid params for 'tools/call'",
            data: toolParamsParse.error.flatten()
          }
        });
      }

      const { name: toolName, arguments: toolArgs } = toolParamsParse.data;

      // In-memory policy evaluation
      const policies = await getCompiledPoliciesForOrg(request.orgId);
      const evalResult = evaluateAgentExecution(policies, {
        toolName,
        arguments: toolArgs
      });

      const { sanitized: sanitizedArgs } = sanitizePayload(toolArgs);
      const latencyMs = Math.round(performance.now() - startTime);

      // Handle BLOCK
      if (evalResult.verdict === "BLOCK") {
        metricsRegistry.mcpRequestsTotal.inc({ method: "tools/call", verdict: "BLOCKED" });
        void enqueueAuditLog({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "BLOCKED",
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs,
          createdAt: new Date().toISOString()
        });

        void exportLogToExternalServices({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "BLOCKED",
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs,
          statusCode: 200,
          createdAt: new Date().toISOString()
        });

        return reply.status(200).send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32001,
            message: `Execution blocked by policy: ${evalResult.reason ?? "Security threshold violated."}`,
            data: {
              tool: toolName,
              policyId: evalResult.matchedPolicyId,
              ruleId: evalResult.violatingRuleId
            }
          }
        });
      }

      // Handle REQUIRE_APPROVAL (HITL)
      if (evalResult.verdict === "REQUIRE_APPROVAL") {
        metricsRegistry.mcpRequestsTotal.inc({ method: "tools/call", verdict: "HELD" });
        void enqueueAuditLog({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "HELD",
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs,
          createdAt: new Date().toISOString()
        });

        void exportLogToExternalServices({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "HELD",
          triggeredPolicyId: evalResult.matchedPolicyId,
          latencyMs,
          statusCode: 200,
          createdAt: new Date().toISOString()
        });

        return reply.status(200).send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `[X4G4T HELD] Action requires human verification. Reviewers alerted via Slack.`
              }
            ],
            isError: true
          }
        });
      }

      // Forward to target MCP server
      try {
        metricsRegistry.mcpRequestsTotal.inc({ method: "tools/call", verdict: "PASSED" });
        const upstreamResponse = await forwardDownstream(
          targetMcpUrl,
          { "Content-Type": "application/json" },
          request.body as Record<string, unknown>
        );

        void enqueueAuditLog({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          latencyMs,
          createdAt: new Date().toISOString()
        });

        void exportLogToExternalServices({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          latencyMs,
          statusCode: upstreamResponse.statusCode,
          createdAt: new Date().toISOString()
        });

        return reply.status(upstreamResponse.statusCode).send(upstreamResponse.data);
      } catch {
        metricsRegistry.mcpRequestsTotal.inc({ method: "tools/call", verdict: "ERROR" });
        void enqueueAuditLog({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          latencyMs,
          createdAt: new Date().toISOString()
        });

        void exportLogToExternalServices({
          orgId: request.orgId,
          agentId,
          toolName,
          arguments: sanitizedArgs as Record<string, unknown>,
          verdict: "PASSED",
          latencyMs,
          statusCode: 504,
          createdAt: new Date().toISOString()
        });

        return reply.status(504).send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: "Upstream MCP target timed out or unreachable."
          }
        });
      }
    }
  );
};

