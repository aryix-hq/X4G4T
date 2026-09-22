import { describe, it, expect } from "vitest";
import {
  evaluateAgentExecution,
  CompiledPolicy
} from "@x4g4t/policy-engine";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockPoliciesForOrg, clearPolicyCache } from "../src/services/gateway.js";

describe("X4G4T Empirical Performance & Latency Benchmarking", () => {
  const TEST_ORG = "org_perf_benchmark";
  const TEST_KEY = "sec_live_perf_benchmark_token_12345";

  const benchmarkPolicies: CompiledPolicy[] = [
    {
      id: "pol_bench_1",
      name: "Benchmark Refund Cap",
      targetTool: "issue_refund",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_1",
          fieldPath: "transaction.amount",
          operator: "GREATER_THAN",
          targetValue: "500"
        },
        {
          id: "rule_2",
          fieldPath: "transaction.currency",
          operator: "EQUALS",
          targetValue: "USD"
        }
      ]
    },
    {
      id: "pol_bench_2",
      name: "Benchmark SQL Guard",
      targetTool: "execute_sql",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_sql",
          fieldPath: "query",
          operator: "REGEX",
          targetValue: "(?i)(DROP|TRUNCATE)\\s+TABLE"
        }
      ]
    }
  ];

  it("Benchmark 1: In-Memory AST Policy Evaluation (100,000 iterations)", () => {
    const context = {
      toolName: "issue_refund",
      arguments: {
        transaction: {
          amount: 250,
          currency: "USD",
          customer: "cust_bench_user"
        }
      }
    };

    // Warm up V8 JIT
    for (let i = 0; i < 5000; i++) {
      evaluateAgentExecution(benchmarkPolicies, context);
    }

    const iterations = 100_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluateAgentExecution(benchmarkPolicies, context);
    }
    const elapsedMs = performance.now() - start;

    const avgMs = elapsedMs / iterations;
    const opsPerSec = Math.round(iterations / (elapsedMs / 1000));

    console.log(`\n======================================================`);
    console.log(`[AST Engine Benchmark]: 100,000 evaluations completed`);
    console.log(`Total Time:     ${elapsedMs.toFixed(2)}ms`);
    console.log(`Avg Latency:    ${(avgMs * 1000).toFixed(2)} microseconds (${avgMs.toFixed(5)}ms)`);
    console.log(`Throughput:     ${opsPerSec.toLocaleString()} evaluations/sec`);
    console.log(`======================================================\n`);

    expect(avgMs).toBeLessThan(0.05); // Less than 50 microseconds
    expect(opsPerSec).toBeGreaterThan(20_000); // More than 20,000 evals/sec
  });

  it("Benchmark 2: Fastify Proxy Gateway Ingestion Hot Path (1,000 iterations)", async () => {
    const app = buildApp();
    clearTokenCache();
    clearPolicyCache();
    setMockApiKey(TEST_KEY, TEST_ORG);
    setMockPoliciesForOrg(TEST_ORG, benchmarkPolicies);

    process.env.RATE_LIMIT_DISABLED = "true";
    const latencies: number[] = [];
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const res = await app.inject({
        method: "POST",
        url: "/v1/gateway/execute",
        headers: {
          authorization: `Bearer ${TEST_KEY}`,
          "x-agent-id": "bench_agent"
        },
        payload: {
          agent_id: "bench_agent",
          tool_name: "issue_refund",
          arguments: {
            transaction: {
              amount: 1500, // triggers BLOCK
              currency: "USD"
            }
          },
          downstream_url: "https://api.stripe.com/v1/refunds"
        }
      });
      const duration = performance.now() - start;
      latencies.push(duration);
      expect(res.statusCode).toBe(422);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(iterations * 0.50)]!;
    const p90 = latencies[Math.floor(iterations * 0.90)]!;
    const p95 = latencies[Math.floor(iterations * 0.95)]!;
    const p99 = latencies[Math.floor(iterations * 0.99)]!;
    const max = latencies[latencies.length - 1]!;
    const avg = latencies.reduce((a, b) => a + b, 0) / iterations;

    console.log(`\n======================================================`);
    console.log(`[Fastify Gateway Ingestion Benchmark]: 1,000 requests`);
    console.log(`P50 Latency:    ${p50.toFixed(3)}ms`);
    console.log(`P90 Latency:    ${p90.toFixed(3)}ms`);
    console.log(`P95 Latency:    ${p95.toFixed(3)}ms`);
    console.log(`P99 Latency:    ${p99.toFixed(3)}ms`);
    console.log(`Max Latency:    ${max.toFixed(3)}ms`);
    console.log(`Avg Latency:    ${avg.toFixed(3)}ms`);
    console.log(`======================================================\n`);

    expect(p95).toBeLessThan(15); // Strict <15ms SLA
  });
});

