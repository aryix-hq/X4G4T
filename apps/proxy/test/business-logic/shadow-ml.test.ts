import { describe, it, expect, vi } from "vitest";
import {
  evaluateAgentExecution,
  CompiledPolicy,
  RuleOperator
} from "@x4g4t/policy-engine";
import { recordShadowEvaluation, clearShadowStore, getShadowViolations } from "../../src/services/shadow.js";
import { calculateDistribution, minePolicyRecommendations } from "../../src/workers/ml-miner.js";

describe("SUITE 1.4: Business Logic - Shadow/Learning Mode & ML Mining Engine", () => {
  const testOrg = "org_shadow_test_suite";

  describe("Counterfactual Non-Interference Invariant", () => {
    it("should record SHADOW_BLOCKED to telemetry without dropping live traffic", () => {
      const activePolicy: CompiledPolicy = {
        id: "pol_active_guard",
        name: "Standard SQL Guard",
        targetTool: "database_query",
        actionOnMatch: "BLOCK",
        matchLogic: "AND",
        rules: [
          {
            id: "r1",
            fieldPath: "query",
            operator: "REGEX",
            targetValue: "(?i)DROP\\s+DATABASE"
          }
        ]
      };

      const candidateShadowPolicy: CompiledPolicy = {
        id: "pol_shadow_candidate",
        name: "Proposed Strict Query Limit",
        targetTool: "database_query",
        actionOnMatch: "BLOCK",
        matchLogic: "AND",
        mode: "SHADOW_LEARN",
        rules: [
          {
            id: "r2",
            fieldPath: "limit",
            operator: "GREATER_THAN",
            targetValue: "1000"
          }
        ]
      };

      const evalResult = evaluateAgentExecution([activePolicy, candidateShadowPolicy], {
        toolName: "database_query",
        arguments: { query: "SELECT * FROM users", limit: 5000 }
      });

      // Live verdict must be ALLOW because the candidate policy is in SHADOW_LEARN
      expect(evalResult.verdict).toBe("ALLOW");

      // Shadow violations must capture the counterfactual projection
      expect(evalResult.shadowResults).toBeDefined();
      expect(evalResult.shadowResults?.length).toBe(1);
      expect(evalResult.shadowResults?.[0].policyId).toBe("pol_shadow_candidate");
      expect(evalResult.shadowResults?.[0].projectedVerdict).toBe("SHADOW_BLOCKED");
    });
  });

  describe("Metric Pipeline Accuracy & Lock-Free Rollup", () => {
    it("should increment shadow rollups asynchronously without write locks", async () => {
      clearShadowStore();

      await recordShadowEvaluation(testOrg, [
        {
          policyId: "pol_candidate_alpha",
          policyName: "Candidate Alpha",
          projectedVerdict: "SHADOW_BLOCKED",
          violatingRuleId: "r_alpha_1"
        }
      ]);

      const violations = getShadowViolations(testOrg);
      expect(violations).toBeDefined();
      expect(violations["pol_candidate_alpha"]).toBe(1);

      // Subsequent evaluation increments count
      await recordShadowEvaluation(testOrg, [
        {
          policyId: "pol_candidate_alpha",
          policyName: "Candidate Alpha",
          projectedVerdict: "SHADOW_BLOCKED",
          violatingRuleId: "r_alpha_1"
        }
      ]);

      const updated = getShadowViolations(testOrg);
      expect(updated["pol_candidate_alpha"]).toBe(2);
    });
  });

  describe("Outlier Calculation Sanity (Median, P99 & Minimum Sample Size N >= 50)", () => {
    it("should calculate Median and P99 accurately on distribution sets", () => {
      // 100 values from 1 to 100
      const dataset = Array.from({ length: 100 }, (_, i) => i + 1);
      const dist = calculateDistribution(dataset);

      expect(dist.count).toBe(100);
      expect(dist.median).toBe(50.5);
      expect(dist.p95).toBe(95.05);
      expect(dist.p99).toBe(99.01);
    });

    it("should reject noisy datasets with insufficient sample size (N < 50)", () => {
      const smallDataset = Array.from({ length: 49 }, (_, i) => ({
        toolName: "issue_refund",
        field: "amount",
        value: i + 1
      }));

      const recommendations = minePolicyRecommendations(smallDataset, { minSampleSize: 50 });
      // Should not recommend policies on datasets where N < 50
      expect(recommendations).toHaveLength(0);
    });

    it("should generate recommended policy boundaries when N >= 50", () => {
      const validDataset = Array.from({ length: 100 }, (_, i) => ({
        toolName: "issue_refund",
        field: "amount",
        value: 10 + (i % 20) // values 10..29
      }));

      const recommendations = minePolicyRecommendations(validDataset, { minSampleSize: 50 });
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].targetTool).toBe("issue_refund");
      expect(recommendations[0].suggestedThreshold).toBeGreaterThan(0);
    });
  });
});
