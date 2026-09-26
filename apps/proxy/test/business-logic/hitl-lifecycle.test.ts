import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { executeRoutes } from "../../src/routes/execute.js";
import { hitlPollRoutes, setMockHitlRecord, getMockHitlRecord, clearMockHitlRecords } from "../../src/routes/hitl-poll.js";
import { setMockApiKey, clearTokenCache } from "../../src/plugins/auth.js";
import { setMockPoliciesForOrg } from "../../src/services/gateway.js";
import { CompiledPolicy } from "@x4g4t/policy-engine";

describe("SUITE 1.3: Business Logic - Human-in-the-Loop (HITL) Workflow & Lifecycle Invariants", () => {
  const testOrg = "org_hitl_test_suite";
  const testToken = "sec_live_hitl_token_999";

  const hitlPolicy: CompiledPolicy = {
    id: "pol_wire_approval",
    name: "Wire Transfer Human Sign-off",
    targetTool: "wire_transfer",
    actionOnMatch: "REQUIRE_APPROVAL",
    matchLogic: "AND",
    rules: [
      {
        id: "rule_amount_limit",
        fieldPath: "amount",
        operator: "GREATER_THAN",
        targetValue: "1000"
      }
    ]
  };

  beforeEach(() => {
    clearTokenCache();
    clearMockHitlRecords();
    setMockApiKey(testToken, testOrg);
    setMockPoliciesForOrg(testOrg, [hitlPolicy]);
  });

  describe("State Preservation on REQUIRE_APPROVAL", () => {
    it("should commit state as PENDING, generate hold_id, and return 202 Accepted", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_hitl_1";
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
          agent_id: "agent_finance_bot",
          tool_name: "wire_transfer",
          arguments: { amount: 5000, recipient: "IBAN12345678" },
          downstream_url: "https://api.bank.com/wire"
        }
      });

      expect(res.statusCode).toBe(202);
      const json = JSON.parse(res.payload);
      expect(json.status).toBe("HELD");
      expect(json.hold_id).toBeDefined();
      expect(json.retry_after_sec).toBe(5);

      const storedRecord = getMockHitlRecord(json.hold_id);
      expect(storedRecord).toBeDefined();
      expect(storedRecord?.status).toBe("PENDING");
      expect(storedRecord?.executionPayload.arguments).toEqual({ amount: 5000, recipient: "IBAN12345678" });
    });
  });

  describe("Decision State Transitions & Idempotency", () => {
    it("should execute downstream forwarding when transitioned to APPROVED", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_hitl_reviewer";
      });
      await server.register(hitlPollRoutes);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ transfer_id: "txn_999", status: "cleared" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        )
      );

      const holdId = "hold_test_approved_1";
      setMockHitlRecord(holdId, {
        status: "PENDING",
        reviewerId: null,
        resolvedAt: null,
        orgId: testOrg,
        executionPayload: {
          downstream_url: "https://api.bank.com/wire",
          downstream_headers: {},
          arguments: { amount: 5000, recipient: "IBAN12345678" }
        }
      });

      const resolveRes = await server.inject({
        method: "POST",
        url: `/v1/gateway/hitl/${holdId}/resolve`,
        headers: {
          authorization: `Bearer ${testToken}`
        },
        payload: {
          decision: "APPROVED",
          reason: "Verified with CFO"
        }
      });

      expect(resolveRes.statusCode).toBe(200);
      const resolveJson = JSON.parse(resolveRes.payload);
      expect(resolveJson.status).toBe("APPROVED");
      expect(resolveJson.forwardedResponse.transfer_id).toBe("txn_999");
      expect(fetchSpy).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it("should halt execution permanently when transitioned to REJECTED", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_hitl_reviewer";
      });
      await server.register(hitlPollRoutes);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const holdId = "hold_test_rejected_1";
      setMockHitlRecord(holdId, {
        status: "PENDING",
        reviewerId: null,
        resolvedAt: null,
        orgId: testOrg,
        executionPayload: {
          downstream_url: "https://api.bank.com/wire",
          downstream_headers: {},
          arguments: { amount: 5000 }
        }
      });

      const rejectRes = await server.inject({
        method: "POST",
        url: `/v1/gateway/hitl/${holdId}/resolve`,
        headers: {
          authorization: `Bearer ${testToken}`
        },
        payload: {
          decision: "REJECTED",
          reason: "Suspected fraud"
        }
      });

      expect(rejectRes.statusCode).toBe(200);
      const rejectJson = JSON.parse(rejectRes.payload);
      expect(rejectJson.status).toBe("REJECTED");
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it("should return 409 Conflict when replaying a decision on an already resolved hold", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_hitl_reviewer";
      });
      await server.register(hitlPollRoutes);

      const holdId = "hold_test_conflict_1";
      setMockHitlRecord(holdId, {
        status: "APPROVED",
        reviewerId: "admin_user_01",
        resolvedAt: new Date().toISOString(),
        orgId: testOrg,
        executionPayload: {
          downstream_url: "https://api.bank.com/wire",
          downstream_headers: {},
          arguments: { amount: 5000 }
        }
      });

      const replayRes = await server.inject({
        method: "POST",
        url: `/v1/gateway/hitl/${holdId}/resolve`,
        headers: {
          authorization: `Bearer ${testToken}`
        },
        payload: {
          decision: "REJECTED",
          reason: "Changed my mind"
        }
      });

      expect(replayRes.statusCode).toBe(409);
      const conflictJson = JSON.parse(replayRes.payload);
      expect(conflictJson.error.code).toBe("ALREADY_RESOLVED");
    });
  });

  describe("TTL Expiration Invariant (15 Minutes)", () => {
    it("should automatically expire holds older than 15 minutes to EXPIRED_HALTED", async () => {
      const server = Fastify();
      server.decorate("authenticate", async (req: any) => {
        req.orgId = testOrg;
        req.keyId = "key_hitl_poll";
      });
      await server.register(hitlPollRoutes);

      const holdId = "hold_test_expired_1";
      const fifteenMinutesAndOneSecondAgo = Date.now() - (15 * 60 * 1000 + 1000);

      setMockHitlRecord(holdId, {
        status: "PENDING",
        reviewerId: null,
        resolvedAt: null,
        orgId: testOrg,
        createdAt: fifteenMinutesAndOneSecondAgo,
        executionPayload: {
          downstream_url: "https://api.bank.com/wire",
          downstream_headers: {},
          arguments: { amount: 5000 }
        }
      });

      const pollRes = await server.inject({
        method: "GET",
        url: `/v1/gateway/hitl/${holdId}`,
        headers: {
          authorization: `Bearer ${testToken}`
        }
      });

      expect(pollRes.statusCode).toBe(200);
      const pollJson = JSON.parse(pollRes.payload);
      expect(pollJson.status).toBe("EXPIRED_HALTED");
    });
  });
});

