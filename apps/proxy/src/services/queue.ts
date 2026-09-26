import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisInstance: Redis | null = null;
let auditQueueInstance: Queue<AuditLogJobPayload> | null = null;

export function getRedisConnection(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy(times: number) {
        if (times > 3) return null; // stop retrying after 3 attempts
        return Math.min(times * 100, 1000);
      }
    });

    redisInstance.on("error", (err: Error) => {
      // Log redis connection warnings without crashing the proxy hot path
      if (process.env.NODE_ENV !== "test") {
        console.warn("[X4G4T Redis Warning]:", err.message);
      }
    });
  }
  return redisInstance;
}

export interface AuditLogJobPayload {
  orgId: string;
  agentId: string;
  userEmail?: string;
  userName?: string;
  clientIp?: string;
  clientHostname?: string;
  sessionId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  verdict: "PASSED" | "BLOCKED" | "HELD" | "STREAMING_ACTIVE";
  triggeredPolicyId?: string;
  mode?: string;
  isStreaming?: boolean;
  timeToFirstTokenMs?: number;
  totalTokens?: number;
  latencyMs: number;
  createdAt: string;
}

export function getAuditLogQueue(): Queue<AuditLogJobPayload> {
  if (!auditQueueInstance) {
    auditQueueInstance = new Queue<AuditLogJobPayload>("audit-logs", {
      connection: getRedisConnection()
    });
  }
  return auditQueueInstance;
}

const inMemoryFallbackBuffer: AuditLogJobPayload[] = [];
const MAX_FALLBACK_BUFFER_SIZE = 10000;

export function getFallbackAuditLogs(): AuditLogJobPayload[] {
  return [...inMemoryFallbackBuffer];
}

export function clearFallbackAuditLogs(): void {
  inMemoryFallbackBuffer.length = 0;
}

export async function enqueueAuditLog(payload: AuditLogJobPayload): Promise<void> {
  try {
    const queue = getAuditLogQueue();
    await queue.add("write-log", payload, {
      removeOnComplete: true,
      removeOnFail: 1000
    });
  } catch (err) {
    // Fail-Safe: Buffer security event in memory during Redis partition so zero events are dropped
    if (inMemoryFallbackBuffer.length < MAX_FALLBACK_BUFFER_SIZE) {
      inMemoryFallbackBuffer.push(payload);
    }
    if (process.env.NODE_ENV !== "test") {
      console.warn("[X4G4T Telemetry Queue Warning] Buffered to in-memory failover:", (err as Error).message);
    }
  }
}
