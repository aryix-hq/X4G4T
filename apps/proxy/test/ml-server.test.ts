import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildMlService } from "../src/ml-server.js";
import { clearSampleExecutionBuffer } from "../src/workers/ml-miner.js";
import type { FastifyInstance } from "fastify";

describe("Independent ML Microservice Daemon (x4g4t-ml-service)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    clearSampleExecutionBuffer();
    app = await buildMlService();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("should respond with 200 OK and health telemetry on /health", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("x4g4t-ml-service");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(typeof body.memoryUsageMb).toBe("number");
    expect(typeof body.activeRecommendationsCount).toBe("number");
  });

  it("should synthesize P99 + 15% buffer rule ceiling via /mine", async () => {
    const samples = [
      { orgId: "org_test", toolName: "issue_refund", arguments: { amount: 20 }, verdict: "PASSED" as const },
      { orgId: "org_test", toolName: "issue_refund", arguments: { amount: 35 }, verdict: "PASSED" as const },
      { orgId: "org_test", toolName: "issue_refund", arguments: { amount: 45 }, verdict: "PASSED" as const },
      { orgId: "org_test", toolName: "issue_refund", arguments: { amount: 60 }, verdict: "PASSED" as const },
      { orgId: "org_test", toolName: "issue_refund", arguments: { amount: 100 }, verdict: "PASSED" as const },
      { orgId: "org_test", toolName: "issue_refund", arguments: { amount: 100 }, verdict: "PASSED" as const }
    ];

    const feedRes = await app.inject({
      method: "POST",
      url: "/samples",
      payload: { samples }
    });
    expect(feedRes.statusCode).toBe(200);

    const mineRes = await app.inject({
      method: "POST",
      url: "/mine",
      payload: { orgId: "org_test" }
    });

    expect(mineRes.statusCode).toBe(200);
    const mineBody = mineRes.json();
    expect(mineBody.success).toBe(true);
    expect(mineBody.count).toBeGreaterThanOrEqual(1);

    const rec = mineBody.recommendations.find(
      (r: any) => r.targetTool === "issue_refund" && r.fieldPath === "amount"
    );
    expect(rec).toBeDefined();
    expect(rec.suggestedOperator).toBe("LESS_THAN_OR_EQUAL");
    expect(Number(rec.suggestedTargetValue)).toBe(115);
  });
});

