export interface ExecutionLogEvent {
  orgId: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  verdict: "PASSED" | "BLOCKED" | "HELD";
  triggeredPolicyId?: string | null;
  latencyMs: number;
  statusCode?: number;
  iam?: {
    userId?: string;
    roles?: string[];
    groups?: string[];
  };
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
 * Dispatches an execution log event to external log providers (Elasticsearch, generic webhooks).
 * Pure fire-and-forget: does not block or add latency to the agent execution loop.
 */
export async function exportLogToExternalServices(event: ExecutionLogEvent): Promise<{
  elasticsearchDispatched: boolean;
  webhookDispatched: boolean;
}> {
  const status = getExternalLogStatus();
  let elasticsearchDispatched = false;
  let webhookDispatched = false;

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

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }

  return { elasticsearchDispatched, webhookDispatched };
}

