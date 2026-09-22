import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { CompiledPolicy } from "@x4g4t/policy-engine";

describe("X4G4T End-to-End Lifecycle Verification", () => {
  const app = buildApp();
  const TEST_ORG = "org_e2e_enterprise";
  const TEST_KEY = "sec_live_e2e_master_token_123456";

  const activePolicies: CompiledPolicy[] = [
    {
      id: "pol_max_refund",
      name: "Enforce Max Refund Threshold",
      targetTool: "issue_refund",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_amount_limit",
          fieldPath: "amount",
          operator: "GREATER_THAN",
          targetValue: "500"
        }
      ]
    },
    {
      id: "pol_approval_gate",
      name: "Gate Production Deployments",
      targetTool: "deploy_service",
      actionOnMatch: "REQUIRE_APPROVAL",
      rules: [
        {
          id: "rule_env_prod",
          fieldPath: "environment",
          operator: "EQUALS",
          targetValue: "production"
        }
      ]
    }
  ];

  beforeEach(() => {
    clearTokenCache();
    clearPolicyCache();
    setMockApiKey(TEST_KEY, TEST_ORG);
    setMockPoliciesForOrg(TEST_ORG, activePolicies);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("E2E Step 1: Blocks dangerous payload breaching configured policy (422)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_KEY}`,
        "x-agent-id": "autonomous_refund_bot"
      },
      payload: {
        agent_id: "autonomous_refund_bot",
        tool_name: "issue_refund",
        arguments: { amount: 5000, customerId: "cust_bad_actor" },
        downstream_url: "https://api.stripe.com/v1/refunds"
      }
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("POLICY_VIOLATION");
    expect(body.error.details.tool).toBe("issue_refund");
    expect(body.error.details.policy_id).toBe("pol_max_refund");
  });

  it("E2E Step 2: Processes compliant tool call and proxies downstream (200)", async () => {
    const mockDownstreamSuccess = {
      refund_id: "re_991823749",
      amount: 45,
      status: "succeeded"
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockDownstreamSuccess), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_KEY}`,
        "x-agent-id": "autonomous_refund_bot"
      },
      payload: {
        agent_id: "autonomous_refund_bot",
        tool_name: "issue_refund",
        arguments: { amount: 45, customerId: "cust_legit_user" },
        downstream_url: "https://api.stripe.com/v1/refunds"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(mockDownstreamSuccess);
  });

  it("E2E Step 3: Suspends high-impact production action for human review (202 HELD)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_KEY}`,
        "x-agent-id": "ci_cd_deployment_agent"
      },
      payload: {
        agent_id: "ci_cd_deployment_agent",
        tool_name: "deploy_service",
        arguments: { service: "auth-api", environment: "production", version: "v2.0.0" },
        downstream_url: "https://api.k8s.internal/deploy"
      }
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe("HELD");
    expect(body.hold_id).toBeDefined();
    expect(body.retry_after_sec).toBe(5);
  });
});

