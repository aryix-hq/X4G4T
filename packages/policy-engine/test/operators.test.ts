import { describe, it, expect } from "vitest";
import { evaluateOperator, extractFieldValue, getNestedValue } from "../src/operators.js";

describe("Operators Unit Test Suite - Exhaustive Boundary Verification", () => {
  describe("getNestedValue & extractFieldValue", () => {
    const payload = {
      user: {
        id: "usr_100",
        profile: {
          roles: ["admin", "developer"],
          settings: {
            theme: "dark",
            notifications: true,
            score: 95.5
          }
        },
        metadata: null
      },
      tags: ["ai", "proxy"],
      topLevelNumber: 42
    };

    it("extracts root properties", () => {
      expect(extractFieldValue(payload, "topLevelNumber")).toBe(42);
    });

    it("extracts deeply nested properties", () => {
      expect(extractFieldValue(payload, "user.profile.settings.theme")).toBe("dark");
      expect(extractFieldValue(payload, "user.profile.settings.score")).toBe(95.5);
    });

    it("returns undefined for non-existent path", () => {
      expect(extractFieldValue(payload, "user.nonExistent.property")).toBeUndefined();
      expect(extractFieldValue(payload, "nonExistentKey")).toBeUndefined();
    });

    it("safely handles null in intermediate path", () => {
      expect(extractFieldValue(payload, "user.metadata.someKey")).toBeUndefined();
    });

    it("safely handles undefined or empty object", () => {
      expect(getNestedValue({}, "any.path")).toBeUndefined();
    });
  });

  describe("evaluateOperator - Null / Undefined Safety", () => {
    it("returns false if actual is undefined or null", () => {
      expect(evaluateOperator(undefined, "EQUALS", "foo")).toBe(false);
      expect(evaluateOperator(null, "EQUALS", "foo")).toBe(false);
      expect(evaluateOperator(undefined, "GREATER_THAN", "10")).toBe(false);
      expect(evaluateOperator(null, "REGEX", ".*")).toBe(false);
    });
  });

  describe("evaluateOperator - EQUALS & NOT_EQUALS", () => {
    it("evaluates string equality", () => {
      expect(evaluateOperator("active", "EQUALS", "active")).toBe(true);
      expect(evaluateOperator("inactive", "EQUALS", "active")).toBe(false);
    });

    it("evaluates number to string equality", () => {
      expect(evaluateOperator(250, "EQUALS", "250")).toBe(true);
      expect(evaluateOperator(251, "EQUALS", "250")).toBe(false);
    });

    it("evaluates NOT_EQUALS correctly", () => {
      expect(evaluateOperator("pending", "NOT_EQUALS", "active")).toBe(true);
      expect(evaluateOperator("active", "NOT_EQUALS", "active")).toBe(false);
    });
  });

  describe("evaluateOperator - Numeric Comparisons", () => {
    it("evaluates GREATER_THAN correctly", () => {
      expect(evaluateOperator(250.01, "GREATER_THAN", "250")).toBe(true);
      expect(evaluateOperator(250, "GREATER_THAN", "250")).toBe(false);
      expect(evaluateOperator(249, "GREATER_THAN", "250")).toBe(false);
    });

    it("evaluates LESS_THAN correctly", () => {
      expect(evaluateOperator(249.99, "LESS_THAN", "250")).toBe(true);
      expect(evaluateOperator(250, "LESS_THAN", "250")).toBe(false);
      expect(evaluateOperator(251, "LESS_THAN", "250")).toBe(false);
    });

    it("evaluates GREATER_THAN_OR_EQUAL correctly at boundaries", () => {
      expect(evaluateOperator(250, "GREATER_THAN_OR_EQUAL", "250")).toBe(true);
      expect(evaluateOperator(251, "GREATER_THAN_OR_EQUAL", "250")).toBe(true);
      expect(evaluateOperator(249.99, "GREATER_THAN_OR_EQUAL", "250")).toBe(false);
    });

    it("evaluates LESS_THAN_OR_EQUAL correctly at boundaries", () => {
      expect(evaluateOperator(250, "LESS_THAN_OR_EQUAL", "250")).toBe(true);
      expect(evaluateOperator(249, "LESS_THAN_OR_EQUAL", "250")).toBe(true);
      expect(evaluateOperator(250.01, "LESS_THAN_OR_EQUAL", "250")).toBe(false);
    });

    it("safely handles non-numeric actual or target", () => {
      expect(evaluateOperator("notANumber", "GREATER_THAN", "250")).toBe(false);
      expect(evaluateOperator(250, "GREATER_THAN", "notANumber")).toBe(false);
    });
  });

  describe("evaluateOperator - CONTAINS", () => {
    it("checks substring case-insensitively", () => {
      expect(evaluateOperator("AdminUser_V2", "CONTAINS", "admin")).toBe(true);
      expect(evaluateOperator("hello world", "CONTAINS", "WORLD")).toBe(true);
      expect(evaluateOperator("secure", "CONTAINS", "unsecure")).toBe(false);
    });
  });

  describe("evaluateOperator - REGEX", () => {
    it("handles standard patterns", () => {
      expect(evaluateOperator("order_12345", "REGEX", "^order_\\d+$")).toBe(true);
      expect(evaluateOperator("invalid_order", "REGEX", "^order_\\d+$")).toBe(false);
    });

    it("handles inline (?i) case-insensitivity prefix", () => {
      expect(evaluateOperator("drop table users", "REGEX", "(?i)DROP\\s+TABLE")).toBe(true);
      expect(evaluateOperator("select * from users", "REGEX", "(?i)DROP\\s+TABLE")).toBe(false);
    });

    it("handles /pattern/flags notation", () => {
      expect(evaluateOperator("DELETE FROM records", "REGEX", "/delete\\s+from/i")).toBe(true);
    });

    it("safely returns false on invalid regex syntax without throwing", () => {
      expect(evaluateOperator("test", "REGEX", "[unclosed group")).toBe(false);
    });
  });

  describe("evaluateOperator - IN Operator", () => {
    it("handles comma-separated lists with whitespace", () => {
      expect(evaluateOperator("superadmin", "IN", " admin , superadmin , root ")).toBe(true);
      expect(evaluateOperator("guest", "IN", " admin , superadmin , root ")).toBe(false);
    });
  });
});

