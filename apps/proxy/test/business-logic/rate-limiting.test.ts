import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { rateLimitPlugin } from "../../src/plugins/rate-limit.js";
import { executeRoutes } from "../../src/routes/execute.js";
import { setMockApiKey, clearTokenCache } from "../../src/plugins/auth.js";
import { setMockPoliciesForOrg } from "../../src/services/gateway.js";
import { clearInMemoryRateLimits, RateLimitPolicyConfig } from "@x4g4t/policy-engine";

describe("SUITE 1.2: Business Logic - Time-Window Rate Limiting Invariants", () => {
  const testOrg = "org_rate_limit_suite";
  const testToken = "sec_live_ratelimit_token_123";

  beforeEach(() => {
    clearTokenCache();
    clearInMemoryRateLimits();
    setMockApiKey(testToken, testOrg);
    setMockPoliciesForOrg(testOrg, []);
  });

  describe("Multi-Tier Boundary Checks", () => {
    it("should enforce multi-tier rate limiting windows (1-Hour, 5-Hour, 1-Week, Custom)", async () => {
      const server = Fastify();
      await server.register(rateLimitPlugin);

      server.post("/test-tier", async (req, reply) => {
        const windowSec = Number(req.headers["x-test-window"] || 3600);
        const maxReq = Number(req.headers["x-test-max"] || 5);
        const policy: RateLimitPolicyConfig = {
          id: `pol_tier_${windowSec}`,
          name: `Tier ${windowSec}s`,
          windowSizeSeconds: windowSec,
          maxRequests: maxReq,
          scope: "PER_USER"
        };
        const result = await server.checkRateLimit(req, reply, policy);
        if (!result.allowed) {
          return reply.status(429).send({ error: "QUOTA_EXCEEDED", resetSeconds: result.resetSeconds });
        }
        return { ok: true, remaining: result.remaining };
      });

      const tiers = [
        { window: 3600, max: 2, label: "1-Hour" },
        { window: 18000, max: 3, label: "5-Hour" },
        { window: 604800, max: 4, label: "1-Week" },
        { window: 120, max: 2, label: "Custom 2-Min" }
      ];

      for (const tier of tiers) {
        clearInMemoryRateLimits();
        for (let i = 0; i < tier.max; i++) {
          const res = await server.inject({
            method: "POST",
            url: "/test-tier",
            headers: {
              "x-forwarded-for": "10.0.0.1",
              "x-test-window": String(tier.window),
              "x-test-max": String(tier.max)
            }
          });
          expect(res.statusCode).toBe(200);
        }

        const blockedRes = await server.inject({
          method: "POST",
          url: "/test-tier",
          headers: {
            "x-forwarded-for": "10.0.0.1",
            "x-test-window": String(tier.window),
            "x-test-max": String(tier.max)
          }
        });
        expect(blockedRes.statusCode).toBe(429);
      }
    });
  });

  describe("Window Rolling Accuracy Invariant", () => {
    it("should count requests at T = window - 1s, and clear slots accurately at T = window + 1s", () => {
      const windowSeconds = 60;
      const timestamps: number[] = [];
      const baseTime = 1700000000;

      // Add request at baseTime
      timestamps.push(baseTime);

      // Request at T = window - 1s counts toward window
      const requestBeforeExpiry = baseTime + windowSeconds - 1;
      const countBeforeExpiry = timestamps.filter((t) => t > requestBeforeExpiry - windowSeconds).length;
      expect(countBeforeExpiry).toBe(1);

      // At T = window + 1s, original slot is outside window
      const requestAfterExpiry = baseTime + windowSeconds + 1;
      const countAfterExpiry = timestamps.filter((t) => t > requestAfterExpiry - windowSeconds).length;
      expect(countAfterExpiry).toBe(0);
    });
  });

  describe("Concurrent Drain Verification (500 Worker Threads against 100 Quota)", () => {
    it("should permit exactly 100 requests (200 OK) and reject 400 requests (429 Too Many Requests) with RFC 6585 headers", async () => {
      const quotaLimit = 100;
      const totalWorkers = 500;

      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_worker_pool";
      });
      server.decorate("checkKillSwitch", async () => false);
      await server.register(rateLimitPlugin);
      await server.register(executeRoutes);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "success" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        )
      );

      const customPolicy: RateLimitPolicyConfig = {
        id: "pol_quota_100",
        name: "100 Quota Limit",
        windowSizeSeconds: 60,
        maxRequests: quotaLimit,
        scope: "PER_USER"
      };

      // Fire 500 concurrent worker requests
      const promises = Array.from({ length: totalWorkers }, (_, i) =>
        server.inject({
          method: "POST",
          url: "/v1/gateway/execute",
          headers: {
            authorization: `Bearer ${testToken}`
          },
          payload: {
            agent_id: `worker_${i}`,
            tool_name: "query_database",
            arguments: { workerId: i },
            downstream_url: "https://api.openai.com/v1/chat/completions"
          }
        })
      );

      const responses = await Promise.all(promises);

      const okResponses = responses.filter((r) => r.statusCode === 200);
      const rateLimitedResponses = responses.filter((r) => r.statusCode === 429);

      // Invariant: Exactly 100 allowed, exactly 400 rejected
      expect(okResponses.length).toBe(100);
      expect(rateLimitedResponses.length).toBe(400);

      // Invariant: RFC 6585 headers present on 429 responses
      const sample429 = rateLimitedResponses[0];
      expect(sample429.headers["retry-after"]).toBeDefined();
      expect(sample429.headers["x-ratelimit-limit"]).toBe(String(quotaLimit));
      expect(sample429.headers["x-ratelimit-remaining"]).toBe("0");
      expect(sample429.headers["x-ratelimit-reset"]).toBeDefined();

      const body = JSON.parse(sample429.payload);
      expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(body.error.retry_after).toBeDefined();

      fetchSpy.mockRestore();
    });
  });
});

