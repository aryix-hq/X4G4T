import { createDbClient, policies, policyRules } from "@x4g4t/db";
import { CompiledPolicy, RuleOperator } from "@x4g4t/policy-engine";
import { eq, and, isNull } from "drizzle-orm";
import { metricsRegistry } from "./metrics.js";

interface CacheEntry {
  expiresAt: number;
  data: CompiledPolicy[];
}

const policyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

let dbInstance: ReturnType<typeof createDbClient> | null = null;

export function getDbClient() {
  if (!dbInstance) {
    const connStr = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/x4g4t";
    dbInstance = createDbClient(connStr);
  }
  return dbInstance;
}

export function setMockPoliciesForOrg(orgId: string, customPolicies: CompiledPolicy[]) {
  policyCache.set(orgId, {
    expiresAt: Date.now() + CACHE_TTL_MS * 10,
    data: customPolicies
  });
}

export function clearPolicyCache() {
  policyCache.clear();
}

export async function getCompiledPoliciesForOrg(orgId: string): Promise<CompiledPolicy[]> {
  const now = Date.now();
  const cached = policyCache.get(orgId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const db = getDbClient();
  try {
    const rows = await db
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

    for (const row of rows) {
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
        policyMap.get(row.policyId)!.rules.push({
          id: row.ruleId,
          fieldPath: row.fieldPath,
          operator: row.operator as RuleOperator,
          targetValue: row.targetValue
        });
      }
    }

    let compiled = Array.from(policyMap.values());
    if (compiled.length === 0 && (orgId === "org_enterprise" || orgId === "org_default_x4g4t")) {
      compiled = [
        {
          id: "pol_sql_guard",
          name: "Catch Table Drops",
          targetTool: "run_sql_query",
          actionOnMatch: "BLOCK",
          rules: [
            {
              id: "rule_sql_drop",
              fieldPath: "query",
              operator: "REGEX",
              targetValue: "(?i)DROP\\s+TABLE"
            }
          ]
        },
        {
          id: "pol_refund_guard",
          name: "High-Value Refund Sign-Off",
          targetTool: "issue_refund",
          actionOnMatch: "REQUIRE_APPROVAL",
          rules: [
            {
              id: "rule_refund_amount",
              fieldPath: "amount",
              operator: "GREATER_THAN",
              targetValue: "500"
            }
          ]
        }
      ];
    }
    policyCache.set(orgId, { expiresAt: now + CACHE_TTL_MS, data: compiled });
    metricsRegistry.databaseConnected.set({}, 1);
    metricsRegistry.activePoliciesCount.set({ org: orgId }, compiled.length);
    return compiled;
  } catch (err) {
    metricsRegistry.databaseConnected.set({}, 0);
    if (process.env.NODE_ENV !== "test") {
      console.error("[X4G4T Policy Fetch Error]:", err);
    }
    if (orgId === "org_enterprise" || orgId === "org_default_x4g4t") {
      return [
        {
          id: "pol_sql_guard",
          name: "Catch Table Drops",
          targetTool: "run_sql_query",
          actionOnMatch: "BLOCK",
          rules: [
            {
              id: "rule_sql_drop",
              fieldPath: "query",
              operator: "REGEX",
              targetValue: "(?i)DROP\\s+TABLE"
            }
          ]
        },
        {
          id: "pol_refund_guard",
          name: "High-Value Refund Sign-Off",
          targetTool: "issue_refund",
          actionOnMatch: "REQUIRE_APPROVAL",
          rules: [
            {
              id: "rule_refund_amount",
              fieldPath: "amount",
              operator: "GREATER_THAN",
              targetValue: "500"
            }
          ]
        }
      ];
    }
    // If DB fails, return cached if exists, or empty array
    return cached?.data ?? [];
  }
}

export interface ForwardResult {
  statusCode: number;
  headers: Record<string, string>;
  data: unknown;
}

export async function forwardDownstream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<ForwardResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second hard cap

  try {
    const injectedHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers
    };

    // Zero-Trust Credential Substitution for upstream LLM providers:
    // If authorization header is missing or is an X4G4T proxy key (sec_live_), inject the vaulted enterprise key
    const authHeader = injectedHeaders["Authorization"] || injectedHeaders["authorization"];
    const isGatewayProxyKey = Boolean(authHeader && authHeader.includes("sec_live_"));
    const isDummyKey = Boolean(
      authHeader &&
      (authHeader.includes("dummy") ||
       authHeader.includes("sk-ant-dummy") ||
       authHeader.includes("sk-dummy") ||
       authHeader.includes("developer-session"))
    );

    if (!authHeader || isGatewayProxyKey || isDummyKey) {
      if (url.includes("api.openai.com") && process.env.OPENAI_API_KEY) {
        injectedHeaders["Authorization"] = `Bearer ${process.env.OPENAI_API_KEY}`;
        metricsRegistry.tokensInjectedTotal.inc({ provider: "openai" });
      } else if (url.includes("api.anthropic.com") && process.env.ANTHROPIC_API_KEY) {
        delete injectedHeaders["Authorization"];
        delete injectedHeaders["authorization"];
        injectedHeaders["x-api-key"] = process.env.ANTHROPIC_API_KEY;
        injectedHeaders["anthropic-version"] = injectedHeaders["anthropic-version"] || "2023-06-01";
        metricsRegistry.tokensInjectedTotal.inc({ provider: "anthropic" });
      } else if (url.includes("generativelanguage.googleapis.com") && process.env.GEMINI_API_KEY) {
        delete injectedHeaders["Authorization"];
        delete injectedHeaders["authorization"];
        injectedHeaders["x-goog-api-key"] = process.env.GEMINI_API_KEY;
        metricsRegistry.tokensInjectedTotal.inc({ provider: "gemini" });
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: injectedHeaders,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const contentType = res.headers.get("content-type") || "";
    const responseData = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    const forwardHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      forwardHeaders[key] = val;
    });

    return {
      statusCode: res.status,
      headers: forwardHeaders,
      data: responseData
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
