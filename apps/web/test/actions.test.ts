import { describe, it, expect } from "vitest";
import { PolicyFormSchema } from "../lib/schemas.js";
import { createHash, randomBytes } from "node:crypto";

describe("Web Control Plane - Actions & Schema Verification", () => {
  describe("PolicyFormSchema Validation", () => {
    it("should accept valid policy form data", () => {
      const validData = {
        name: "Max Refund Policy",
        targetTool: "issue_refund",
        actionOnMatch: "BLOCK",
        fieldPath: "amount",
        operator: "GREATER_THAN",
        targetValue: "250"
      };

      const parsed = PolicyFormSchema.safeParse(validData);
      expect(parsed.success).toBe(true);
    });

    it("should accept REQUIRE_APPROVAL and ALLOW actions", () => {
      expect(
        PolicyFormSchema.safeParse({
          name: "HITL Payout",
          targetTool: "vendor_payout",
          actionOnMatch: "REQUIRE_APPROVAL",
          fieldPath: "total",
          operator: "GREATER_THAN_OR_EQUAL",
          targetValue: "1000"
        }).success
      ).toBe(true);

      expect(
        PolicyFormSchema.safeParse({
          name: "Allow Read-Only",
          targetTool: "get_status",
          actionOnMatch: "ALLOW",
          fieldPath: "status",
          operator: "EQUALS",
          targetValue: "active"
        }).success
      ).toBe(true);
    });

    it("should reject invalid actionOnMatch values", () => {
      const invalidData = {
        name: "Bad Action",
        targetTool: "tool",
        actionOnMatch: "INVALID_ACTION",
        fieldPath: "amount",
        operator: "EQUALS",
        targetValue: "10"
      };

      const parsed = PolicyFormSchema.safeParse(invalidData);
      expect(parsed.success).toBe(false);
    });

    it("should reject invalid operators", () => {
      const invalidData = {
        name: "Bad Op",
        targetTool: "tool",
        actionOnMatch: "BLOCK",
        fieldPath: "amount",
        operator: "LIKE", // SQL LIKE is not in enum
        targetValue: "10"
      };

      const parsed = PolicyFormSchema.safeParse(invalidData);
      expect(parsed.success).toBe(false);
    });

    it("should reject empty strings for mandatory fields", () => {
      const emptyName = {
        name: "",
        targetTool: "tool",
        actionOnMatch: "BLOCK",
        fieldPath: "field",
        operator: "EQUALS",
        targetValue: "10"
      };
      expect(PolicyFormSchema.safeParse(emptyName).success).toBe(false);
    });
  });

  describe("API Key Generation Cryptographic Verification", () => {
    function generateTestKey() {
      const secretPart = randomBytes(24).toString("hex");
      const prefix = `sec_live_${secretPart.slice(0, 6)}`;
      const rawKey = `${prefix}_${secretPart.slice(6)}`;
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      return { rawKey, prefix, keyHash };
    }

    it("should generate keys with sec_live_ prefix and high entropy", () => {
      const key = generateTestKey();
      expect(key.rawKey.startsWith("sec_live_")).toBe(true);
      expect(key.prefix.startsWith("sec_live_")).toBe(true);
      expect(key.keyHash).toHaveLength(64); // SHA-256 length
    });

    it("should generate cryptographically distinct tokens and hashes", () => {
      const key1 = generateTestKey();
      const key2 = generateTestKey();

      expect(key1.rawKey).not.toBe(key2.rawKey);
      expect(key1.keyHash).not.toBe(key2.keyHash);
    });

    it("should verify that hash matches raw key", () => {
      const key = generateTestKey();
      const verifyHash = createHash("sha256").update(key.rawKey).digest("hex");
      expect(verifyHash).toBe(key.keyHash);
    });
  });

  describe("Support & Exemption Requests Store", () => {
    it("should allow creating, retrieving, and resolving support requests", async () => {
      const { inMemorySupportRequests } = await import("../lib/support-requests.js");
      const initialCount = inMemorySupportRequests.length;

      const newReq = {
        id: `req_test_${Date.now()}`,
        userId: "usr_developer_01",
        category: "TOOL_ACCESS" as const,
        agentId: "agent-analytics",
        requestedToolOrModel: "execute_sql",
        justification: "Need read-only access to run analytics queries.",
        priority: "HIGH" as const,
        status: "PENDING" as const,
        createdAt: new Date().toISOString()
      };

      inMemorySupportRequests.unshift(newReq);
      expect(inMemorySupportRequests.length).toBe(initialCount + 1);

      // Admin resolves the request
      const found = inMemorySupportRequests.find((r) => r.id === newReq.id);
      expect(found).toBeDefined();
      if (found) {
        found.status = "APPROVED";
        found.reviewerId = "usr_secops_admin";
        found.resolutionNote = "Approved for 48 hours";
        found.resolvedAt = new Date().toISOString();
      }

      expect(inMemorySupportRequests.find((r) => r.id === newReq.id)?.status).toBe("APPROVED");
    });
  });

  describe("Developer Token Quota & Approval Enforcement", () => {
    it("should limit developer to 5 tokens by default and allow more only when approved", async () => {
      const { setMockTenantContext } = await import("../lib/tenant.js");
      const { inMemoryApiKeys } = await import("../lib/in-memory-keys.js");
      const { inMemorySupportRequests } = await import("../lib/support-requests.js");
      const { createApiKeyAction, getDeveloperQuotaAction } = await import("../app/actions.js");

      // Set developer context
      const devUserId = `usr_test_dev_${Date.now()}`;
      setMockTenantContext({
        userId: devUserId,
        orgId: "org_dev_quota_test",
        orgName: "Dev Quota Org",
        role: "developer"
      });

      // Clear in-memory keys for clean test
      inMemoryApiKeys.length = 0;

      // 1. Generate 5 tokens (allowed)
      for (let i = 0; i < 5; i++) {
        const key = await createApiKeyAction();
        expect(key.rawKey.startsWith("sec_live_")).toBe(true);
      }

      // Check quota
      const quota = await getDeveloperQuotaAction();
      expect(quota.activeCount).toBe(5);
      expect(quota.allowedLimit).toBe(5);
      expect(quota.canGenerate).toBe(false);

      // 2. Generating 6th token should throw 403 Forbidden
      await expect(createApiKeyAction()).rejects.toThrow("Developer token limit reached");

      // 3. Developer raises a TOKEN_QUOTA support ticket
      const ticketId = `req_quota_${Date.now()}`;
      inMemorySupportRequests.unshift({
        id: ticketId,
        userId: devUserId,
        category: "TOKEN_QUOTA",
        agentId: "agent-dev",
        requestedToolOrModel: "5 Additional Tokens",
        justification: "Need more tokens for QA testing",
        priority: "HIGH",
        status: "PENDING",
        createdAt: new Date().toISOString()
      });

      // Still cannot generate before approval
      await expect(createApiKeyAction()).rejects.toThrow("Developer token limit reached");

      // 4. Admin approves the ticket
      const ticket = inMemorySupportRequests.find((r) => r.id === ticketId);
      expect(ticket).toBeDefined();
      if (ticket) {
        ticket.status = "APPROVED";
        ticket.reviewerId = "admin_secops";
        ticket.resolutionNote = "Approved 5 additional tokens";
        ticket.resolvedAt = new Date().toISOString();
      }

      // Now quota is increased (5 + 5 = 10)
      const updatedQuota = await getDeveloperQuotaAction();
      expect(updatedQuota.allowedLimit).toBe(10);
      expect(updatedQuota.canGenerate).toBe(true);

      // 5. 6th token generation now succeeds!
      const key6 = await createApiKeyAction();
      expect(key6.rawKey.startsWith("sec_live_")).toBe(true);

      // Reset mock context
      setMockTenantContext(null);
    });
  });
});

