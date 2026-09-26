import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { executeRoutes } from "../../src/routes/execute.js";
import { setMockApiKey, clearTokenCache } from "../../src/plugins/auth.js";
import { setMockPoliciesForOrg } from "../../src/services/gateway.js";
import { validateDownstreamUrl } from "@x4g4t/policy-engine";
import { sql } from "drizzle-orm";
import { createDbClient, policies } from "@x4g4t/db";

describe("SUITE 3.4: Defense-Grade Security - Injection & Boundary Sanitization", () => {
  describe("1. Downstream Forwarder SSRF (Server-Side Request Forgery) Guard", () => {
    it("should strictly reject cloud metadata service endpoints (AWS, GCP, Azure, Oracle)", () => {
      const cloudTargets = [
        "http://169.254.169.254/latest/meta-data/",
        "http://169.254.170.2/v2/credentials/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://192.0.0.192/latest/",
        "http://instance-data/latest/meta-data/"
      ];

      for (const target of cloudTargets) {
        const result = validateDownstreamUrl(target);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
      }
    });

    it("should reject loopback addresses when allowLocal is disabled", () => {
      const loopbacks = [
        "http://127.0.0.1:5432/query",
        "http://localhost:6379",
        "http://[::1]:8080/metrics",
        "http://127.0.0.2:9000"
      ];

      for (const target of loopbacks) {
        const result = validateDownstreamUrl(target, { allowLocal: false });
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/blocked|reserved|loopback/i);
      }
    });

    it("should reject internal RFC 1918 private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", () => {
      const internalTargets = [
        "http://10.0.0.1/admin",
        "http://10.254.1.99:8000/internal",
        "http://172.16.0.10:8080/secrets",
        "http://172.31.255.254/metrics",
        "http://192.168.1.1/router-login",
        "http://192.168.100.50/vault"
      ];

      for (const target of internalTargets) {
        const result = validateDownstreamUrl(target, { allowLocal: false });
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/private|reserved|blocked/i);
      }
    });

    it("should reject non-HTTP protocols (file://, gopher://, ftp://)", () => {
      const exoticProtocols = [
        "file:///etc/passwd",
        "file:///proc/self/environ",
        "gopher://127.0.0.1:70/",
        "ftp://backup.corp.internal/keys"
      ];

      for (const target of exoticProtocols) {
        const result = validateDownstreamUrl(target);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/protocol|unsupported/i);
      }
    });

    it("should enforce SSRF rejection at the API boundary returning 400 SSRF_BLOCKED", async () => {
      const testOrg = "org_ssrf_test";
      const testToken = "sec_live_ssrf_test_token";
      setMockApiKey(testToken, testOrg);
      setMockPoliciesForOrg(testOrg, []);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_ssrf_1";
      });
      server.decorate("checkKillSwitch", async () => false);
      server.decorate("checkRateLimit", async () => ({ allowed: true }));
      await server.register(executeRoutes);

      const res = await server.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${testToken}`
        },
        payload: {
          agent_id: "agent_ssrf_scanner",
          tool_name: "query_database",
          arguments: { query: "SELECT 1" },
          downstream_url: "http://169.254.169.254/latest/meta-data/"
        }
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.error.code).toBe("SSRF_BLOCKED");
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });

  describe("2. SQL Injection Immunity in Tenant & Policy Resolution", () => {
    it("should compile parameterized queries preventing SQL injection via Drizzle ORM", () => {
      const maliciousTenantIds = [
        "' OR '1'='1",
        "org_123'; DROP TABLE policies;--",
        "admin'--",
        "' UNION SELECT * FROM api_keys WHERE '1'='1"
      ];

      for (const maliciousId of maliciousTenantIds) {
        const query = createDbClient("postgres://dummy:dummy@localhost:5432/dummy")
          .select()
          .from(policies)
          .where(sql`${policies.orgId} = ${maliciousId}`);

        const compiled = query.toSQL();

        expect(compiled.sql).toContain("$1");
        expect(compiled.sql).not.toContain(maliciousId);
        expect(compiled.params).toEqual([maliciousId]);
      }
    });

    it("should safely handle injection patterns in orgId without execution crashes", async () => {
      const maliciousOrg = "org_test' OR 1=1;--";
      const token = "sec_malicious_org_token";
      setMockApiKey(token, maliciousOrg);

      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = maliciousOrg;
        req.keyId = "key_malicious_1";
      });
      server.decorate("checkKillSwitch", async () => false);
      server.decorate("checkRateLimit", async () => ({ allowed: true }));
      await server.register(executeRoutes);

      setMockPoliciesForOrg(maliciousOrg, []);

      const res = await server.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          agent_id: "agent_sqli_test",
          tool_name: "harmless_tool",
          arguments: { text: "clean" },
          downstream_url: "https://api.openai.com/v1/chat/completions"
        }
      });

      expect(res.statusCode).not.toBe(500);
    });
  });
});
