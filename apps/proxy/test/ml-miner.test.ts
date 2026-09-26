import { describe, it, expect, beforeEach } from "vitest";
import {
  feedSampleExecutions,
  clearSampleExecutionBuffer,
  runMlMinerAnalysis,
  calculatePercentile,
  calculateStats
} from "../src/workers/ml-miner.js";

describe("Phase 4: ML Pattern Miner & Policy Recommendation Engine", () => {
  const orgId = "org_ml_test";

  beforeEach(() => {
    clearSampleExecutionBuffer();
  });

  it("calculates accurate percentiles and distribution statistics", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p50 = calculatePercentile(values, 50);
    const p90 = calculatePercentile(values, 90);
    const p99 = calculatePercentile(values, 99);

    expect(p50).toBe(55);
    expect(p90).toBe(91);
    expect(p99).toBeCloseTo(99.1, 0.5);

    const stats = calculateStats(values);
    expect(stats.mean).toBe(55);
    expect(stats.stdDev).toBeGreaterThan(0);
  });

  it("discovers numeric upper bound guardrail recommendations with 15% safety buffer", async () => {
    // Feed 30 realistic executions for tool 'issue_refund' where 99% of amounts are <= 180
    const sampleExecutions = [];
    for (let i = 0; i < 28; i++) {
      sampleExecutions.push({
        orgId,
        toolName: "issue_refund",
        arguments: { amount: 20 + (i * 5), customerId: `cust_${i}` },
        verdict: "PASSED" as const
      });
    }
    // High normal values
    sampleExecutions.push({
      orgId,
      toolName: "issue_refund",
      arguments: { amount: 180, customerId: "cust_high" },
      verdict: "PASSED" as const
    });

    feedSampleExecutions(sampleExecutions);

    const recommendations = await runMlMinerAnalysis(orgId);
    expect(recommendations.length).toBeGreaterThan(0);

    const refundRec = recommendations.find(
      (r) => r.targetTool === "issue_refund" && r.fieldPath === "amount"
    );

    expect(refundRec).toBeDefined();
    expect(refundRec!.suggestedOperator).toBe("LESS_THAN_OR_EQUAL");
    // p99 * 1.15 is around 200
    const targetVal = Number(refundRec!.suggestedTargetValue);
    expect(targetVal).toBeGreaterThanOrEqual(180);
    expect(targetVal).toBeLessThan(250);
    expect(refundRec!.confidenceScore).toBeGreaterThanOrEqual(0.85);
    expect(refundRec!.distribution).toBeDefined();
    expect(refundRec!.distribution!.histogramBuckets.length).toBeGreaterThan(0);
  });

  it("detects discrete categorical strings and proposes IN whitelist guardrails", async () => {
    // Feed 15 executions with discrete currencies: USD, EUR, GBP
    const sampleExecutions = [];
    const currencies = ["USD", "EUR", "GBP"];
    for (let i = 0; i < 15; i++) {
      sampleExecutions.push({
        orgId,
        toolName: "payment_process",
        arguments: {
          currency: currencies[i % currencies.length]!,
          amount: 50
        },
        verdict: "PASSED" as const
      });
    }

    feedSampleExecutions(sampleExecutions);

    const recommendations = await runMlMinerAnalysis(orgId);
    const currencyRec = recommendations.find(
      (r) => r.targetTool === "payment_process" && r.fieldPath === "currency"
    );

    expect(currencyRec).toBeDefined();
    expect(currencyRec!.suggestedOperator).toBe("IN");
    expect(currencyRec!.suggestedTargetValue).toContain("USD");
    expect(currencyRec!.suggestedTargetValue).toContain("EUR");
    expect(currencyRec!.suggestedTargetValue).toContain("GBP");
  });
});

