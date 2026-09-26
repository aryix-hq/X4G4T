import { describe, it, expect, beforeEach } from "vitest";

interface KeyRecord {
  id: string;
  name: string;
  orgId: string;
  revoked: boolean;
  revokedAt?: Date;
}

class InMemoryKeyStore {
  private keys: Map<string, KeyRecord> = new Map();

  constructor() {
    this.keys.set("key_live_1", {
      id: "key_live_1",
      name: "Production Agent Key",
      orgId: "org_enterprise",
      revoked: false
    });
  }

  async revokeKey(keyId: string, twoFactorToken?: string): Promise<{ status: number; message: string }> {
    // 2FA / Re-authentication Gate
    if (!twoFactorToken || twoFactorToken !== "2FA_VALID_TOTP_999999") {
      return { status: 403, message: "Forbidden: 2FA re-authentication required for destructive actions" };
    }

    const record = this.keys.get(keyId);
    if (!record) {
      return { status: 404, message: "Key not found" };
    }

    if (record.revoked) {
      return { status: 409, message: "Conflict: Key has already been revoked" };
    }

    record.revoked = true;
    record.revokedAt = new Date();
    return { status: 200, message: "Key revoked successfully" };
  }

  getKey(keyId: string): KeyRecord | undefined {
    return this.keys.get(keyId);
  }
}

describe("SUITE 2.2: Web UI - Destructive Actions & Re-Authentication Gate", () => {
  let keyStore: InMemoryKeyStore;

  beforeEach(() => {
    keyStore = new InMemoryKeyStore();
  });

  describe("Re-Authentication Gate for Destructive Operations", () => {
    it("should reject key revocation with 403 when 2FA token is missing", async () => {
      const res = await keyStore.revokeKey("key_live_1");
      expect(res.status).toBe(403);
      expect(res.message).toContain("2FA re-authentication required");

      const key = keyStore.getKey("key_live_1");
      expect(key?.revoked).toBe(false);
    });

    it("should reject key revocation with 403 when 2FA token is invalid", async () => {
      const res = await keyStore.revokeKey("key_live_1", "WRONG_TOKEN");
      expect(res.status).toBe(403);
      expect(keyStore.getKey("key_live_1")?.revoked).toBe(false);
    });

    it("should allow key revocation when valid 2FA token is supplied", async () => {
      const res = await keyStore.revokeKey("key_live_1", "2FA_VALID_TOTP_999999");
      expect(res.status).toBe(200);
      expect(keyStore.getKey("key_live_1")?.revoked).toBe(true);
    });
  });

  describe("Idempotent Double-Clicking & Race Invariants", () => {
    it("should ensure 10 rapid concurrent revocation requests result in exactly 1 success and 9 conflicts", async () => {
      const promises = Array.from({ length: 10 }).map(() =>
        keyStore.revokeKey("key_live_1", "2FA_VALID_TOTP_999999")
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.status === 200).length;
      const conflictCount = results.filter((r) => r.status === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(9);
      expect(keyStore.getKey("key_live_1")?.revoked).toBe(true);
    });
  });
});
