import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { getDb } from "@/lib/tenant";
import { apiKeys, policies, policyRules, executionLogs, hitlRequests } from "@x4g4t/db";
import {
  evaluateAgentExecution,
  sanitizePayload,
  sanitizeHeaders,
  computeLogRecordHash,
  CompiledPolicy,
  RuleOperator,
  sendHitlApprovalEmail,
  exportLogToExternalServices,
  isGlobalAiLockdownActive,
  validateDownstreamUrl
} from "@x4g4t/policy-engine";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";

// Input schema matching Fastify proxy specification
const ExecuteRequestSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  tool_name: z.string().min(1, "tool_name is required"),
  arguments: z.record(z.unknown()).default({}),
  downstream_url: z.string().url("Valid downstream_url is required"),
  downstream_headers: z.record(z.string()).optional()
});

import { tokenCache, mockPoliciesMap } from "@/lib/gateway-mocks";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  const startTime = performance.now();

  // 0. Emergency Global AI Lockdown Kill-Switch
  if (isGlobalAiLockdownActive()) {
    void exportLogToExternalServices({
      orgId: "org_emergency_lockdown",
      agentId: "all_agents",
      toolName: "all_tools",
      arguments: {},
      verdict: "BLOCKED",
      triggeredPolicyId: "pol_emergency_ai_lockdown",
      latencyMs: Math.max(1, Math.round(performance.now() - startTime)),
      recordHash: "LOCKDOWN_HASH",
      createdAt: new Date().toISOString()
    });

    return NextResponse.json(
      {
        error: {
          code: "AI_LOCKDOWN_ACTIVE",
          message: "All autonomous AI agent executions are currently locked down by SecOps emergency kill-switch."
        }
      },
      { status: 503 }
    );
  }

  try {
    // 1. Authenticate Request
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid Bearer authentication token."
          }
        },
        { status: 401 }
      );
    }

    const rawToken = authHeader.replace("Bearer ", "").trim();
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const now = Date.now();
    let authContext = tokenCache.get(tokenHash);

    const db = getDb();

    if (!authContext || authContext.expiresAt < now) {
      try {
        const [keyRecord] = await db
          .select({
            id: apiKeys.id,
            orgId: apiKeys.orgId
          })
          .from(apiKeys)
          .where(
            and(
              eq(apiKeys.keyHash, tokenHash),
              isNull(apiKeys.deletedAt)
            )
          )
          .limit(1);

        if (!keyRecord) {
          return NextResponse.json(
            {
              error: {
                code: "INVALID_API_KEY",
                message: "API key is invalid or has been revoked."
              }
            },
            { status: 401 }
          );
        }

        authContext = {
          orgId: keyRecord.orgId,
          keyId: keyRecord.id,
          expiresAt: now + CACHE_TTL_MS
        };
        tokenCache.set(tokenHash, authContext);
      } catch (dbErr) {
        console.warn("[X4G4T Auth DB Warning]:", dbErr);
        return NextResponse.json(
          {
            error: {
              code: "INVALID_API_KEY",
              message: "API key verification failed."
            }
          },
          { status: 401 }
        );
      }
    }

    const { orgId } = authContext;

    // 2. Parse & Validate Payload
    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Malformed JSON payload in request body."
          }
        },
        { status: 400 }
      );
    }

    const parseResult = ExecuteRequestSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: parseResult.error.errors[0]?.message ?? "Invalid request body."
          }
        },
        { status: 400 }
      );
    }

    const {
      agent_id: agentId,
      tool_name: toolName,
      arguments: toolArgs,
      downstream_url: downstreamUrl,
      downstream_headers: downstreamHeaders
    } = parseResult.data;

    // 2.5. SEC-02: Validate Downstream URL (SSRF Protection)
    const ssrfCheck = validateDownstreamUrl(downstreamUrl, {
      allowLocal: process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_DOWNSTREAM === "true"
    });
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        {
          error: {
            code: "SSRF_BLOCKED",
            message: `Downstream target rejected by SSRF guard: ${ssrfCheck.reason}`
          }
        },
        { status: 400 }
      );
    }

    // 3. Fetch Active Policies for Organization
    let compiledPolicies: CompiledPolicy[] = [];

    if (mockPoliciesMap.has(orgId)) {
      compiledPolicies = mockPoliciesMap.get(orgId)!;
    } else {
      try {
        const activePoliciesRows = await db
          .select({
            policyId: policies.id,
            policyName: policies.name,
            targetTool: policies.targetTool,
            actionOnMatch: policies.actionOnMatch,
            ruleId: policyRules.id,
            fieldPath: policyRules.fieldPath,
            operator: policyRules.operator,
            targetValue: policyRules.targetValue
          })
          .from(policies)
          .leftJoin(policyRules, eq(policies.id, policyRules.policyId))
          .where(
            and(
              eq(policies.orgId, orgId),
              eq(policies.isActive, "true"),
              isNull(policies.deletedAt)
            )
          );

        const policyMap = new Map<string, CompiledPolicy>();
        for (const row of activePoliciesRows) {
          if (!policyMap.has(row.policyId)) {
            policyMap.set(row.policyId, {
              id: row.policyId,
              name: row.policyName,
              targetTool: row.targetTool,
              actionOnMatch: row.actionOnMatch,
              rules: []
            });
          }

          if (row.ruleId && row.fieldPath && row.operator && row.targetValue) {
            const p = policyMap.get(row.policyId)!;
            p.rules.push({
              id: row.ruleId,
              fieldPath: row.fieldPath,
              operator: row.operator as RuleOperator,
              targetValue: row.targetValue
            });
          }
        }

        compiledPolicies = Array.from(policyMap.values());
      } catch (polErr) {
        console.warn("[X4G4T Policy Fetch DB Warning]:", polErr);
        compiledPolicies = [];
      }
    }

    // 4. In-Memory AST Policy Evaluation (<1ms)
    // SEC-01: Discard client-supplied X-IAM-* headers to prevent privilege escalation / spoofing
    const iamContext = {
      userId: authContext.keyId,
      roles: [],
      groups: []
    };

    const evalResult = evaluateAgentExecution(compiledPolicies, {
      toolName,
      arguments: toolArgs,
      iam: iamContext
    });

    const { sanitized: sanitizedArgs, piiDetected } = sanitizePayload(toolArgs);
    const latencyMs = Math.max(1, Math.round(performance.now() - startTime));

    // Helper: Async write to Neon Postgres using Vercel waitUntil()
    const logAuditAsync = (
      verdict: "PASSED" | "BLOCKED" | "HELD",
      holdIdToCreate?: string
    ) => {
      waitUntil(
        (async () => {
          try {
            // Retrieve previous record hash for ISO 27001 hash chaining
            const [latestLog] = await db
              .select({ recordHash: executionLogs.recordHash })
              .from(executionLogs)
              .where(eq(executionLogs.orgId, orgId))
              .orderBy(desc(executionLogs.createdAt))
              .limit(1);

            const prevHash = latestLog?.recordHash || "GENESIS_BLOCK";
            const logId = randomUUID();
            const createdAt = new Date();

            const recordHash = computeLogRecordHash({
              id: logId,
              previousRecordHash: prevHash,
              toolName,
              verdict,
              createdAt
            });

            await db.insert(executionLogs).values({
              id: logId,
              orgId,
              agentId,
              toolName,
              arguments: sanitizedArgs as Record<string, unknown>,
              verdict,
              triggeredPolicyId: evalResult.matchedPolicyId ?? null,
              latencyMs,
              previousRecordHash: prevHash,
              recordHash,
              isPiiRedacted: piiDetected ? "true" : "false",
              createdAt
            });

            if (verdict === "HELD" && holdIdToCreate) {
              await db.insert(hitlRequests).values({
                id: holdIdToCreate,
                logId,
                status: "PENDING",
                createdAt
              });

              void sendHitlApprovalEmail({
                holdId: holdIdToCreate,
                agentId,
                toolName,
                arguments: sanitizedArgs as Record<string, unknown>,
                policyName: evalResult.reason
              });
            }

            void exportLogToExternalServices({
              orgId,
              agentId,
              toolName,
              arguments: sanitizedArgs as Record<string, unknown>,
              verdict,
              triggeredPolicyId: evalResult.matchedPolicyId ?? null,
              latencyMs,
              recordHash,
              createdAt: createdAt.toISOString()
            });
          } catch (err) {
            console.error("[X4G4T Vercel Serverless Audit Error]:", err);
          }
        })()
      );
    };

    // 5. Handle BLOCK Verdict (422)
    if (evalResult.verdict === "BLOCK") {
      logAuditAsync("BLOCKED");

      return NextResponse.json(
        {
          error: {
            code: "POLICY_VIOLATION",
            message: `Execution blocked by policy '${evalResult.matchedPolicyId}'. Reason: ${evalResult.reason ?? "Security threshold violated."}`,
            details: {
              tool: toolName,
              policy_id: evalResult.matchedPolicyId,
              rule_id: evalResult.violatingRuleId
            }
          }
        },
        { status: 422 }
      );
    }

    // 6. Handle REQUIRE_APPROVAL (HITL) Verdict (202)
    if (evalResult.verdict === "REQUIRE_APPROVAL") {
      const holdId = `hold_${randomUUID()}`;
      logAuditAsync("HELD", holdId);

      return NextResponse.json(
        {
          status: "HELD",
          hold_id: holdId,
          retry_after_sec: 5,
          message: "Operation requires human intervention. Poll /v1/gateway/hitl/:holdId for resolution."
        },
        { status: 202 }
      );
    }

    // 7. Handle ALLOW Verdict (200) -> Forward Downstream
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second circuit breaker

    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(downstreamHeaders ? sanitizeHeaders(downstreamHeaders) : {})
    };

    try {
      const downstreamResponse = await fetch(downstreamUrl, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify(toolArgs),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      logAuditAsync("PASSED");

      const responseText = await downstreamResponse.text();
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = responseText;
      }

      return NextResponse.json(parsedBody, { status: downstreamResponse.status });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);

      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        logAuditAsync("BLOCKED");
        return NextResponse.json(
          {
            error: {
              code: "GATEWAY_TIMEOUT",
              message: "Downstream service exceeded 8000ms response timeout."
            }
          },
          { status: 504 }
        );
      }

      logAuditAsync("BLOCKED");
      return NextResponse.json(
        {
          error: {
            code: "BAD_GATEWAY",
            message: `Failed to connect to downstream service: ${fetchErr instanceof Error ? fetchErr.message : "Unknown error"}`
          }
        },
        { status: 502 }
      );
    }
  } catch (globalErr: unknown) {
    console.error("[X4G4T Serverless Gateway Error]:", globalErr);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred during execution."
        }
      },
      { status: 500 }
    );
  }
}

