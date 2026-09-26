/**
 * Graylog REST API Integration Client for X4G4T Enterprise Telemetry
 * Provides high-throughput log querying, cluster metrics, and live stream inspection.
 * Author: ARYIX (OPC) Private Limited
 * Platform: X4G4T (X-Four-Gate) • Zero-Latency Headless Policy Firewall & DLP Proxy
 * Website: https://www.aryix.co.in/
 */

export interface GraylogConfig {
  url: string;
  apiToken?: string;
  username?: string;
  password?: string;
  streamId?: string;
  enabled: boolean;
}

export interface GraylogLogMessage {
  id: string;
  timestamp: string;
  source?: string;
  agentId: string;
  userEmail?: string;
  userName?: string;
  clientIp?: string;
  clientHostname?: string;
  sessionId?: string;
  toolName: string;
  verdict: "PASSED" | "BLOCKED" | "HELD";
  latencyMs: number;
  isStreaming: boolean;
  timeToFirstTokenMs?: number;
  totalTokens?: number;
  arguments?: Record<string, unknown>;
  policyName?: string | null;
  rawMessage?: Record<string, unknown>;
}

export interface GraylogSearchResult {
  success: boolean;
  total: number;
  timeRangeSeconds: number;
  logs: GraylogLogMessage[];
  executionTimeMs: number;
  error?: string;
}

export interface GraylogMetricsResult {
  healthy: boolean;
  status: "OPERATIONAL" | "OFFLINE" | "DEGRADED";
  version?: string;
  clusterId?: string;
  isProcessing?: boolean;
  incomingMessagesRate: number;
  outgoingMessagesRate: number;
  totalProcessedMessages: number;
  latencyMs: number;
  error?: string;
}

/**
 * Returns the current Graylog configuration from environment variables.
 */
export function getGraylogConfig(): GraylogConfig {
  const url = process.env.GRAYLOG_URL || "http://localhost:9000";
  const apiToken = process.env.GRAYLOG_API_TOKEN;
  const username = process.env.GRAYLOG_USERNAME || "admin";
  const password = process.env.GRAYLOG_PASSWORD || "admin";
  const streamId = process.env.GRAYLOG_STREAM_ID;
  const enabled = process.env.GRAYLOG_ENABLED === "true" || Boolean(process.env.GRAYLOG_URL);

  return {
    url: url.replace(/\/+$/, ""),
    apiToken,
    username,
    password,
    streamId,
    enabled
  };
}

/**
 * Builds HTTP headers for Graylog REST API requests.
 */
function getGraylogHeaders(config: GraylogConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-By": "X4G4T-Web-Dashboard"
  };

  if (config.apiToken) {
    const creds = Buffer.from(`${config.apiToken}:token`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  } else if (config.username && config.password) {
    const creds = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  }

  return headers;
}

/**
 * Performs a health and status ping against Graylog REST API /api/system.
 */
export async function checkGraylogHealth(): Promise<GraylogMetricsResult> {
  const config = getGraylogConfig();
  if (!config.enabled) {
    return {
      healthy: false,
      status: "OFFLINE",
      incomingMessagesRate: 0,
      outgoingMessagesRate: 0,
      totalProcessedMessages: 0,
      latencyMs: 0,
      error: "Graylog is not enabled (set GRAYLOG_URL or GRAYLOG_ENABLED=true in .env)"
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${config.url}/api/system`, {
      method: "GET",
      headers: getGraylogHeaders(config),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      return {
        healthy: false,
        status: "DEGRADED",
        incomingMessagesRate: 0,
        outgoingMessagesRate: 0,
        totalProcessedMessages: 0,
        latencyMs,
        error: `Graylog returned HTTP ${res.status}: ${res.statusText}`
      };
    }

    const systemInfo = await res.json();

    let inRate = 0;
    let outRate = 0;
    try {
      const metricsRes = await fetch(`${config.url}/api/system/metrics/multiple`, {
        method: "POST",
        headers: getGraylogHeaders(config),
        body: JSON.stringify({
          metrics: [
            "org.graylog2.throughput.input.1-sec-rate",
            "org.graylog2.throughput.output.1-sec-rate"
          ]
        })
      });
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        inRate = Number(metricsData?.metrics?.[0]?.metric?.value || 0);
        outRate = Number(metricsData?.metrics?.[1]?.metric?.value || 0);
      }
    } catch {
      // Ignore throughput metric fetch failure
    }

    return {
      healthy: true,
      status: "OPERATIONAL",
      version: systemInfo.version || "Graylog v5.x",
      clusterId: systemInfo.cluster_id,
      isProcessing: Boolean(systemInfo.is_processing ?? true),
      incomingMessagesRate: inRate,
      outgoingMessagesRate: outRate,
      totalProcessedMessages: 0,
      latencyMs
    };
  } catch (err: any) {
    return {
      healthy: false,
      status: "OFFLINE",
      incomingMessagesRate: 0,
      outgoingMessagesRate: 0,
      totalProcessedMessages: 0,
      latencyMs: Date.now() - startTime,
      error: err?.message || "Connection refused to Graylog API"
    };
  }
}

/**
 * Searches Graylog audit logs via Graylog REST API (/api/search/universal/relative).
 */
export async function searchGraylogAuditLogs(params: {
  query?: string;
  range?: number;
  limit?: number;
  offset?: number;
  orgId?: string;
}): Promise<GraylogSearchResult> {
  const config = getGraylogConfig();
  if (!config.enabled) {
    return {
      success: false,
      total: 0,
      timeRangeSeconds: params.range || 3600,
      logs: [],
      executionTimeMs: 0,
      error: "Graylog integration is disabled in configuration"
    };
  }

  const startTime = Date.now();
  const range = params.range ?? 3600;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const queryParts: string[] = [];
  if (params.orgId) {
    queryParts.push(`org_id:"${params.orgId}"`);
  }
  if (params.query && params.query.trim() !== "" && params.query !== "*") {
    queryParts.push(`(${params.query})`);
  }
  const fullQuery = queryParts.length > 0 ? queryParts.join(" AND ") : "*";

  try {
    const url = new URL(`${config.url}/api/search/universal/relative`);
    url.searchParams.set("query", fullQuery);
    url.searchParams.set("range", String(range));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("sort", "timestamp:desc");

    if (config.streamId) {
      url.searchParams.set("filter", `streams:${config.streamId}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: getGraylogHeaders(config),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const execMs = Date.now() - startTime;

    if (!res.ok) {
      return {
        success: false,
        total: 0,
        timeRangeSeconds: range,
        logs: [],
        executionTimeMs: execMs,
        error: `Graylog search failed with status ${res.status}: ${res.statusText}`
      };
    }

    const data = await res.json();
    const messages = Array.isArray(data.messages) ? data.messages : [];

    const mappedLogs: GraylogLogMessage[] = messages.map((item: any) => {
      const msg = item.message || {};
      let parsedArgs: Record<string, unknown> = {};
      if (typeof msg.arguments === "string") {
        try {
          parsedArgs = JSON.parse(msg.arguments);
        } catch {
          parsedArgs = { raw: msg.arguments };
        }
      } else if (typeof msg.arguments === "object" && msg.arguments !== null) {
        parsedArgs = msg.arguments;
      }

      return {
        id: item._id || msg._id || String(Math.random()),
        timestamp: msg.timestamp || new Date().toISOString(),
        source: msg.source,
        agentId: msg.agent_id || msg.agentId || "unknown-agent",
        userEmail: msg.user_email || msg.userEmail,
        userName: msg.user_name || msg.userName,
        clientIp: msg.client_ip || msg.clientIp,
        clientHostname: msg.client_hostname || msg.clientHostname,
        sessionId: msg.session_id || msg.sessionId,
        toolName: msg.tool_name || msg.toolName || "llm_generate",
        verdict: (msg.verdict as "PASSED" | "BLOCKED" | "HELD") || "PASSED",
        latencyMs: Number(msg.latency_ms ?? msg.latencyMs ?? 0),
        isStreaming: Boolean(msg.is_streaming ?? msg.isStreaming ?? false),
        timeToFirstTokenMs: msg.ttft_ms ? Number(msg.ttft_ms) : undefined,
        totalTokens: msg.total_tokens ? Number(msg.total_tokens) : undefined,
        arguments: parsedArgs,
        policyName: msg.policy_name || msg.policyName || null,
        rawMessage: msg
      };
    });

    return {
      success: true,
      total: data.total_results ?? mappedLogs.length,
      timeRangeSeconds: range,
      logs: mappedLogs,
      executionTimeMs: execMs
    };
  } catch (err: any) {
    return {
      success: false,
      total: 0,
      timeRangeSeconds: range,
      logs: [],
      executionTimeMs: Date.now() - startTime,
      error: err?.message || "Failed to connect to Graylog search endpoint"
    };
  }
}

