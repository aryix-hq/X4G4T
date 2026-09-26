import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { getInMemoryShadowStats, clearInMemoryShadowStats } from "../src/services/shadow.js";
import { setOrgKillSwitch } from "@x4g4t/policy-engine";

describe("Phase 3: Policy Shadow / Learning Mode (Counterfactual Testing)", () => {
  const app = buildApp();
  const testToken = "sec_live_shadow_test_token_9999";
  const testOrgId = "org_shadow_test";
  const candidatePolicyId = "pol_shadow_candidate_refund";

  beforeEach(() => {
    clearTokenCache();
    clearPolicyCache();
    clearInMemoryShadowStats();
    setMockApiKey(testToken, testOrgId);
    setOrgKillSwitch(testOrgId, false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT block live traffic when policy is in SHADOW_LEARN mode, but records counterfactual metric", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "success", tx_id: "tx_99" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    setMockPoliciesForOrg(testOrgId, [
      {
        id: candidatePolicyId,
        name: "Shadow Test: Limit Wire Transfers to $5000",
        targetTool: "wire_transfer",
        actionOnMatch: "BLOCK",
        mode: "SHADOW_LEARN",
        rules: [
          {
            id: "rule_wire_5k",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "5000"
          }
        ]
      }
    ]);

    // Send transaction with amount = 8500 (would have violated rule)
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        agent_id: "agent_finance_01",
        tool_name: "wire_transfer",
        arguments: { amount: 8500, recipient: "Vendor ACME" },
        downstream_url: "http://127.0.0.1:4000/healthz"
      }
    });

    // CRITICAL: Request must NOT be blocked! It passes downstream uninterrupted.
    expect(res.statusCode).toBe(200);

    // Verify counterfactual metric recorded in shadow analytics
    const stats = getInMemoryShadowStats(candidatePolicyId);
    expect(stats.totalEvaluated).toBe(1);
    expect(stats.wouldHaveBlocked).toBe(1);
    expect(stats.wouldHavePassed).toBe(0);
    expect(stats.blockRatePercent).toBe(100);
  });

  it("enforces blocking once policy mode is promoted to ACTIVE", async () => {
    setMockPoliciesForOrg(testOrgId, [
      {
        id: candidatePolicyId,
        name: "Enforced Wire Cap",
        targetTool: "wire_transfer",
        actionOnMatch: "BLOCK",
        mode: "ACTIVE",
        rules: [
          {
            id: "rule_wire_5k",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "5000"
          }
        ]
      }
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        agent_id: "agent_finance_01",
        tool_name: "wire_transfer",
        arguments: { amount: 8500, recipient: "Vendor ACME" },
        downstream_url: "http://127.0.0.1:4000/healthz"
      }
    });

    // In ACTIVE mode, must block with HTTP 422
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("POLICY_VIOLATION");
  });

  it("ignores policies when mode is DISABLED", async () => {
    setMockPoliciesForOrg(testOrgId, [
      {
        id: candidatePolicyId,
        name: "Disabled Wire Cap",
        targetTool: "wire_transfer",
        actionOnMatch: "BLOCK",
        mode: "DISABLED",
        rules: [
          {
            id: "rule_wire_5k",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "5000"
          }
        ]
      }
    ]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        agent_id: "agent_finance_01",
        tool_name: "wire_transfer",
        arguments: { amount: 99999 },
        downstream_url: "http://127.0.0.1:4000/healthz"
      }
    });

    expect(res.statusCode).toBe(200);
    const stats = getInMemoryShadowStats(candidatePolicyId);
    expect(stats.totalEvaluated).toBe(0);
  });
});
