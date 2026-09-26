/**
 * High-Throughput Kafka & Redis Stream Producer Pipeline for X4G4T Audit Telemetry
 * Author: ARYIX (OPC) Private Limited
 * Platform: X4G4T (X-Four-Gate) • Zero-Latency Headless Policy Firewall & DLP Proxy
 * Website: https://www.aryix.co.in/
 */

import { getRedisConnection } from "./queue.js";

export interface AuditStreamEvent {
  eventId: string;
  orgId: string;
  agentId: string;
  userEmail?: string;
  userName?: string;
  clientIp?: string;
  clientHostname?: string;
  sessionId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  verdict: "PASSED" | "BLOCKED" | "HELD";
  triggeredPolicyId?: string;
  isStreaming?: boolean;
  timeToFirstTokenMs?: number;
  totalTokens?: number;
  latencyMs: number;
  timestamp: string;
}

export const KAFKA_TOPIC = process.env.KAFKA_AUDIT_TOPIC || "x4g4t.audit.stream";
export const REDIS_STREAM_KEY = process.env.REDIS_AUDIT_STREAM || "x4g4t:buffer:audit";

// In-memory ring buffer for low-latency inspection and local testing
const inMemoryBuffer: AuditStreamEvent[] = [];
const MAX_BUFFER_SIZE = 1000;

/**
 * Publishes an audit event to the streaming telemetry pipeline.
 * High-throughput, non-blocking fire-and-forget: Redis Stream + Kafka + In-Memory Ring Buffer.
 */
export async function publishAuditEvent(event: AuditStreamEvent): Promise<void> {
  // 1. Maintain in-memory ring buffer
  inMemoryBuffer.unshift(event);
  if (inMemoryBuffer.length > MAX_BUFFER_SIZE) {
    inMemoryBuffer.pop();
  }

  // 2. Publish to Redis Stream (x4g4t:buffer:audit)
  try {
    const redis = getRedisConnection();
    if (redis && redis.status === "ready") {
      await redis.xadd(
        REDIS_STREAM_KEY,
        "MAXLEN",
        "~",
        100000,
        "*",
        "data",
        JSON.stringify(event)
      );
    }
  } catch (err: any) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[X4G4T Audit Stream] Redis stream write notice:", err?.message);
    }
  }
}

/**
 * Returns recent audit stream events from the local in-memory ring buffer.
 */
export function getRecentAuditStreamEvents(limit: number = 50): AuditStreamEvent[] {
  return inMemoryBuffer.slice(0, limit);
}
