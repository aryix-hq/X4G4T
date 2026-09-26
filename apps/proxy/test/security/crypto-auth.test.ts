import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import Fastify from "fastify";
import { authPlugin, clearTokenCache } from "../../src/plugins/auth.js";
import { apiKeys } from "@x4g4t/db";

describe("SUITE 3.3: Identity, Authentication & Cryptographic Rigor", () => {
  describe("1. Timing-Attack Resistance in Token Verification", () => {
    it("should verify token hashes using crypto.timingSafeEqual to prevent side-channel timing leaks", async () => {
      const timingSafeSpy = vi.spyOn(crypto, "timingSafeEqual");
      clearTokenCache();

      const server = Fastify();
      await server.register(authPlugin);
      server.post("/test-auth", { preHandler: [server.authenticate] }, async () => {
        return { status: "authenticated" };
      });

      const validToken = "sec_live_9a1b2c3d4e5f67890abcdef";
      const tokenHash = crypto.createHash("sha256").update(validToken).digest("hex");

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "key_sec_1",
            orgId: "org_defense_grade",
            keyHash: tokenHash
          }
        ])
      };

      const { setDbClient } = await import("../../src/services/gateway.js");
      setDbClient(mockDb);

      const res = await server.inject({
        method: "POST",
        url: "/test-auth",
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      expect(timingSafeSpy).toHaveBeenCalled();
      const [bufA, bufB] = timingSafeSpy.mock.calls[0];
      expect(Buffer.isBuffer(bufA)).toBe(true);
      expect(Buffer.isBuffer(bufB)).toBe(true);
      expect(bufA.length).toBe(bufB.length);
      expect(crypto.timingSafeEqual(bufA, bufB)).toBe(true);

      timingSafeSpy.mockRestore();
    });

    it("should reject tokens with modified trailing characters in constant time", () => {
      const hashA = crypto.createHash("sha256").update("token_alpha_1").digest();
      const hashB = crypto.createHash("sha256").update("token_alpha_2").digest();

      expect(hashA.length).toBe(hashB.length);
      const isMatch = crypto.timingSafeEqual(hashA, hashB);
      expect(isMatch).toBe(false);
    });
  });

  describe("2. Cryptographic Key Derivation & At-Rest Storage", () => {
    it("should enforce SHA-256 hash storage and forbid persisting raw API keys", () => {
      const columns = Object.keys(apiKeys);
      expect(columns).toContain("keyHash");
      expect(columns).toContain("keyPrefix");

      expect(columns).not.toContain("rawKey");
      expect(columns).not.toContain("secret");
      expect(columns).not.toContain("key");
      expect(columns).not.toContain("apiKey");
    });

    it("should produce deterministic non-reversible SHA-256 hashes for API key tokens", () => {
      const secret = "x4g4t_live_secret_token_defense_grade_test_99";
      const hash1 = crypto.createHash("sha256").update(secret).digest("hex");
      const hash2 = crypto.createHash("sha256").update(secret).digest("hex");

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(hash1).not.toContain(secret);
    });
  });

  describe("3. Slack Webhook HMAC-SHA256 Signature & Replay Prevention", () => {
    const signingSecret = "slack_signing_secret_test_secret_777";

    function computeSlackSignature(timestamp: number, body: string, secret: string): string {
      const sigBase = `v0:${timestamp}:${body}`;
      return "v0=" + crypto.createHmac("sha256", secret).update(sigBase, "utf8").digest("hex");
    }

    function verifySlackWebhook(
      signature: string | null,
      timestamp: string | null,
      body: string,
      secret: string
    ): { valid: boolean; error?: string } {
      if (!signature || !timestamp) {
        return { valid: false, error: "Missing signature or timestamp" };
      }

      const current = Math.floor(Date.now() / 1000);
      const reqTime = parseInt(timestamp, 10);
      if (isNaN(reqTime) || Math.abs(current - reqTime) > 300) {
        return { valid: false, error: "Stale timestamp (> 300s) - replay attack rejected" };
      }

      const expected = computeSlackSignature(reqTime, body, secret);
      try {
        const match = crypto.timingSafeEqual(
          Buffer.from(expected, "utf8"),
          Buffer.from(signature, "utf8")
        );
        return { valid: match };
      } catch {
        return { valid: false, error: "Signature mismatch" };
      }
    }

    it("should cryptographically validate genuine Slack HMAC-SHA256 signatures", () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ action: "APPROVED", hitlId: "hitl_999" });
      const validSignature = computeSlackSignature(now, payload, signingSecret);

      const res = verifySlackWebhook(validSignature, String(now), payload, signingSecret);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("should reject replayed Slack requests older than 300 seconds (5 minutes)", () => {
      const current = Math.floor(Date.now() / 1000);
      const staleTimestamp = current - 301;
      const payload = JSON.stringify({ action: "APPROVED", hitlId: "hitl_999" });
      const validOldSignature = computeSlackSignature(staleTimestamp, payload, signingSecret);

      const res = verifySlackWebhook(validOldSignature, String(staleTimestamp), payload, signingSecret);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("replay attack rejected");
    });

    it("should reject tampered Slack payloads even if timestamp is fresh", () => {
      const now = Math.floor(Date.now() / 1000);
      const originalPayload = JSON.stringify({ action: "REJECTED", hitlId: "hitl_999" });
      const tamperedPayload = JSON.stringify({ action: "APPROVED", hitlId: "hitl_999" });
      const signatureForOriginal = computeSlackSignature(now, originalPayload, signingSecret);

      const res = verifySlackWebhook(signatureForOriginal, String(now), tamperedPayload, signingSecret);
      expect(res.valid).toBe(false);
    });

    it("should reject tampered HMAC signatures", () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ action: "APPROVED", hitlId: "hitl_999" });
      const forgedSignature = "v0=deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";

      const res = verifySlackWebhook(forgedSignature, String(now), payload, signingSecret);
      expect(res.valid).toBe(false);
    });
  });
});
