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
      lazyConnect: true,
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
  toolName: string;
  arguments: Record<string, unknown>;
  verdict: "PASSED" | "BLOCKED" | "HELD";
  triggeredPolicyId?: string;
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

export async function enqueueAuditLog(payload: AuditLogJobPayload): Promise<void> {
  try {
    const queue = getAuditLogQueue();
    await queue.add("write-log", payload, {
      removeOnComplete: true,
      removeOnFail: 1000
    });
  } catch (err) {
    // Zero hot-path interruption: Redis enqueue failures are logged as warnings
    // so downstream tool calls are not blocked by telemetry transient issues.
    if (process.env.NODE_ENV !== "test") {
      console.warn("[X4G4T Telemetry Queue Warning] Failed to enqueue log:", (err as Error).message);
    }
  }
}
