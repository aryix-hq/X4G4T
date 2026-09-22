import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/v1/gateway/execute/route.js";
import {
  setMockApiKey,
  clearTokenCache,
  setMockPoliciesForOrg,
  clearMockPolicies
} from "../lib/gateway-mocks.js";
import { NextRequest } from "next/server";
import { setMockTenantContext } from "../lib/tenant.js";

// Mock @vercel/functions
vi.mock("@vercel/functions", () => ({
  waitUntil: vi.fn((promise) => {
    if (promise && typeof promise.then === "function") {
      promise.catch(() => {});
    }
  })
}));

describe("Next.js Serverless Gateway Endpoint (/api/v1/gateway/execute)", () => {
  const TEST_ORG_ID = "org_serverless_test";
  const TEST_RAW_KEY = "sec_live_serverless_token_1234567890";

  beforeEach(() => {
    vi.restoreAllMocks();
    clearTokenCache();
    clearMockPolicies();
    setMockApiKey(TEST_RAW_KEY, TEST_ORG_ID);
    setMockTenantContext({
      orgId: TEST_ORG_ID,
      userId: "user_test_123",
      orgName: "Serverless Org",
      role: "admin"
    });
  });

  it("should return 401 UNAUTHORIZED when Authorization header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/gateway/execute", {
      method: "POST",
      body: JSON.stringify({
        agent_id: "test_bot",
        tool_name: "issue_refund",
        arguments: { amount: 50 },
        downstream_url: "https://api.stripe.com/v1/refunds"
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("should return 400 on malformed JSON payload", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/gateway/execute", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_RAW_KEY}`
      },
      body: "not_a_valid_json"
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("should return 400 when missing required fields (agent_id, tool_name, etc.)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/gateway/execute", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_RAW_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // agent_id missing
        tool_name: "issue_refund",
        arguments: { amount: 50 },
        downstream_url: "https://api.stripe.com/v1/refunds"
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("should return 422 POLICY_VIOLATION when tool call breaches policy", async () => {
    setMockPoliciesForOrg(TEST_ORG_ID, [
      {
        id: "pol_max_refund",
        name: "Max Refund Cap",
        targetTool: "issue_refund",
        actionOnMatch: "BLOCK",
        rules: [
          {
            id: "rule_1",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "100"
          }
        ]
      }
    ]);

    const req = new NextRequest("http://localhost:3000/api/v1/gateway/execute", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_RAW_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: "agent_support",
        tool_name: "issue_refund",
        arguments: { amount: 250 },
        downstream_url: "https://api.stripe.com/v1/refunds"
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("POLICY_VIOLATION");
    expect(body.error.details.tool).toBe("issue_refund");
  });

  it("should return 200 OK and forward downstream on compliant tool call", async () => {
    const downstreamPayload = { refund_id: "re_12345", status: "succeeded" };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(downstreamPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const req = new NextRequest("http://localhost:3000/api/v1/gateway/execute", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_RAW_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: "agent_support",
        tool_name: "issue_refund",
        arguments: { amount: 50 },
        downstream_url: "https://api.stripe.com/v1/refunds"
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(downstreamPayload);
  });
});

