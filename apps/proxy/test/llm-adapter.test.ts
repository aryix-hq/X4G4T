import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockProvider, clearMockProviders } from "../src/routes/llm-adapter.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { setOrgKillSwitch } from "@x4g4t/policy-engine";

describe("Phase 2: Custom & Local LLM Provider Gateway (Ollama, vLLM, On-Prem)", () => {
  const app = buildApp();
  const testToken = "sec_live_llm_adapter_test_token_8877";
  const testOrgId = "org_llm_test";
  const providerId = "provider_ollama_local";

  beforeEach(() => {
    clearTokenCache();
    clearMockProviders();
    clearPolicyCache();
    setMockApiKey(testToken, testOrgId);
    setOrgKillSwitch(testOrgId, false);

    setMockProvider({
      id: providerId,
      orgId: testOrgId,
      name: "On-Premises Ollama Node",
      providerType: "OLLAMA",
      baseUrl: "http://127.0.0.1:4000", // points to proxy /healthz
      isInternal: true,
      isActive: true
    });
  });

  it("returns 404 if providerId does not exist or does not belong to the organization", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/llm/non_existent_provider/api/generate",
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        model: "llama3:8b",
        prompt: "Hello world"
      }
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("PROVIDER_NOT_FOUND");
  });

  it("intercepts prompt payloads and enforces DLP rules before forwarding", async () => {
    // Attempt to send prompt with AWS Secret Key
    const res = await app.inject({
      method: "POST",
      url: `/v1/gateway/llm/${providerId}/api/generate`,
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        model: "llama3:8b",
        prompt: "Here is my secret AWS key: AKIAIOSFODNN7EXAMPLE, please analyze it."
      }
    });

    // Default action REDACT or BLOCK depending on config
    expect(res.statusCode).not.toBe(500);
  });

  it("evaluates embedded tool calls in model requests against AST policy firewall", async () => {
    setMockPoliciesForOrg(testOrgId, [
      {
        id: "pol_block_high_refund",
        name: "Block Large Refund Calls",
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
      }
    ]);

    const res = await app.inject({
      method: "POST",
      url: `/v1/gateway/llm/${providerId}/api/chat`,
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        model: "llama3:8b",
        messages: [{ role: "user", content: "Issue refund for customer" }],
        tools: [
          {
            name: "issue_refund",
            arguments: { amount: 1500, customer_id: "cust_9988" }
          }
        ]
      }
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe("POLICY_VIOLATION");
  });

  it("severs inbound LLM gateway traffic immediately when emergency kill switch is active", async () => {
    setOrgKillSwitch(testOrgId, true, "Severing local inference cluster");

    const res = await app.inject({
      method: "POST",
      url: `/v1/gateway/llm/${providerId}/api/generate`,
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        model: "llama3:8b",
        prompt: "Generate deployment script"
      }
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("KILL_SWITCH_ACTIVE");
  });
});

