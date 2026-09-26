import dgram from "node:dgram";

export interface ExecutionLogEvent {
  orgId: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  verdict: "PASSED" | "BLOCKED" | "HELD" | "STREAMING_ACTIVE";
  triggeredPolicyId?: string | null;
  policyName?: string | null;
  mode?: string;
  latencyMs: number;
  statusCode?: number;
  iam?: {
    userId?: string;
    roles?: string[];
    groups?: string[];
  };
  network?: {
    sourceIp?: string;
    source_ip?: string;
    destinationHost?: string;
    destination_host?: string;
    [key: string]: unknown;
  };
  userEmail?: string;
  userName?: string;
  clientIp?: string;
  clientHostname?: string;
  sessionId?: string;
  recordHash?: string;
  createdAt: string;
}

export type LogRotationSchedule = "daily" | "none";

export interface ExternalLogStatus {
  elasticsearch: {
    configured: boolean;
    url?: string;
    baseIndex: string;
    index: string;
    currentIndex: string;
    rotation: LogRotationSchedule;
  };
  webhook: {
    configured: boolean;
    url?: string;
  };
}

let udpClient: dgram.Socket | null = null;
function getUdpClient(): dgram.Socket {
  if (!udpClient) {
    udpClient = dgram.createSocket("udp4");
    udpClient.unref?.();
  }
  return udpClient;
}

/**
 * Dispatches a GELF 1.1 formatted log message over UDP to Graylog.
 */
export function sendGelfToGraylog(event: ExecutionLogEvent): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const graylogHost =
        process.env.GRAYLOG_HOST ||
        (process.env.NODE_ENV === "production" ? "graylog" : "127.0.0.1");
      const graylogPort = Number(process.env.GRAYLOG_PORT) || 12201;
      const client = getUdpClient();

      const shortMsg = `[${event.agentId || "x4g4t-proxy"}] ${event.toolName} -> ${event.verdict} (${event.triggeredPolicyId || event.mode || "ACTIVE"})`;

      const gelfPayload: Record<string, unknown> = {
        version: "1.1",
        host: process.env.HOSTNAME || "x4g4t-proxy",
        short_message: shortMsg,
        full_message: JSON.stringify(event),
        timestamp: new Date(event.createdAt || Date.now()).getTime() / 1000,
        level: event.verdict === "BLOCKED" ? 4 : 6,
        _org_id: event.orgId,
        _agent_id: event.agentId,
        _tool_name: event.toolName,
        _verdict: event.verdict,
        _mode: event.mode || "ACTIVE",
        _triggered_policy_id: event.triggeredPolicyId || undefined,
        _policy_id: event.triggeredPolicyId || undefined,
        _policy_name: event.policyName || undefined,
        _client_ip:
          event.clientIp ||
          (event.network as any)?.source_ip ||
          (event.network as any)?.sourceIp,
        _user_email: event.userEmail,
        _user_name: event.userName,
        _latency_ms: event.latencyMs,
        _status_code: event.statusCode,
        _arguments: JSON.stringify(event.arguments || {})
      };

      const buf = Buffer.from(JSON.stringify(gelfPayload));
      client.send(buf, graylogPort, graylogHost, (err) => {
        if (err) resolve(false);
        else resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Computes the time-rotated index name for Elasticsearch.
 * By default, formats daily rotation as: `<baseIndex>-YYYY.MM.DD`
 * E.g., `x4g4t-logs-2026.09.19`
 */
export function getRotatedElasticsearchIndex(
  baseIndex: string = process.env.ELASTICSEARCH_INDEX || "x4g4t-logs",
  rotation: LogRotationSchedule = (process.env.ELASTICSEARCH_INDEX_ROTATION as LogRotationSchedule) || "daily",
  date: Date = new Date()
): string {
  if (rotation === "none") {
    return baseIndex;
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${baseIndex}-${yyyy}.${mm}.${dd}`;
}

export function getExternalLogStatus(): ExternalLogStatus {
  const esUrl = process.env.ELASTICSEARCH_URL;
  const esBaseIndex = process.env.ELASTICSEARCH_INDEX || "x4g4t-logs";
  const rotation = ((process.env.ELASTICSEARCH_INDEX_ROTATION as LogRotationSchedule) || "daily");
  const currentIndex = getRotatedElasticsearchIndex(esBaseIndex, rotation);
  const webhookUrl = process.env.EXTERNAL_LOG_WEBHOOK_URL;

  return {
    elasticsearch: {
      configured: Boolean(esUrl),
      url: esUrl,
      baseIndex: esBaseIndex,
      index: esBaseIndex,
      currentIndex,
      rotation
    },
    webhook: {
      configured: Boolean(webhookUrl),
      url: webhookUrl
    }
  };
}

/**
 * Dispatches an execution log event to external log providers (Elasticsearch, generic webhooks, Graylog GELF UDP).
 * Pure fire-and-forget: does not block or add latency to the agent execution loop.
 */
export async function exportLogToExternalServices(event: ExecutionLogEvent): Promise<{
  elasticsearchDispatched: boolean;
  webhookDispatched: boolean;
  graylogDispatched: boolean;
}> {
  const status = getExternalLogStatus();
  let elasticsearchDispatched = false;
  let webhookDispatched = false;
  let graylogDispatched = false;

  const promises: Promise<unknown>[] = [];

  // 1. Elasticsearch Dispatch with Daily Index Rotation
  if (status.elasticsearch.configured && status.elasticsearch.url) {
    const targetIndex = status.elasticsearch.currentIndex;
    const esUrl = `${status.elasticsearch.url.replace(/\/$/, "")}/${targetIndex}/_doc`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (process.env.ELASTICSEARCH_API_KEY) {
      headers["Authorization"] = `ApiKey ${process.env.ELASTICSEARCH_API_KEY}`;
    } else if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
      const auth = Buffer.from(
        `${process.env.ELASTICSEARCH_USERNAME}:${process.env.ELASTICSEARCH_PASSWORD}`
      ).toString("base64");
      headers["Authorization"] = `Basic ${auth}`;
    }

    promises.push(
      fetch(esUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          "@timestamp": event.createdAt,
          ...event
        }),
        signal: AbortSignal.timeout(3000)
      })
        .then((res) => {
          if (res.ok) {
            elasticsearchDispatched = true;
          } else {
            console.warn(`[X4G4T Elasticsearch Warning]: Returned HTTP ${res.status}`);
          }
        })
        .catch((err) => {
          console.warn("[X4G4T Elasticsearch Error]:", err.message);
        })
    );
  }

  // 2. Generic External Log Webhook / Provider Dispatch (Datadog, Splunk, Logstash, Loki)
  if (status.webhook.configured && status.webhook.url) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-X4G4T-Source": "gateway-telemetry"
    };

    if (process.env.EXTERNAL_LOG_AUTH_HEADER) {
      headers["Authorization"] = process.env.EXTERNAL_LOG_AUTH_HEADER;
    }

    promises.push(
      fetch(status.webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(3000)
      })
        .then((res) => {
          if (res.ok) {
            webhookDispatched = true;
          } else {
            console.warn(`[X4G4T Log Webhook Warning]: Returned HTTP ${res.status}`);
          }
        })
        .catch((err) => {
          console.warn("[X4G4T Log Webhook Error]:", err.message);
        })
    );
  }

  // 3. Graylog GELF UDP Real-Time Dispatch
  promises.push(
    sendGelfToGraylog(event).then((ok) => {
      graylogDispatched = ok;
    })
  );

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }

  return { elasticsearchDispatched, webhookDispatched, graylogDispatched };
}

