import { describe, it, expect } from "vitest";
import { metricsRegistry } from "../src/services/metrics.js";

describe("Prometheus Metrics Service", () => {
  it("should record counter increments with labels", () => {
    metricsRegistry.httpRequestsTotal.inc({ method: "POST", route: "/api/v1/gateway/execute", status: "200" });
    const rendered = metricsRegistry.render();
    expect(rendered).toContain("http_requests_total");
    expect(rendered).toContain('method="POST"');
    expect(rendered).toContain('route="/api/v1/gateway/execute"');
    expect(rendered).toContain('status="200"');
  });

  it("should record histogram observations and buckets", () => {
    metricsRegistry.policyEvaluationDurationSeconds.observe({}, 0.002);
    metricsRegistry.policyEvaluationDurationSeconds.observe({}, 0.0005);
    const rendered = metricsRegistry.render();
    expect(rendered).toContain("policy_evaluation_duration_seconds_bucket");
    expect(rendered).toContain("policy_evaluation_duration_seconds_count");
    expect(rendered).toContain("policy_evaluation_duration_seconds_sum");
  });

  it("should record gauges for emergency lockdown and policy freeze", () => {
    metricsRegistry.globalAiLockdownActive.set({}, 1);
    metricsRegistry.policyFreezeActive.set({}, 0);

    const rendered = metricsRegistry.render();
    expect(rendered).toContain("x4g4t_global_ai_lockdown_active");
    expect(rendered).toContain("x4g4t_policy_freeze_active");
  });

  it("should export in valid Prometheus text format", () => {
    const rendered = metricsRegistry.render();
    expect(rendered).toContain("# HELP");
    expect(rendered).toContain("# TYPE");
  });
});

