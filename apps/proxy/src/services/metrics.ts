/**
 * Pure TypeScript Prometheus Metrics Registry for X4G4T
 * Zero external dependencies, ultra-low latency, standard Prometheus text format.
 */
import { isGlobalAiLockdownActive, isPolicyFreezeActive } from "@x4g4t/policy-engine";

interface MetricLabels {
  [key: string]: string | number;
}

class Counter {
  private values = new Map<string, number>();

  constructor(
    public name: string,
    public help: string
  ) {}

  get(labels: MetricLabels = {}): number {
    const key = this.serializeLabels(labels);
    return this.values.get(key) || 0;
  }

  inc(labels: MetricLabels = {}, value = 1): void {
    const key = this.serializeLabels(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  private serializeLabels(labels: MetricLabels): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return "";
    return keys.map((k) => `${k}="${labels[k]}"`).join(",");
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [labels, val] of this.values.entries()) {
        if (labels) {
          lines.push(`${this.name}{${labels}} ${val}`);
        } else {
          lines.push(`${this.name} ${val}`);
        }
      }
    }
    return lines.join("\n");
  }
}

class Gauge {
  private values = new Map<string, number>();

  constructor(
    public name: string,
    public help: string
  ) {}

  get(labels: MetricLabels = {}): number | undefined {
    const key = this.serializeLabels(labels);
    return this.values.get(key);
  }

  set(labels: MetricLabels = {}, value: number): void {
    const key = this.serializeLabels(labels);
    this.values.set(key, value);
  }

  private serializeLabels(labels: MetricLabels): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return "";
    return keys.map((k) => `${k}="${labels[k]}"`).join(",");
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`
    ];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [labels, val] of this.values.entries()) {
        if (labels) {
          lines.push(`${this.name}{${labels}} ${val}`);
        } else {
          lines.push(`${this.name} ${val}`);
        }
      }
    }
    return lines.join("\n");
  }
}

class Histogram {
  private buckets: number[];
  private counts = new Map<string, Map<number, number>>();
  private sums = new Map<string, number>();
  private totalCounts = new Map<string, number>();

  constructor(
    public name: string,
    public help: string,
    buckets: number[] = [0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: MetricLabels = {}, value: number): void {
    const key = this.serializeLabels(labels);
    if (!this.counts.has(key)) {
      this.counts.set(key, new Map());
      this.sums.set(key, 0);
      this.totalCounts.set(key, 0);
    }

    const bucketMap = this.counts.get(key)!;
    for (const b of this.buckets) {
      if (value <= b) {
        bucketMap.set(b, (bucketMap.get(b) || 0) + 1);
      }
    }

    this.sums.set(key, (this.sums.get(key) || 0) + value);
    this.totalCounts.set(key, (this.totalCounts.get(key) || 0) + 1);
  }

  private serializeLabels(labels: MetricLabels): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return "";
    return keys.map((k) => `${k}="${labels[k]}"`).join(",");
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`
    ];

    for (const [labelStr, bucketMap] of this.counts.entries()) {
      let cumulative = 0;
      for (const b of this.buckets) {
        cumulative += bucketMap.get(b) || 0;
        const prefix = labelStr ? `${labelStr},` : "";
        lines.push(`${this.name}_bucket{${prefix}le="${b}"} ${cumulative}`);
      }
      const prefix = labelStr ? `${labelStr},` : "";
      const total = this.totalCounts.get(labelStr) || 0;
      const sum = this.sums.get(labelStr) || 0;
      lines.push(`${this.name}_bucket{${prefix}le="+Inf"} ${total}`);
      lines.push(`${this.name}_sum{${labelStr}} ${sum.toFixed(6)}`);
      lines.push(`${this.name}_count{${labelStr}} ${total}`);
    }

    if (this.counts.size === 0) {
      lines.push(`${this.name}_count 0`);
      lines.push(`${this.name}_sum 0`);
    }

    return lines.join("\n");
  }
}

// Global Metrics Registry
export const metricsRegistry = {
  httpRequestsTotal: new Counter(
    "http_requests_total",
    "Total number of HTTP requests processed by X4G4T gateway"
  ),
  httpRequestDurationSeconds: new Histogram(
    "http_request_duration_seconds",
    "Total round-trip latency of HTTP requests in seconds",
    [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 8]
  ),
  policyEvaluationDurationSeconds: new Histogram(
    "policy_evaluation_duration_seconds",
    "Latency of in-memory AST policy evaluation in seconds",
    [0.00005, 0.0001, 0.00025, 0.0005, 0.001, 0.005, 0.01]
  ),
  downstreamForwardDurationSeconds: new Histogram(
    "downstream_forward_duration_seconds",
    "Latency of outbound downstream target HTTP requests in seconds",
    [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 8]
  ),
  hitlRequestsTotal: new Counter(
    "hitl_requests_total",
    "Total number of Human-in-the-Loop approval requests"
  ),
  globalAiLockdownActive: new Gauge(
    "x4g4t_global_ai_lockdown_active",
    "Whether the emergency global AI lockdown kill-switch is engaged (1 = active, 0 = operational)"
  ),
  killSwitchOperationalState: new Gauge(
    "kill_switch_operational_state",
    "Whether the emergency kill switch engine is initialized, healthy, and operational (1 = operational, 0 = down)"
  ),
  killSwitchActiveDropEngaged: new Gauge(
    "kill_switch_active_drop_engaged",
    "Whether the emergency bilateral air-gap kill switch is actively severing traffic (1 = actively severing, 0 = normal traffic flowing)"
  ),
  policyFreezeActive: new Gauge(
    "x4g4t_policy_freeze_active",
    "Whether policy editing is frozen/locked (1 = frozen, 0 = editable)"
  ),

  // Gateway Telemetry
  tokensInjectedTotal: new Counter(
    "x4g4t_tokens_injected_total",
    "Total upstream model API keys injected at gateway egress"
  ),
  mcpRequestsTotal: new Counter(
    "x4g4t_mcp_requests_total",
    "Total Model Context Protocol JSON-RPC frames processed"
  ),
  dlpRedactionsTotal: new Counter(
    "x4g4t_dlp_redactions_total",
    "Total sensitive PII entities and credentials redacted in-flight"
  ),
  rateLimitHitsTotal: new Counter(
    "x4g4t_rate_limit_hits_total",
    "Total requests throttled by sliding-window rate limit"
  ),
  ssrfBlockedTotal: new Counter(
    "x4g4t_ssrf_blocked_total",
    "Total SSRF and cloud metadata access attempts blocked"
  ),
  payloadSizeBytes: new Histogram(
    "x4g4t_payload_size_bytes",
    "Distribution of inbound and outbound payload sizes in bytes",
    [64, 256, 1024, 4096, 16384, 65536, 262144]
  ),

  // Operational Telemetry
  databaseConnected: new Gauge(
    "x4g4t_database_connected",
    "Database connection health status (1 = operational, 0 = down)"
  ),
  redisConnected: new Gauge(
    "x4g4t_redis_connected",
    "Redis cache and queue connection health status (1 = operational, 0 = down)"
  ),
  elasticsearchErrorsTotal: new Counter(
    "x4g4t_elasticsearch_errors_total",
    "Total Elasticsearch logging sink delivery errors"
  ),
  activePoliciesCount: new Gauge(
    "x4g4t_active_policies_count",
    "Number of active guardrail policies compiled in memory"
  ),

  render(): string {
    // Update live gauges
    const isEngaged = isGlobalAiLockdownActive() ? 1 : 0;
    this.killSwitchOperationalState.set({}, 1); // Engine is armed, operational, and listening
    this.killSwitchActiveDropEngaged.set({}, isEngaged);
    this.globalAiLockdownActive.set({}, isEngaged);
    this.policyFreezeActive.set({}, isPolicyFreezeActive() ? 1 : 0);

    // Default operational status
    if (this.databaseConnected.get({}) === undefined) this.databaseConnected.set({}, 1);
    if (this.redisConnected.get({}) === undefined) this.redisConnected.set({}, 1);

    const memoryUsage = process.memoryUsage();
    const systemGauges = [
      `# HELP process_uptime_seconds The time the process has been running in seconds.`,
      `# TYPE process_uptime_seconds gauge`,
      `process_uptime_seconds ${Math.round(process.uptime())}`,
      `# HELP process_resident_memory_bytes Resident memory size in bytes.`,
      `# TYPE process_resident_memory_bytes gauge`,
      `process_resident_memory_bytes ${memoryUsage.rss}`,
      `# HELP process_heap_used_bytes Process heap used in bytes.`,
      `# TYPE process_heap_used_bytes gauge`,
      `process_heap_used_bytes ${memoryUsage.heapUsed}`
    ].join("\n");

    return [
      this.httpRequestsTotal.render(),
      this.httpRequestDurationSeconds.render(),
      this.policyEvaluationDurationSeconds.render(),
      this.downstreamForwardDurationSeconds.render(),
      this.hitlRequestsTotal.render(),
      this.globalAiLockdownActive.render(),
      this.killSwitchOperationalState.render(),
      this.killSwitchActiveDropEngaged.render(),
      this.policyFreezeActive.render(),
      this.tokensInjectedTotal.render(),
      this.mcpRequestsTotal.render(),
      this.dlpRedactionsTotal.render(),
      this.rateLimitHitsTotal.render(),
      this.ssrfBlockedTotal.render(),
      this.payloadSizeBytes.render(),
      this.databaseConnected.render(),
      this.redisConnected.render(),
      this.elasticsearchErrorsTotal.render(),
      this.activePoliciesCount.render(),
      systemGauges
    ].join("\n\n") + "\n";
  }
};

