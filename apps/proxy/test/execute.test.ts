import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { CompiledPolicy } from "@x4g4t/policy-engine";
import { approveMockHitlRecord } from "../src/routes/hitl-poll.js";

describe("Fastify Proxy Ingestion Engine (/v1/gateway/execute)", () => {
  const app = buildApp();
  const TEST_ORG_ID = "org_test_123";
  const TEST_KEY_ID = "key_test_123";
  const TEST_TOKEN = "sec_live_test_secret_token_12345678";

  const mockPolicies: CompiledPolicy[] = [
    {
      id: "pol_refund_cap",
      name: "Refund Limit Policy",
      targetTool: "issue_refund",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_amt_gt_250",
          fieldPath: "amount",
          operator: "GREATER_THAN",
          targetValue: "250"
        }
      ]
    },
    {
      id: "pol_payout_approval",
      name: "High Value Vendor Payout",
      targetTool: "vendor_payout",
      actionOnMatch: "REQUIRE_APPROVAL",
      rules: [
        {
          id: "rule_payout_gt_1000",
          fieldPath: "total",
          operator: "GREATER_THAN_OR_EQUAL",
          targetValue: "1000"
        }
      ]
    }
  ];

  beforeEach(() => {
    clearTokenCache();
    clearPolicyCache();
    setMockApiKey(TEST_TOKEN, TEST_ORG_ID, TEST_KEY_ID);
    setMockPoliciesForOrg(TEST_ORG_ID, mockPolicies);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 200 on /healthz", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/healthz"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("should reject requests without Bearer authorization (401 UNAUTHORIZED)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      payload: {
        agent_id: "agent_1",
        tool_name: "issue_refund",
        arguments: { amount: 100 },
        downstream_url: "https://httpbin.org/post"
      }
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("should reject requests with invalid/revoked API keys (401 INVALID_API_KEY)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: "Bearer sec_live_unknown_token_99999"
      },
      payload: {
        agent_id: "agent_1",
        tool_name: "issue_refund",
        arguments: { amount: 100 },
        downstream_url: "https://httpbin.org/post"
      }
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe("INVALID_API_KEY");
  });

  it("should reject malformed payloads with 400 BAD_REQUEST", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        agent_id: "agent_1",
        // tool_name is missing
        arguments: { amount: 100 },
        downstream_url: "not-a-valid-url"
      }
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("should BLOCK dangerous tool calls breaching threshold (422 POLICY_VIOLATION)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-agent-id": "agent_support_bot"
      },
      payload: {
        agent_id: "agent_support_bot",
        tool_name: "issue_refund",
        arguments: { amount: 500, user_id: "usr_99" },
        downstream_url: "https://api.stripe.com/v1/refunds"
      }
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("POLICY_VIOLATION");
    expect(body.error.details.tool).toBe("issue_refund");
    expect(body.error.details.policy_id).toBe("pol_refund_cap");
    expect(body.error.details.rule_id).toBe("rule_amt_gt_250");
  });

  it("should HOLD high-impact tool calls requiring human approval (202 Accepted)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-agent-id": "agent_finance_bot"
      },
      payload: {
        agent_id: "agent_finance_bot",
        tool_name: "vendor_payout",
        arguments: { total: 1500, vendor_id: "vnd_44" },
        downstream_url: "https://api.finance.corp/payouts"
      }
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe("HELD");
    expect(body.hold_id).toBeDefined();
    expect(body.retry_after_sec).toBe(5);
  });

  it("should ALLOW compliant tool calls and forward downstream (200 OK)", async () => {
    // Mock global fetch to simulate downstream SaaS
    const mockDownstreamData = { id: "re_123", status: "succeeded", amount: 150 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockDownstreamData), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-agent-id": "agent_support_bot"
      },
      payload: {
        agent_id: "agent_support_bot",
        tool_name: "issue_refund",
        arguments: { amount: 150, user_id: "usr_99" },
        downstream_url: "https://api.stripe.com/v1/refunds"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual(mockDownstreamData);
  });

  it("should return 504 DOWNSTREAM_TIMEOUT when target exceeds 8000ms deadline", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-agent-id": "agent_slow_bot"
      },
      payload: {
        agent_id: "agent_slow_bot",
        tool_name: "issue_refund",
        arguments: { amount: 50 },
        downstream_url: "https://api.slow-saas.corp/call"
      }
    });

    expect(res.statusCode).toBe(504);
    const body = res.json();
    expect(body.error.code).toBe("DOWNSTREAM_TIMEOUT");
  });

  it("should return 502 BAD_GATEWAY when downstream connection fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-agent-id": "agent_broken_bot"
      },
      payload: {
        agent_id: "agent_broken_bot",
        tool_name: "issue_refund",
        arguments: { amount: 50 },
        downstream_url: "https://unreachable.corp/call"
      }
    });

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.error.code).toBe("BAD_GATEWAY");
  });

  it("should reject SSRF attempts targeting cloud metadata (403 SSRF_BLOCKED)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        agent_id: "agent_attacker",
        tool_name: "issue_refund",
        arguments: { amount: 50 },
        downstream_url: "http://169.254.169.254/latest/meta-data/"
      }
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error.code).toBe("SSRF_BLOCKED");
  });

  it("should not allow client headers to spoof IAM roles", async () => {
    // Add a policy that blocks any caller with role 'admin' from running 'restricted_action'
    setMockPoliciesForOrg(TEST_ORG_ID, [
      {
        id: "pol_block_admin_demo",
        name: "Block Admin Demo",
        targetTool: "restricted_action",
        actionOnMatch: "BLOCK",
        rules: [
          {
            id: "rule_iam_admin",
            fieldPath: "iam.roles",
            operator: "CONTAINS",
            targetValue: "admin"
          }
        ]
      }
    ]);

    // Client sends X-IAM-Roles: admin, but the API key has roles: []
    // Because client headers are discarded, iam.roles remains [], so the policy is NOT matched
    const mockDownstreamData = { success: true };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockDownstreamData), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-iam-roles": "admin"
      },
      payload: {
        agent_id: "agent_tester",
        tool_name: "restricted_action",
        arguments: { action: "read" },
        downstream_url: "https://api.internal.corp/action"
      }
    });

    // Request is allowed because client cannot elevate or alter its roles via header
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(mockDownstreamData);
  });

  it("should allow polling HITL endpoint and receive execution response once approved", async () => {
    // 1. Trigger HITL hold
    const holdRes = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        agent_id: "agent_finance",
        tool_name: "vendor_payout",
        arguments: { total: 2000, vendor_id: "vnd_99" },
        downstream_url: "https://api.finance.corp/payouts"
      }
    });

    expect(holdRes.statusCode).toBe(202);
    const holdBody = holdRes.json();
    const holdId = holdBody.hold_id;
    expect(holdId).toBeDefined();

    // 2. Poll while PENDING
    const pendingPoll = await app.inject({
      method: "GET",
      url: `/v1/gateway/hitl/${holdId}`,
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      }
    });
    expect(pendingPoll.statusCode).toBe(202);
    expect(pendingPoll.json().status).toBe("PENDING");

    // 3. Simulate downstream execution upon admin approval
    const mockDownstreamResult = { payout_id: "po_123", status: "completed" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockDownstreamResult), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await approveMockHitlRecord(holdId, "admin_user_123");

    // 4. Poll after APPROVED
    const approvedPoll = await app.inject({
      method: "GET",
      url: `/v1/gateway/hitl/${holdId}`,
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      }
    });

    expect(approvedPoll.statusCode).toBe(200);
    const approvedBody = approvedPoll.json();
    expect(approvedBody.status).toBe("APPROVED");
    expect(approvedBody.reviewer).toBe("admin_user_123");
    expect(approvedBody.response).toEqual(mockDownstreamResult);
  });
});

