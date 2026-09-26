import { describe, it, expect } from "vitest";
import {
  evaluateAgentExecution,
  extractFieldValue,
  evaluateRuleCondition,
  CompiledPolicy,
  RuleOperator
} from "@x4g4t/policy-engine";

describe("SUITE 1.1: Business Logic - Ingress & Egress Policy Engine Core", () => {
  describe("Dot-Path Extraction & Array Projection Invariants", () => {
    it("should resolve root-level scalar values", () => {
      const payload = { action: "refund", amount: 150 };
      expect(extractFieldValue(payload, "action")).toBe("refund");
      expect(extractFieldValue(payload, "amount")).toBe(150);
    });

    it("should resolve deep JSON paths safely", () => {
      const payload = {
        transaction: {
          metadata: {
            recipient: {
              account_id: "acct_987654321"
            }
          }
        }
      };
      expect(extractFieldValue(payload, "transaction.metadata.recipient.account_id")).toBe("acct_987654321");
    });

    it("should extract indexed array elements (e.g. items[0].price)", () => {
      const payload = {
        items: [
          { sku: "A1", price: 45.0 },
          { sku: "B2", price: 120.0 }
        ]
      };
      expect(extractFieldValue(payload, "items[0].price")).toBe(45.0);
      expect(extractFieldValue(payload, "items[1].sku")).toBe("B2");
    });

    it("should extract array wildcard projections (e.g. items[*].price)", () => {
      const payload = {
        items: [
          { sku: "A1", price: 45.0 },
          { sku: "B2", price: 120.0 }
        ]
      };
      const prices = extractFieldValue(payload, "items[*].price");
      expect(prices).toEqual([45.0, 120.0]);
    });

    it("should return undefined gracefully for missing keys, null, and undefined values without uncaught exceptions", () => {
      const payload = {
        metadata: null,
        emptyObj: {}
      };
      expect(extractFieldValue(payload, "metadata.key")).toBeUndefined();
      expect(extractFieldValue(payload, "missing.deep.nested.path")).toBeUndefined();
      expect(extractFieldValue(null, "some.path")).toBeUndefined();
      expect(extractFieldValue(undefined, "some.path")).toBeUndefined();
      expect(extractFieldValue({ list: null }, "list[*].price")).toBeUndefined();
    });
  });

  describe("Operator Matrix Invariant Proofs", () => {
    const operators: { op: RuleOperator; actual: unknown; target: string; expected: boolean }[] = [
      { op: "EQUALS", actual: "production", target: "production", expected: true },
      { op: "EQUALS", actual: "staging", target: "production", expected: false },
      { op: "NOT_EQUALS", actual: "development", target: "production", expected: true },
      { op: "NOT_EQUALS", actual: "production", target: "production", expected: false },
      { op: "GREATER_THAN", actual: 150, target: "100", expected: true },
      { op: "GREATER_THAN", actual: 50, target: "100", expected: false },
      { op: "LESS_THAN", actual: 50, target: "100", expected: true },
      { op: "LESS_THAN", actual: 150, target: "100", expected: false },
      { op: "GTE", actual: 100, target: "100", expected: true },
      { op: "GTE", actual: 99, target: "100", expected: false },
      { op: "LTE", actual: 100, target: "100", expected: true },
      { op: "LTE", actual: 101, target: "100", expected: false },
      { op: "CONTAINS", actual: "Bearer secret-token-xyz", target: "secret-token", expected: true },
      { op: "CONTAINS", actual: "Bearer public-token-xyz", target: "secret-token", expected: false },
      { op: "REGEX", actual: "DROP TABLE users;", target: "(?i)DROP\\s+TABLE", expected: true },
      { op: "REGEX", actual: "SELECT * FROM users;", target: "(?i)DROP\\s+TABLE", expected: false },
      { op: "IN", actual: "admin", target: "admin,root,superuser", expected: true },
      { op: "IN", actual: "guest", target: "admin,root,superuser", expected: false }
    ];

    for (const { op, actual, target, expected } of operators) {
      it(`should evaluate operator '${op}' correctly (actual: ${JSON.stringify(actual)}, target: '${target}') -> ${expected}`, () => {
        const result = evaluateRuleCondition(actual, op, target);
        expect(result).toBe(expected);
      });
    }

    it("should evaluate array actual values with quantifier semantics", () => {
      expect(evaluateRuleCondition([10, 50, 150], "GREATER_THAN", "100")).toBe(true);
      expect(evaluateRuleCondition([10, 20, 30], "GREATER_THAN", "100")).toBe(false);
      expect(evaluateRuleCondition(["alpha", "beta", "gamma"], "EQUALS", "beta")).toBe(true);
    });
  });

  describe("Compound AND / OR Logic Tree Evaluation", () => {
    it("should evaluate compound AND policies with correct short-circuit execution", () => {
      const policy: CompiledPolicy = {
        id: "pol_and_strict",
        name: "High Value Refund Approval",
        targetTool: "issue_refund",
        actionOnMatch: "REQUIRE_APPROVAL",
        matchLogic: "AND",
        rules: [
          {
            id: "rule_amount",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "500"
          },
          {
            id: "rule_currency",
            fieldPath: "currency",
            operator: "EQUALS",
            targetValue: "USD"
          }
        ]
      };

      const matchRes = evaluateAgentExecution([policy], {
        toolName: "issue_refund",
        arguments: { amount: 600, currency: "USD" }
      });
      expect(matchRes.verdict).toBe("REQUIRE_APPROVAL");

      const partialRes = evaluateAgentExecution([policy], {
        toolName: "issue_refund",
        arguments: { amount: 600, currency: "EUR" }
      });
      expect(partialRes.verdict).toBe("ALLOW");
    });

    it("should evaluate compound OR policies correctly", () => {
      const policy: CompiledPolicy = {
        id: "pol_or_catch",
        name: "Catch Suspicious Transfer",
        targetTool: "transfer_funds",
        actionOnMatch: "BLOCK",
        matchLogic: "OR",
        rules: [
          {
            id: "rule_high_amt",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "10000"
          },
          {
            id: "rule_sanctioned",
            fieldPath: "recipient_country",
            operator: "IN",
            targetValue: "SANCTIONED_A,SANCTIONED_B"
          }
        ]
      };

      const matchAmt = evaluateAgentExecution([policy], {
        toolName: "transfer_funds",
        arguments: { amount: 15000, recipient_country: "US" }
      });
      expect(matchAmt.verdict).toBe("BLOCK");

      const matchCountry = evaluateAgentExecution([policy], {
        toolName: "transfer_funds",
        arguments: { amount: 100, recipient_country: "SANCTIONED_A" }
      });
      expect(matchCountry.verdict).toBe("BLOCK");

      const clean = evaluateAgentExecution([policy], {
        toolName: "transfer_funds",
        arguments: { amount: 100, recipient_country: "US" }
      });
      expect(clean.verdict).toBe("ALLOW");
    });
  });

  describe("Latency Ceiling Under 50 Active Rules", () => {
    it("should evaluate policies with 50 active rules in <= 5ms", () => {
      const generatedRules = Array.from({ length: 50 }, (_, i) => ({
        id: `rule_benchmark_${i}`,
        fieldPath: `metadata.field_${i}`,
        operator: "GREATER_THAN" as RuleOperator,
        targetValue: "100"
      }));

      const heavyPolicy: CompiledPolicy = {
        id: "pol_heavy_50_rules",
        name: "50-Rule Enterprise Guard",
        targetTool: "complex_pipeline",
        actionOnMatch: "BLOCK",
        matchLogic: "AND",
        rules: generatedRules
      };

      const testPayload = {
        metadata: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`field_${i}`, 150]))
      };

      const start = performance.now();
      const result = evaluateAgentExecution([heavyPolicy], {
        toolName: "complex_pipeline",
        arguments: testPayload
      });
      const durationMs = performance.now() - start;

      expect(result.verdict).toBe("BLOCK");
      expect(durationMs).toBeLessThanOrEqual(5.0);
    });
  });
});

