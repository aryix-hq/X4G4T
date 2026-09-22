import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { clearInMemoryRateLimits } from "@x4g4t/policy-engine";

describe("Proxy Gateway - Rate Limiting, DLP & Reverse Authentication", () => {
  const app = buildApp();
  const TEST_ORG_ID = "org_enterprise_test";
  const TEST_KEY_ID = "key_test_corp";
  const TEST_TOKEN = "sec_live_corp_token_12345678";

  beforeEach(() => {
    clearTokenCache();
    clearPolicyCache();
    clearInMemoryRateLimits();
    setMockApiKey(TEST_TOKEN, TEST_ORG_ID, TEST_KEY_ID);
    setMockPoliciesForOrg(TEST_ORG_ID, []);
    process.env.ALLOW_LOCAL_DOWNSTREAM = "true";
  });

  afterEach(() => {
    delete process.env.DLP_DEFAULT_ACTION;
    delete process.env.ALLOW_LOCAL_DOWNSTREAM;
  });

  it("should enforce sliding window rate limiting and return HTTP 429 with headers", async () => {
    // Inject mock downstream fetch
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true }),
      text: async () => JSON.stringify({ success: true })
    } as unknown as Response);

    // Make 100 requests to reach the default limit
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${TEST_TOKEN}`
        },
        payload: {
          agent_id: "agent_quota_test",
          tool_name: "fetch_data",
          arguments: { query: "test" },
          downstream_url: "https://httpbin.org/post"
        }
      });
      expect(res.statusCode).toBe(200);
    }

    // 101st request should be rate limited with HTTP 429
    const rateLimitedRes = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        agent_id: "agent_quota_test",
        tool_name: "fetch_data",
        arguments: { query: "test" },
        downstream_url: "https://httpbin.org/post"
      }
    });

    expect(rateLimitedRes.statusCode).toBe(429);
    expect(rateLimitedRes.headers["x-ratelimit-limit"]).toBe("100");
    expect(rateLimitedRes.headers["x-ratelimit-remaining"]).toBe("0");
    expect(rateLimitedRes.headers["retry-after"]).toBeDefined();

    const body = JSON.parse(rateLimitedRes.payload);
    expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");

    fetchSpy.mockRestore();
  });

  it("should block requests with HTTP 422 when DLP_DEFAULT_ACTION=BLOCK and secrets are detected", async () => {
    process.env.DLP_DEFAULT_ACTION = "BLOCK";

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        agent_id: "agent_dlp_test",
        tool_name: "upload_credentials",
        arguments: {
          aws_key: "AKIAIOSFODNN7EXAMPLE",
          note: "Production cloud credentials"
        },
        downstream_url: "https://httpbin.org/post"
      }
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe("DLP_VIOLATION");
    expect(body.error.message).toContain("DLP Violation");
    expect(body.error.violations).toBeDefined();
    expect(body.error.violations[0].type).toBe("AWS_ACCESS_KEY");
  });

  it("should redact sensitive data before downstream forward when DLP_DEFAULT_ACTION=REDACT", async () => {
    process.env.DLP_DEFAULT_ACTION = "REDACT";

    let forwardedBody: any = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      forwardedBody = JSON.parse((init?.body as string) || "{}");
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "ok" }),
        text: async () => JSON.stringify({ status: "ok" })
      } as unknown as Response;
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      },
      payload: {
        agent_id: "agent_dlp_redact",
        tool_name: "send_payment",
        arguments: {
          card_number: "4532-0150-1234-5671", // Luhn valid
          email: "employee@enterprise.com",
          memo: "Software renewal"
        },
        downstream_url: "https://httpbin.org/post"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(forwardedBody).toBeDefined();
    expect(forwardedBody.card_number).toContain("[REDACTED_PII:CREDIT_CARD]");
    expect(forwardedBody.email).toContain("[REDACTED_PII:EMAIL]");
    expect(forwardedBody.memo).toBe("Software renewal");

    fetchSpy.mockRestore();
  });

  it("should authenticate reverse auth requests with dummy IDE tokens from corporate IP", async () => {
    let capturedHeaders: any = null;
    process.env.OPENAI_API_KEY = "sk-corp-master-openai-key-998811";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers;
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ model: "gpt-4o", choices: [] }),
        text: async () => JSON.stringify({ model: "gpt-4o", choices: [] })
      } as unknown as Response;
    });

    // Developer sends request with dummy IDE key from localhost / corporate IP
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: "Bearer sk-ant-dummy-developer-token"
      },
      payload: {
        agent_id: "cursor-ide-agent",
        tool_name: "chat_completion",
        arguments: { prompt: "Explain AST evaluation" },
        downstream_url: "https://api.openai.com/v1/chat/completions"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(capturedHeaders).toBeDefined();
    // Dummy key is stripped, vaulted enterprise master key is injected
    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-corp-master-openai-key-998811");

    delete process.env.OPENAI_API_KEY;
    fetchSpy.mockRestore();
  });
});

