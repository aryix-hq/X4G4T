import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateInMemoryRateLimit,
  clearInMemoryRateLimits,
  RateLimitPolicyConfig,
  RateLimitCheckContext,
  validateLuhn,
  inspectPayloadDlp,
  DlpPolicyConfig
} from "../src/index.js";

describe("Policy Engine - Sliding Window Rate Limiting", () => {
  beforeEach(() => {
    clearInMemoryRateLimits();
  });

  const policy5PerWindow: RateLimitPolicyConfig = {
    id: "pol_rate_5_requests",
    name: "5 Requests per 1 Hour",
    windowSizeSeconds: 3600,
    maxRequests: 5,
    scope: "PER_USER"
  };

  it("should allow requests under the quota and accurately decrement remaining count", () => {
    const ctx: RateLimitCheckContext = { orgId: "org_123", userId: "usr_alice" };

    for (let i = 1; i <= 5; i++) {
      const res = evaluateInMemoryRateLimit(policy5PerWindow, ctx, 1000 * i);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5 - i);
      expect(res.limit).toBe(5);
    }
  });

  it("should reject requests exceeding the sliding window quota", () => {
    const ctx: RateLimitCheckContext = { orgId: "org_123", userId: "usr_bob" };

    for (let i = 1; i <= 5; i++) {
      evaluateInMemoryRateLimit(policy5PerWindow, ctx, 1000 * i);
    }

    const blockedRes = evaluateInMemoryRateLimit(policy5PerWindow, ctx, 6000);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.remaining).toBe(0);
    expect(blockedRes.resetSeconds).toBeGreaterThan(0);
    expect(blockedRes.reason).toContain("Rate limit exceeded");
  });

  it("should enforce distinct scopes (PER_USER vs PER_IP vs PER_ORG)", () => {
    const orgPolicy: RateLimitPolicyConfig = {
      id: "pol_org_limit",
      name: "Org Limit",
      windowSizeSeconds: 60,
      maxRequests: 2,
      scope: "PER_ORG"
    };

    const res1 = evaluateInMemoryRateLimit(orgPolicy, { orgId: "org_alpha", userId: "user_1" });
    const res2 = evaluateInMemoryRateLimit(orgPolicy, { orgId: "org_alpha", userId: "user_2" });
    const res3 = evaluateInMemoryRateLimit(orgPolicy, { orgId: "org_alpha", userId: "user_3" });

    expect(res1.allowed).toBe(true);
    expect(res2.allowed).toBe(true);
    expect(res3.allowed).toBe(false); // Exceeded org quota

    // Different org should have its own separate quota
    const resBeta = evaluateInMemoryRateLimit(orgPolicy, { orgId: "org_beta", userId: "user_1" });
    expect(resBeta.allowed).toBe(true);
  });
});

describe("Policy Engine - Enterprise DLP (Data Leakage Prevention)", () => {
  it("should validate credit card numbers with the Luhn checksum algorithm", () => {
    // Valid test card numbers (Luhn compliant)
    expect(validateLuhn("4532-0150-1234-5671")).toBe(true);
    expect(validateLuhn("4532015012345671")).toBe(true);
    expect(validateLuhn("4111-1111-1111-1111")).toBe(true);

    // Invalid numbers (non-Luhn compliant)
    expect(validateLuhn("4532-0150-1234-5674")).toBe(false);
    expect(validateLuhn("1234567812345678")).toBe(false);
    expect(validateLuhn("12345")).toBe(false);
  });

  it("should detect and redact AWS Access Keys and GitHub Tokens", () => {
    const config: DlpPolicyConfig = {
      action: "REDACT",
      detectSecrets: true,
      detectPii: true
    };

    const payload = {
      prompt: "Deploy to AWS using AKIAIOSFODNN7EXAMPLE and token ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      target: "cloud"
    };

    const result = inspectPayloadDlp(payload, config);
    expect(result.hasViolations).toBe(true);
    expect(result.blocked).toBe(false);

    const sanitized = result.sanitizedData as typeof payload;
    expect(sanitized.prompt).toContain("[REDACTED_SECRET:AWS_KEY]");
    expect(sanitized.prompt).toContain("[REDACTED_SECRET:GITHUB_TOKEN]");
    expect(sanitized.prompt).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("should detect and redact Luhn-valid Credit Cards, SSNs, and Indian Aadhaar", () => {
    const config: DlpPolicyConfig = {
      action: "REDACT",
      detectSecrets: true,
      detectPii: true
    };

    const payload = {
      user: {
        cc: "Payment via 4532-0150-1234-5671",
        ssn: "SSN is 000-12-3456",
        aadhaar: "Aadhaar: 1234 5678 9012"
      }
    };

    const result = inspectPayloadDlp(payload, config);
    expect(result.hasViolations).toBe(true);

    const sanitized = result.sanitizedData as any;
    expect(sanitized.user.cc).toContain("[REDACTED_PII:CREDIT_CARD]");
    expect(sanitized.user.ssn).toContain("[REDACTED_PII:SSN]");
    expect(sanitized.user.aadhaar).toContain("[REDACTED_PII:AADHAAR]");
  });

  it("should block requests when action is BLOCK", () => {
    const config: DlpPolicyConfig = {
      action: "BLOCK",
      detectSecrets: true,
      detectPii: true
    };

    const payload = {
      message: "Here is the master secret: sk_live_99887766554433221100aa"
    };

    const result = inspectPayloadDlp(payload, config);
    expect(result.hasViolations).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("DLP Violation");
    expect(result.violations[0]?.type).toBe("API_KEY");
  });

  it("should detect custom corporate project keywords", () => {
    const config: DlpPolicyConfig = {
      action: "REDACT",
      detectSecrets: false,
      detectPii: false,
      customKeywords: ["Project-Titan", "AcmeConfidential"]
    };

    const payload = {
      summary: "Discussing Project-Titan architecture under AcmeConfidential guidelines."
    };

    const result = inspectPayloadDlp(payload, config);
    expect(result.hasViolations).toBe(true);

    const sanitized = result.sanitizedData as typeof payload;
    expect(sanitized.summary).toBe("Discussing [REDACTED_CORP_CONFIDENTIAL] architecture under [REDACTED_CORP_CONFIDENTIAL] guidelines.");
  });

  it("should allow ALERT_ONLY without mutating payload", () => {
    const config: DlpPolicyConfig = {
      action: "ALERT_ONLY",
      detectSecrets: true
    };

    const payload = {
      secret: "AKIAIOSFODNN7EXAMPLE"
    };

    const result = inspectPayloadDlp(payload, config);
    expect(result.hasViolations).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.sanitizedData).toEqual(payload); // Not mutated
  });
});
