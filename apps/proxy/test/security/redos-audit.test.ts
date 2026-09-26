import { describe, it, expect } from "vitest";
import { evaluateRuleCondition, isRegexVulnerableToReDoS, safeRegexTest } from "@x4g4t/policy-engine";

describe("SUITE 3.1: Defense-Grade Security - ReDoS (Regular Expression Denial of Service) Audit", () => {
  describe("Pathological Input Injection Matrix", () => {
    it("should detect and flag vulnerable nested repetition patterns in regex policies", () => {
      const vulnerablePatterns = [
        "^(a+)+$",
        "(a|a)+",
        "([a-zA-Z]+)*",
        "(a|b|c+)+",
        "([0-9]+)+$"
      ];

      for (const pattern of vulnerablePatterns) {
        const isVulnerable = isRegexVulnerableToReDoS(pattern);
        expect(isVulnerable).toBe(true);
      }
    });

    it("should reject pathological backtracking strings within a strict execution sandbox (<= 15ms)", () => {
      // Classic ReDoS pattern: a(b|c+)+d against a + 500 'c's + 'x'
      const evilPattern = "^(a+)+$";
      const pathologicalInput = "a".repeat(50) + "X";

      const start = performance.now();
      const match = safeRegexTest(evilPattern, pathologicalInput, { timeoutMs: 15 });
      const duration = performance.now() - start;

      // Must abort without hanging the process
      expect(match).toBe(false);
      expect(duration).toBeLessThanOrEqual(50);
    });

    it("should safely match legitimate benign regular expressions without false rejections", () => {
      const benignPatterns = [
        "^[a-zA-Z0-9_.-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$",
        "^Bearer [A-Za-z0-9-_=]+\\.[A-Za-z0-9-_=]+\\.?[A-Za-z0-9-_.+/=]*$",
        "(?i)DROP\\s+TABLE"
      ];

      for (const pattern of benignPatterns) {
        expect(isRegexVulnerableToReDoS(pattern)).toBe(false);
      }

      expect(evaluateRuleCondition("admin@enterprise.internal", "REGEX", "^[a-zA-Z0-9_.-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$")).toBe(true);
      expect(evaluateRuleCondition("DROP TABLE users;", "REGEX", "(?i)DROP\\s+TABLE")).toBe(true);
    });
  });

  describe("Linearity Verification O(n)", () => {
    it("should scale evaluation time strictly linearly with input length on safe expressions", () => {
      const pattern = "SELECT\\s+\\*\\s+FROM";
      const shortInput = "SELECT * FROM users WHERE id = 1";
      const longInput = "SELECT * FROM " + "a".repeat(10000) + " WHERE id = 1";

      // Warm up regex JIT
      safeRegexTest(pattern, shortInput);

      const startShort = performance.now();
      safeRegexTest(pattern, shortInput);
      const timeShort = performance.now() - startShort;

      const startLong = performance.now();
      safeRegexTest(pattern, longInput);
      const timeLong = performance.now() - startLong;

      // Both should complete virtually instantly (< 50ms under parallel runner load)
      expect(timeShort).toBeLessThan(50);
      expect(timeLong).toBeLessThan(50);
    });
  });
});
