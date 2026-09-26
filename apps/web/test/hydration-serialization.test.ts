import { describe, it, expect } from "vitest";

function safeSerializeDashboardState(state: {
  policies?: any[] | null;
  logs?: any[] | null;
  metrics?: Record<string, any> | null;
}): string {
  const sanitized = {
    policies: Array.isArray(state.policies) ? state.policies : [],
    logs: Array.isArray(state.logs) ? state.logs : [],
    metrics: state.metrics && typeof state.metrics === "object" ? state.metrics : {}
  };
  return JSON.stringify(sanitized);
}

function truncateLargeLogPayload(payload: string, maxChars = 10000): { truncated: string; wasTruncated: boolean; originalLength: number } {
  if (!payload || payload.length <= maxChars) {
    return { truncated: payload || "", wasTruncated: false, originalLength: payload ? payload.length : 0 };
  }
  return {
    truncated: payload.slice(0, maxChars) + "\n... [TRUNCATED FOR UI RENDERING SAFETY]",
    wasTruncated: true,
    originalLength: payload.length
  };
}

describe("SUITE 2.1: Web UI - Hydration & State Serialization Invariants", () => {
  describe("Null-State Guards & Defensive Deserialization", () => {
    it("should safely serialize null policies and logs without hydration crashes", () => {
      const serialized = safeSerializeDashboardState({
        policies: null,
        logs: null,
        metrics: null
      });

      const parsed = JSON.parse(serialized);
      expect(parsed.policies).toEqual([]);
      expect(parsed.logs).toEqual([]);
      expect(parsed.metrics).toEqual({});
    });

    it("should safely handle undefined and malformed collection properties", () => {
      const serialized = safeSerializeDashboardState({});
      const parsed = JSON.parse(serialized);
      expect(parsed.policies).toEqual([]);
      expect(parsed.logs).toEqual([]);
      expect(parsed.metrics).toEqual({});
    });
  });

  describe("Large Payload Truncation & DOM Bounding", () => {
    it("should truncate massive 50MB payloads in <= 100ms", () => {
      const chunk = "X4G4T_SECURITY_AUDIT_LOG_ENTRY_DATA_CHUNK_";
      const repeats = Math.ceil((50 * 1024 * 1024) / chunk.length);
      const massivePayload = chunk.repeat(repeats);

      const startTime = performance.now();
      const result = truncateLargeLogPayload(massivePayload, 10000);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThanOrEqual(100);
      expect(result.wasTruncated).toBe(true);
      expect(result.originalLength).toBeGreaterThanOrEqual(50 * 1024 * 1024);
      expect(result.truncated.length).toBeLessThan(11000);
      expect(result.truncated).toContain("[TRUNCATED FOR UI RENDERING SAFETY]");
    });

    it("should leave short payloads intact without truncation marker", () => {
      const payload = '{"status":"SUCCESS","duration_ms":12}';
      const result = truncateLargeLogPayload(payload, 5000);

      expect(result.wasTruncated).toBe(false);
      expect(result.truncated).toBe(payload);
    });
  });
});
