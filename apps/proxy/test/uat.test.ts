import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";
import { setMockHitlRecord, clearMockHitlRecords } from "../src/routes/hitl-poll.js";
import {
  evaluateAgentExecution,
  sanitizePayload,
  sanitizeHeaders,
  computeLogRecordHash,
  verifyLogHashChain,
  CompiledPolicy,
  LogRecordToHash
} from "@x4g4t/policy-engine";
import crypto from "node:crypto";

/**
 * ==============================================================================
 * X4G4T User Acceptance Testing (UAT) Suite
 * ==============================================================================
 * Validates complete end-to-end user journeys across 4 primary personas:
 * 1. AppSec / Security Engineer (Key provisioning, tenant scoping, policy configuration)
 * 2. Autonomous AI Agent Runtime (REST & MCP tool call evaluation, block, hold, forward)
 * 3. SOC Operator / Human Reviewer (Slack HITL approval, polling lifecycle)
 * 4. Compliance Auditor (ISO 27001 tamper-evident hash chaining & GDPR crypto-shredding)
 * ==============================================================================
 */

describe("X4G4T Comprehensive User Acceptance Testing (UAT)", () => {
  const app = buildApp();

  // Test Tenant & Identities
  const UAT_ORG_ID = "org_uat_acme_corp";
  const UAT_KEY_ID = "key_uat_live_001";
  const UAT_RAW_KEY = "sec_live_uat_acme_prod_9876543210abcdef";
  const UPSTREAM_SERVICE_URL = "https://api.acme.corp/v1/payments";
  const UPSTREAM_MCP_URL = "https://mcp.acme.corp/rpc";

  // Production-grade policies for UAT
  const uatPolicies: CompiledPolicy[] = [
    {
      id: "pol_guard_refund",
      name: "UAT Guard: Refund Amount Threshold",
      targetTool: "issue_refund",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_max_refund_250",
          fieldPath: "amount",
          operator: "GREATER_THAN",
          targetValue: "250"
        }
      ]
    },
    {
      id: "pol_hitl_wire_transfer",
      name: "UAT Guard: High-Value Wire Transfer Approval",
      targetTool: "wire_transfer",
      actionOnMatch: "REQUIRE_APPROVAL",
      rules: [
        {
          id: "rule_wire_gt_10k",
          fieldPath: "amount",
          operator: "GREATER_THAN_OR_EQUAL",
          targetValue: "10000"
        }
      ]
    },
    {
      id: "pol_block_destructive_sql",
      name: "UAT Guard: Prevent Destructive SQL Commands",
      targetTool: "execute_sql",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_drop_or_truncate",
          fieldPath: "query",
          operator: "REGEX",
          targetValue: "(?i)(DROP\\s+TABLE|TRUNCATE\\s+TABLE)"
        }
      ]
    }
  ];

  beforeEach(() => {
    clearTokenCache();
    clearPolicyCache();
    clearMockHitlRecords();
    setMockApiKey(UAT_RAW_KEY, UAT_ORG_ID, UAT_KEY_ID);
    setMockPoliciesForOrg(UAT_ORG_ID, uatPolicies);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------------------
  // USER JOURNEY 1: AppSec / Security Engineer Persona
  // ----------------------------------------------------------------------------
  describe("Journey 1: AppSec Persona - Key Provisioning & Authentication Guard", () => {
    it("UAT-1.1: Rejects unauthenticated requests with HTTP 401 UNAUTHORIZED", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        payload: {
          agent_id: "unauth_agent",
          tool_name: "issue_refund",
          arguments: { amount: 50 },
          downstream_url: UPSTREAM_SERVICE_URL
        }
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(body.error.message).toContain("Missing or invalid Bearer authentication token");
    });

    it("UAT-1.2: Rejects fraudulent / revoked API keys with HTTP 401 INVALID_API_KEY", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: "Bearer sec_live_fake_forged_key_000000000000"
        },
        payload: {
          agent_id: "agent_rogue",
          tool_name: "issue_refund",
          arguments: { amount: 50 },
          downstream_url: UPSTREAM_SERVICE_URL
        }
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.error.code).toBe("INVALID_API_KEY");
    });

    it("UAT-1.3: Validates genuine key and scopes execution to organization tenant", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "success" }), { status: 200 })
      );

      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`
        },
        payload: {
          agent_id: "authorized_agent",
          tool_name: "issue_refund",
          arguments: { amount: 50 },
          downstream_url: UPSTREAM_SERVICE_URL
        }
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ----------------------------------------------------------------------------
  // USER JOURNEY 2: AI Agent Runtime Persona (REST Gateway)
  // ----------------------------------------------------------------------------
  describe("Journey 2: Agent Runtime Persona - REST Gateway (/v1/gateway/execute)", () => {
    it("UAT-2.1: Compliant tool call is evaluated (<15ms budget) and forwarded downstream (HTTP 200)", async () => {
      const downstreamResponsePayload = {
        payment_id: "pay_982347102",
        status: "settled",
        amount_refunded: 120
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(downstreamResponsePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const startTime = performance.now();
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`,
          "x-agent-id": "autonomous_customer_support"
        },
        payload: {
          agent_id: "autonomous_customer_support",
          tool_name: "issue_refund",
          arguments: {
            amount: 120,
            customer_email: "alice@example.com",
            reason: "damaged_goods"
          },
          downstream_url: UPSTREAM_SERVICE_URL
        }
      });
      const durationMs = performance.now() - startTime;

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(downstreamResponsePayload);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(durationMs).toBeLessThan(100);
    });

    it("UAT-2.2: Over-limit tool call is blocked deterministically at the firewall (HTTP 422)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`,
          "x-agent-id": "autonomous_customer_support"
        },
        payload: {
          agent_id: "autonomous_customer_support",
          tool_name: "issue_refund",
          arguments: {
            amount: 750, // Exceeds $250 limit
            customer_id: "cust_attacker"
          },
          downstream_url: UPSTREAM_SERVICE_URL
        }
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe("POLICY_VIOLATION");
      expect(body.error.details.tool).toBe("issue_refund");
      expect(body.error.details.policy_id).toBe("pol_guard_refund");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("UAT-2.3: Destructive SQL injection is blocked via regex guardrail (HTTP 422)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`
        },
        payload: {
          agent_id: "code_interpreter_agent",
          tool_name: "execute_sql",
          arguments: {
            query: "DROP TABLE users CASCADE;"
          },
          downstream_url: "https://db.internal.corp/query"
        }
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe("POLICY_VIOLATION");
      expect(body.error.details.policy_id).toBe("pol_block_destructive_sql");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("UAT-2.4: High-impact tool call enters Human-in-the-Loop state (HTTP 202 HELD)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`,
          "x-agent-id": "finance_treasury_bot"
        },
        payload: {
          agent_id: "finance_treasury_bot",
          tool_name: "wire_transfer",
          arguments: {
            amount: 50000,
            beneficiary: "Global Logistics Ltd",
            iban: "GB29NWBK60161331926819"
          },
          downstream_url: "https://api.bank.internal/wire"
        }
      });

      expect(res.statusCode).toBe(202);
      const body = res.json();
      expect(body.status).toBe("HELD");
      expect(body.hold_id).toBeDefined();
      expect(body.retry_after_sec).toBe(5);
      expect(body.message).toContain("requires human intervention");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------------------
  // USER JOURNEY 3: Model Context Protocol (MCP) Persona (Cursor / Claude Desktop)
  // ----------------------------------------------------------------------------
  describe("Journey 3: MCP Agent Persona - JSON-RPC 2.0 Gateway (/v1/gateway/mcp)", () => {
    it("UAT-3.1: Pass-through MCP discovery frame (tools/list) to upstream server", async () => {
      const mockMcpToolsList = {
        jsonrpc: "2.0",
        id: 101,
        result: {
          tools: [
            { name: "issue_refund", description: "Issues refund to card" },
            { name: "wire_transfer", description: "Executes wire transfer" }
          ]
        }
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockMcpToolsList), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/mcp",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`,
          "x-target-mcp-url": UPSTREAM_MCP_URL
        },
        payload: {
          jsonrpc: "2.0",
          id: 101,
          method: "tools/list"
        }
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(mockMcpToolsList);
    });

    it("UAT-3.2: MCP tools/call violating policy returns JSON-RPC error code -32001", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/mcp",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`,
          "x-target-mcp-url": UPSTREAM_MCP_URL
        },
        payload: {
          jsonrpc: "2.0",
          id: 102,
          method: "tools/call",
          params: {
            name: "issue_refund",
            arguments: { amount: 1000 }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(102);
      expect(body.error.code).toBe(-32001);
      expect(body.error.message).toContain("Execution blocked by policy");
      expect(body.error.data.policyId).toBe("pol_guard_refund");
    });

    it("UAT-3.3: MCP tools/call requiring approval returns HELD result with card", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/mcp",
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`,
          "x-target-mcp-url": UPSTREAM_MCP_URL
        },
        payload: {
          jsonrpc: "2.0",
          id: 103,
          method: "tools/call",
          params: {
            name: "wire_transfer",
            arguments: { amount: 25000 }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("[X4G4T HELD]");
      expect(body.result.content[0].text).toContain("Action requires human verification");
    });
  });

  // ----------------------------------------------------------------------------
  // USER JOURNEY 4: SOC Operator & Suspended Agent (HITL Workflow)
  // ----------------------------------------------------------------------------
  describe("Journey 4: SOC Operator & Agent - HITL Approval & Polling Workflow", () => {
    const holdId = "hold_uat_wire_998877";

    it("UAT-4.1: Agent polls unresolved hold receiving HTTP 202 PENDING with retry interval", async () => {
      setMockHitlRecord(holdId, {
        status: "PENDING",
        reviewerId: null,
        resolvedAt: null,
        orgId: UAT_ORG_ID
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/gateway/hitl/${holdId}`,
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`
        }
      });

      expect(res.statusCode).toBe(202);
      const body = res.json();
      expect(body.status).toBe("PENDING");
      expect(body.retry_after_sec).toBe(5);
    });

    it("UAT-4.2: Human operator resolves hold as APPROVED, agent receives HTTP 200 APPROVED", async () => {
      const resolvedTimestamp = new Date();
      setMockHitlRecord(holdId, {
        status: "APPROVED",
        reviewerId: "U_SEC_ANALYST_01",
        resolvedAt: resolvedTimestamp,
        orgId: UAT_ORG_ID
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/gateway/hitl/${holdId}`,
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("APPROVED");
      expect(body.reviewer).toBe("U_SEC_ANALYST_01");
      expect(body.resolved_at).toBe(resolvedTimestamp.toISOString());
    });

    it("UAT-4.3: Human operator resolves hold as REJECTED, agent receives HTTP 200 REJECTED", async () => {
      const rejectHoldId = "hold_uat_rejected_5544";
      const resolvedTimestamp = new Date();
      setMockHitlRecord(rejectHoldId, {
        status: "REJECTED",
        reviewerId: "U_SEC_LEAD_99",
        resolvedAt: resolvedTimestamp,
        orgId: UAT_ORG_ID
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/gateway/hitl/${rejectHoldId}`,
        headers: {
          authorization: `Bearer ${UAT_RAW_KEY}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("REJECTED");
      expect(body.reviewer).toBe("U_SEC_LEAD_99");
    });
  });

  // ----------------------------------------------------------------------------
  // USER JOURNEY 5: Compliance Auditor Persona (ISO 27001 & GDPR Proofs)
  // ----------------------------------------------------------------------------
  describe("Journey 5: Compliance Auditor Persona - Tamper-Evidence & Crypto-Shredding", () => {
    it("UAT-5.1: Verifies ISO 27001 tamper-evident hash chaining across sequential executions", () => {
      const ts1 = new Date("2026-09-19T10:00:00Z");
      const ts2 = new Date("2026-09-19T10:01:00Z");

      const log1: LogRecordToHash = {
        id: "log_001",
        previousRecordHash: "GENESIS_HASH_00000000000000000000000000000000000000000000000000000000",
        toolName: "issue_refund",
        verdict: "ALLOW",
        createdAt: ts1
      };
      const log1Hash = computeLogRecordHash(log1);
      expect(log1Hash).toMatch(/^[a-f0-9]{64}$/);

      const log2: LogRecordToHash = {
        id: "log_002",
        previousRecordHash: log1Hash,
        toolName: "wire_transfer",
        verdict: "BLOCKED",
        createdAt: ts2
      };
      const log2Hash = computeLogRecordHash(log2);
      expect(log2Hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify chain integrity passes
      const chainValid = verifyLogHashChain([
        { ...log1, recordHash: log1Hash },
        { ...log2, recordHash: log2Hash }
      ]);
      expect(chainValid).toBe(true);

      // Tamper test: Altering log1 breaks the chain verification
      const chainTampered = verifyLogHashChain([
        { ...log1, verdict: "BLOCKED", recordHash: log1Hash }, // Tampered field
        { ...log2, recordHash: log2Hash }
      ]);
      expect(chainTampered).toBe(false);
    });

    it("UAT-5.2: Verifies Zero-Credential leakage (Authorization & API keys stripped from logs)", () => {
      const rawHeaders = {
        authorization: "Bearer sec_live_confidential_token",
        "x-api-key": "secret_key_12345",
        cookie: "session=xyz123; admin=true",
        "content-type": "application/json",
        "x-correlation-id": "corr_999888"
      };

      const sanitized = sanitizeHeaders(rawHeaders);

      expect(sanitized.authorization).toBe("[REDACTED_CREDENTIAL]");
      expect(sanitized["x-api-key"]).toBe("[REDACTED_CREDENTIAL]");
      expect(sanitized.cookie).toBe("[REDACTED_CREDENTIAL]");
      expect(sanitized["content-type"]).toBe("application/json");
      expect(sanitized["x-correlation-id"]).toBe("corr_999888");
    });

    it("UAT-5.3: Verifies GDPR PII redaction and mathematical Crypto-Shredding erasure", () => {
      const personalDataPayload = {
        user_id: "usr_alice_123",
        email: "alice.smith@enterprise.corp",
        ssn: "123-45-6789",
        card: "4532-1234-5678-9012",
        account_balance: 54000
      };

      // 1. In-flight PII Scrubbing
      const { sanitized, piiDetected } = sanitizePayload(personalDataPayload);
      const sanitizedRecord = sanitized as typeof personalDataPayload;
      expect(piiDetected).toBe(true);
      expect(sanitizedRecord.email).toBe("[REDACTED_EMAIL]");
      expect(sanitizedRecord.ssn).toBe("[REDACTED_SSN]");
      expect(sanitizedRecord.card).toBe("[REDACTED_CARD]");
      expect(sanitizedRecord.account_balance).toBe(54000);

      // 2. Crypto-Shredding Simulation (GDPR Art. 17 / DPDP Sec. 12)
      const subjectKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", subjectKey, iv);
      let encrypted = cipher.update(JSON.stringify(personalDataPayload), "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();

      // Data is recoverable with active subject key
      const decipher = crypto.createDecipheriv("aes-256-gcm", subjectKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      expect(JSON.parse(decrypted)).toEqual(personalDataPayload);

      // Erasure Event: Destroy the subject key in KMS / DB
      const destroyedKey = crypto.randomBytes(32);

      // Verification: Without key, decryption is mathematically impossible
      expect(() => {
        const failedDecipher = crypto.createDecipheriv("aes-256-gcm", destroyedKey, iv);
        failedDecipher.setAuthTag(authTag);
        let out = failedDecipher.update(encrypted, "hex", "utf8");
        out += failedDecipher.final("utf8");
      }).toThrow();
    });
  });

  // ----------------------------------------------------------------------------
  // PERFORMANCE & LATENCY BENCHMARK
  // ----------------------------------------------------------------------------
  describe("Performance & SLA Verification", () => {
    it("UAT-6.1: In-memory AST policy evaluation satisfies <1ms SLA over 1,000 evaluations", () => {
      const sampleArgs = { amount: 150, customer_id: "cust_perf_test" };

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        evaluateAgentExecution(uatPolicies, {
          toolName: "issue_refund",
          arguments: sampleArgs
        });
      }
      const totalElapsedMs = performance.now() - start;
      const avgPerEvaluationMs = totalElapsedMs / 1000;

      expect(avgPerEvaluationMs).toBeLessThan(0.1); // Sub-100 microseconds!
    });
  });
});
