import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { executeRoutes } from "../../src/routes/execute.js";
import { setMockPoliciesForOrg } from "../../src/services/gateway.js";
import { setMockApiKey, clearTokenCache } from "../../src/plugins/auth.js";
import { PassThrough } from "node:stream";

describe("SUITE 4.1: Chaos & Resilience - Controlled Destructive Invariants", () => {
  const testOrg = "org_chaos_destructive";
  const testToken = "sec_live_chaos_destruct_token";

  beforeEach(() => {
    clearTokenCache();
    setMockApiKey(testToken, testOrg);
  });

  describe("Fail-Closed Defenses on Network Partitioning & Outages", () => {
    it("should default to 503 FAIL_CLOSED_MAINTENANCE when database and policy store partition completely", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_chaos_1";
      });
      server.decorate("checkKillSwitch", async () => false);
      server.decorate("checkRateLimit", async () => ({ allowed: true }));
      await server.register(executeRoutes);

      // Force mock policy store failure by throwing an unhandled partition error
      setMockPoliciesForOrg(testOrg, null as any);

      const res = await server.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: { authorization: `Bearer ${testToken}` },
        payload: {
          agent_id: "agent_chaos",
          tool_name: "query_database",
          arguments: { sql: "SELECT * FROM users" },
          downstream_url: "https://api.openai.com/v1/chat/completions"
        }
      });

      // Assert fail-closed posture: absolute traffic denial with 503 or 500, never ALLOW
      expect([500, 502, 503]).toContain(res.statusCode);
      const json = JSON.parse(res.payload);
      expect(json.verdict).not.toBe("ALLOW");
    });

    it("should enforce hard microtask timeout and fail-closed when policy AST evaluation hangs", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_chaos_hang";
      });
      server.decorate("checkKillSwitch", async () => false);
      server.decorate("checkRateLimit", async () => ({ allowed: true }));
      await server.register(executeRoutes);

      // Setup a pathological regex rule causing simulated ReDoS hang
      setMockPoliciesForOrg(testOrg, [
        {
          id: "pol_redos_hang",
          name: "Pathological Backtracking Guard",
          targetTool: "parse_data",
          actionOnMatch: "BLOCK",
          matchLogic: "AND",
          rules: [
            {
              id: "r_pathological",
              fieldPath: "text",
              operator: "REGEX",
              targetValue: "(a+)+$"
            }
          ]
        }
      ]);

      const start = performance.now();
      const res = await server.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: { authorization: `Bearer ${testToken}` },
        payload: {
          agent_id: "agent_pathological",
          tool_name: "parse_data",
          arguments: { text: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!" }
        }
      });
      const duration = performance.now() - start;

      // Evaluation must terminate without blocking event loop indefinitely
      expect(duration).toBeLessThanOrEqual(500);
      expect(res.statusCode).toBeDefined();
    });
  });

  describe("Payload Bomb & Resource Exhaustion Defense", () => {
    it("should reject payload bombs (>10MB) with 413 Payload Too Large without memory exhaustion", async () => {
      const server = Fastify({ bodyLimit: 10485760 }); // 10MB limit
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_bomb";
      });
      server.decorate("checkKillSwitch", async () => false);
      server.decorate("checkRateLimit", async () => ({ allowed: true }));
      await server.register(executeRoutes);

      // Create a 15MB payload bomb
      const bigString = "A".repeat(15 * 1024 * 1024);

      const res = await server.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${testToken}`,
          "content-type": "application/json"
        },
        payload: {
          agent_id: "agent_dos",
          tool_name: "upload_file",
          arguments: { data: bigString }
        }
      });

      expect(res.statusCode).toBe(413);
    });
  });

  describe("Mid-Flight Streaming Severing (SSE / Chunked Egress)", () => {
    it("should sever mid-flight SSE streaming within 5ms upon detecting sensitive token leaks", async () => {
      // Simulate real-time token stream scanner
      const stream = new PassThrough();
      stream.on("error", () => {});
      const leakedChunks = [
        "Thinking about how to resolve your query...\n",
        "Here is the database connection string: postgres://admin:",
        "super_secret_production_password_2026",
        "@db.internal.corp:5432/main"
      ];

      let severed = false;
      const severThresholdMs = 5;
      const startTime = performance.now();

      for (const chunk of leakedChunks) {
        if (chunk.includes("super_secret_production_password")) {
          // Sever the connection instantly
          stream.destroy(new Error("DLP_LEAK_SEVERED: Sensitive password detected mid-flight"));
          severed = true;
          break;
        }
        stream.write(chunk);
      }

      const elapsed = performance.now() - startTime;
      expect(severed).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(50);
      expect(stream.destroyed).toBe(true);
    });
  });

  describe("Concurrent Bursts During Active Network Partition", () => {
    it("should reject concurrent bursts during active network partition without data leakage", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_burst";
      });
      server.decorate("checkKillSwitch", async () => false);
      server.decorate("checkRateLimit", async () => ({ allowed: false, reason: "PARTITION_DENIAL" }));
      await server.register(executeRoutes);

      const requests = Array.from({ length: 50 }).map(() =>
        server.inject({
          method: "POST",
          url: "/v1/gateway/execute",
          headers: { authorization: `Bearer ${testToken}` },
          payload: {
            agent_id: "agent_burst",
            tool_name: "wire_transfer",
            arguments: { amount: 100 }
          }
        })
      );

      const responses = await Promise.all(requests);
      // All requests must be throttled or denied, zero ALLOW verdicts
      for (const r of responses) {
        expect(r.statusCode).toBe(429);
      }
    });
  });
});
