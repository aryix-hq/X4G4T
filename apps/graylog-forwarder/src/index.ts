/**
 * Graylog Audit & Telemetry Forwarder
 * Streams real-time audit logs and security telemetry events to Graylog GELF endpoints.
 */

export interface GraylogMessage {
  version: string;
  host: string;
  short_message: string;
  full_message?: string;
  timestamp: number;
  level: number;
  _org_id?: string;
  _agent_id?: string;
  _tool_name?: string;
  _verdict?: string;
}

export async function forwardToGraylog(message: GraylogMessage): Promise<boolean> {
  const gelfUrl = process.env.GRAYLOG_GELF_URL || "http://localhost:12201/gelf";
  try {
    const res = await fetch(gelfUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    return res.ok;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[Graylog Forwarder] Failed to deliver GELF payload:", err);
    }
    return false;
  }
}

export async function startForwarderDaemon(): Promise<void> {
  console.log("[Graylog Forwarder] Daemon initialized and listening for log batches.");
}

if (process.env.NODE_ENV !== "test") {
  startForwarderDaemon().catch((err) => {
    console.error("[Graylog Forwarder Fatal]:", err);
  });
}
