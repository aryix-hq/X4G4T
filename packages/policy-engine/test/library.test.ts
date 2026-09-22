import { describe, it, expect } from "vitest";
import {
  PREDEFINED_POLICY_LIBRARY,
  getPredefinedPolicy,
  getPoliciesByCategory,
  searchPredefinedPolicies,
  evaluateAgentExecution,
  CompiledPolicy
} from "../src/index.js";

describe("Predefined Policy Library Verification", () => {
  it("contains at least 30 predefined policies across all 10 categories", () => {
    expect(PREDEFINED_POLICY_LIBRARY.length).toBeGreaterThanOrEqual(30);

    const categories = new Set(PREDEFINED_POLICY_LIBRARY.map((p) => p.category));
    expect(categories.has("Fintech")).toBe(true);
    expect(categories.has("Security")).toBe(true);
    expect(categories.has("DevOps")).toBe(true);
    expect(categories.has("CRM")).toBe(true);
    expect(categories.has("Healthcare")).toBe(true);
    expect(categories.has("Cybersecurity")).toBe(true);
    expect(categories.has("HR")).toBe(true);
    expect(categories.has("AI Providers")).toBe(true);
    expect(categories.has("Spend Control")).toBe(true);
    expect(categories.has("IAM & Access")).toBe(true);
  });

  it("ensures each policy has unique ID, valid rule, and complete metadata", () => {
    const ids = new Set<string>();
    for (const policy of PREDEFINED_POLICY_LIBRARY) {
      expect(ids.has(policy.id)).toBe(false);
      ids.add(policy.id);

      expect(policy.name).toBeTruthy();
      expect(policy.useCase).toBeTruthy();
      expect(policy.threatModel).toBeTruthy();
      expect(policy.targetTool).toBeTruthy();
      expect(["BLOCK", "REQUIRE_APPROVAL", "ALLOW"]).toContain(policy.actionOnMatch);
      expect(policy.rule.fieldPath).toBeTruthy();
      expect(policy.rule.operator).toBeTruthy();
      expect(policy.rule.targetValue).toBeTruthy();
      expect(policy.samplePayload).toBeDefined();
    }
  });

  it("successfully compiles and evaluates every predefined policy against its sample payload", () => {
    for (const policy of PREDEFINED_POLICY_LIBRARY) {
      const compiledPolicy: CompiledPolicy = {
        id: policy.id,
        name: policy.name,
        targetTool: policy.targetTool,
        actionOnMatch: policy.actionOnMatch,
        rules: [
          {
            id: `rule_${policy.id}`,
            fieldPath: policy.rule.fieldPath,
            operator: policy.rule.operator,
            targetValue: policy.rule.targetValue
          }
        ]
      };

      const result = evaluateAgentExecution([compiledPolicy], {
        toolName: policy.samplePayload.tool,
        arguments: policy.samplePayload.arguments,
        iam: policy.samplePayload.iam
      });

      expect(result.verdict).toBe(policy.expectedResult);
      if (policy.expectedResult !== "ALLOW") {
        expect(result.matchedPolicyId).toBe(policy.id);
      }
    }
  });

  it("supports category filtering and search queries", () => {
    const fintech = getPoliciesByCategory("Fintech");
    expect(fintech.length).toBeGreaterThanOrEqual(3);
    for (const p of fintech) {
      expect(p.category).toBe("Fintech");
    }

    const aiPolicies = getPoliciesByCategory("AI Providers");
    expect(aiPolicies.length).toBeGreaterThanOrEqual(5);
    for (const p of aiPolicies) {
      expect(p.category).toBe("AI Providers");
    }

    const spendPolicies = getPoliciesByCategory("Spend Control");
    expect(spendPolicies.length).toBeGreaterThanOrEqual(3);
    for (const p of spendPolicies) {
      expect(p.category).toBe("Spend Control");
    }

    const iamPolicies = getPoliciesByCategory("IAM & Access");
    expect(iamPolicies.length).toBeGreaterThanOrEqual(3);
    for (const p of iamPolicies) {
      expect(p.category).toBe("IAM & Access");
    }

    const sqlPolicies = searchPredefinedPolicies("SQL");
    expect(sqlPolicies.length).toBeGreaterThanOrEqual(1);
    expect(sqlPolicies.some((p) => p.id === "security-destructive-sql")).toBe(true);

    const specific = getPredefinedPolicy("fintech-refund-cap-250");
    expect(specific).toBeDefined();
    expect(specific?.name).toContain("Refund Threshold");
  });
});
