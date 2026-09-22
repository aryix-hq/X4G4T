import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { CompiledPolicy } from "@x4g4t/policy-engine";

describe("Model Context Protocol (MCP) Router (/v1/gateway/mcp)", () => {
  const app = buildApp();
  const TEST_ORG_ID = "org_mcp_test";
  const TEST_KEY_ID = "key_mcp_test";
  const TEST_TOKEN = "sec_live_mcp_token_987654321";
  const TARGET_MCP_URL = "https://mcp-server.internal.corp/rpc";

  const mockPolicies: CompiledPolicy[] = [
    {
      id: "pol_sql_guard",
      name: "Catch Table Drops",
      targetTool: "run_sql_query",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_drop_regex",
          fieldPath: "query",
          operator: "REGEX",
          targetValue: "(?i)DROP\\s+TABLE"
        }
      ]
    },
    {
      id: "pol_hitl_payout",
      name: "Require Approval For Large Vendor Payout",
      targetTool: "vendor_payout",
      actionOnMatch: "REQUIRE_APPROVAL",
      rules: [
        {
          id: "rule_total_gt_1000",
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

  it("should reject unauthenticated calls (401 UNAUTHORIZED)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      }
    });

    expect(res.statusCode).toBe(401);
  });

  it("should reject malformed JSON-RPC 2.0 payloads (code -32600)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-target-mcp-url": TARGET_MCP_URL
      },
      payload: {
        // Missing jsonrpc: "2.0"
        id: 1,
        method: "tools/list"
      }
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32600);
  });

  it("should reject requests without X-Target-MCP-URL header (code -32602)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list"
      }
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("should pass-through discovery frames (tools/list) without policy check", async () => {
    const mockUpstreamResponse = {
      jsonrpc: "2.0",
      id: 3,
      result: {
        tools: [
          { name: "run_sql_query", description: "Execute SQL statement" },
          { name: "vendor_payout", description: "Trigger vendor payout" }
        ]
      }
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockUpstreamResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-target-mcp-url": TARGET_MCP_URL
      },
      payload: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(mockUpstreamResponse);
  });

  it("should BLOCK dangerous tools/call and return JSON-RPC error -32001", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-target-mcp-url": TARGET_MCP_URL,
        "x-agent-id": "claude-desktop-client"
      },
      payload: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "run_sql_query",
          arguments: {
            query: "DROP TABLE users;"
          }
        }
      }
    });

    expect(res.statusCode).toBe(200); // JSON-RPC errors return HTTP 200
    const body = res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(4);
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toContain("Catch Table Drops");
    expect(body.error.data.tool).toBe("run_sql_query");
    expect(body.error.data.policyId).toBe("pol_sql_guard");
  });

  it("should HOLD high-impact tools/call and return approval card result", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-target-mcp-url": TARGET_MCP_URL
      },
      payload: {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "vendor_payout",
          arguments: {
            total: 2500,
            vendorId: "v_100"
          }
        }
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(5);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("[X4G4T HELD]");
  });

  it("should forward compliant tools/call to upstream MCP server", async () => {
    const mockMcpSuccess = {
      jsonrpc: "2.0",
      id: 6,
      result: {
        content: [{ type: "text", text: "Query executed successfully: 12 rows returned." }]
      }
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockMcpSuccess), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "x-target-mcp-url": TARGET_MCP_URL
      },
      payload: {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "run_sql_query",
          arguments: {
            query: "SELECT id, name FROM users LIMIT 10;"
          }
        }
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(mockMcpSuccess);
  });
});

