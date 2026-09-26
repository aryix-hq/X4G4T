import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { rateLimitPlugin } from "../../src/plugins/rate-limit.js";
import {
  getCompiledPoliciesForOrg,
  setMockPoliciesForOrg,
  setDbClient
} from "../../src/services/gateway.js";
import {
  enqueueAuditLog,
  getFallbackAuditLogs,
  clearFallbackAuditLogs,
  AuditLogJobPayload
} from "../../src/services/queue.js";
import { evaluateAgentExecution } from "@x4g4t/policy-engine";

describe("SUITE 4.2: Chaos, Resilience & Fail-Safe - Upstream Outage & Fallbacks", () => {
  describe("1. Redis Connection Severing & In-Memory Rate Limiting Failover", () => {
    it("should gracefully fall back to in-memory sliding window when Redis is severed", async () => {
      const server = Fastify();
      await server.register(rateLimitPlugin);

      server.post("/test-rate-limit", async (req, reply) => {
        const res = await server.checkRateLimit(req, reply, {
          id: "pol_chaos_redis",
          name: "Chaos Rate Limit",
          windowSizeSeconds: 60,
          maxRequests: 3,
          scope: "PER_USER"
        });
        if (!res.allowed) {
          return reply.status(429).send({ error: "RATE_LIMITED", resetSeconds: res.resetSeconds });
        }
        return { status: "OK", remaining: res.remaining };
      });

      const responses = [];
      for (let i = 0; i < 5; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/test-rate-limit",
          headers: {
            "x-forwarded-for": "198.51.100.1"
          }
        });
        responses.push(res);
      }

      for (const res of responses) {
        expect(res.statusCode).not.toBe(500);
      }

      expect(responses[0].statusCode).toBe(200);
      expect(responses[1].statusCode).toBe(200);
      expect(responses[2].statusCode).toBe(200);

      expect(responses[3].statusCode).toBe(429);
      expect(responses[4].statusCode).toBe(429);
    });

    it("should produce zero 500 errors during a high-concurrency Redis network partition", async () => {
      const server = Fastify();
      await server.register(rateLimitPlugin);

      server.get("/probe", async (req, reply) => {
        const check = await server.checkRateLimit(req, reply, {
          id: "pol_chaos_probe",
          name: "Chaos Probe Limit",
          windowSizeSeconds: 10,
          maxRequests: 100,
          scope: "PER_IP"
        });
        if (!check.allowed) {
          return reply.status(429).send({ error: "LIMIT" });
        }
        return { ok: true };
      });

      const burst = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          server.inject({
            method: "GET",
            url: "/probe",
            headers: { "x-forwarded-for": `203.0.113.${(i % 10) + 1}` }
          })
        )
      );

      const status500s = burst.filter((r) => r.statusCode === 500);
      expect(status500s.length).toBe(0);
      expect(burst.every((r) => r.statusCode === 200 || r.statusCode === 429)).toBe(true);
    });
  });

  describe("2. Postgres Connection Starvation & Policy Memory Fallback", () => {
    it("should maintain continuous policy evaluation when Postgres connection pool is starved (N = 0)", async () => {
      const orgId = "org_chaos_starvation_test";

      setMockPoliciesForOrg(orgId, [
        {
          id: "pol_starvation_block_drop",
          name: "Starvation Drop Defense",
          targetTool: "run_sql",
          actionOnMatch: "BLOCK",
          rules: [
            {
              id: "rule_1",
              fieldPath: "query",
              operator: "REGEX",
              targetValue: "(?i)DROP\\s+DATABASE"
            }
          ]
        }
      ]);

      const starvedDbMock = {
        select: vi.fn().mockImplementation(() => {
          throw new Error("PoolExhaustedError: max connections reached (N = 0 available, queued requests = 1000)");
        })
      };
      setDbClient(starvedDbMock);

      const activePolicies = await getCompiledPoliciesForOrg(orgId);
      expect(activePolicies).toHaveLength(1);
      expect(activePolicies[0].id).toBe("pol_starvation_block_drop");

      const evalSafe = evaluateAgentExecution(activePolicies, {
        toolName: "run_sql",
        arguments: { query: "SELECT * FROM users" }
      });
      expect(evalSafe.verdict).toBe("ALLOW");

      const evalViolating = evaluateAgentExecution(activePolicies, {
        toolName: "run_sql",
        arguments: { query: "DROP DATABASE production" }
      });
      expect(evalViolating.verdict).toBe("BLOCK");
    });
  });

  describe("3. Telemetry Queue Outage & In-Memory Failover Buffer", () => {
    beforeEach(() => {
      clearFallbackAuditLogs();
    });

    it("should buffer security audit events in-memory when Redis queue is unreachable", async () => {
      const mockEvent: AuditLogJobPayload = {
        orgId: "org_defense_grade",
        agentId: "agent_chaos_1",
        toolName: "execute_transfer",
        arguments: { amount: 1000000 },
        verdict: "BLOCKED",
        triggeredPolicyId: "pol_wire_fraud",
        latencyMs: 12,
        createdAt: new Date().toISOString()
      };

      await enqueueAuditLog(mockEvent);

      const fallbackLogs = getFallbackAuditLogs();
      expect(fallbackLogs.length).toBeGreaterThanOrEqual(1);
      expect(fallbackLogs[0].triggeredPolicyId).toBe("pol_wire_fraud");
      expect(fallbackLogs[0].verdict).toBe("BLOCKED");
    });
  });
});
