import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  isGlobalAiLockdownActive,
  getGlobalAiLockdownDetails,
  setGlobalAiLockdown,
  isOrgKillSwitchActive,
  getOrgKillSwitchDetails,
  setOrgKillSwitch,
  exportLogToExternalServices
} from "@x4g4t/policy-engine";
import { getRedisConnection } from "../services/queue.js";
import { metricsRegistry } from "../services/metrics.js";
import { enqueueAuditLog } from "../services/queue.js";
import { getDbClient } from "../services/gateway.js";
import { organizations } from "@x4g4t/db";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyInstance {
    checkKillSwitch: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
  }
}

// In-memory cache for ultra-low latency (<0.05ms) checks per worker
interface CachedKillSwitchState {
  active: boolean;
  reason: string;
  activatedAt: string;
  expiresAt: number;
}

const localKillSwitchCache = new Map<string, CachedKillSwitchState>();
const CACHE_TTL_MS = 500; // 500ms local TTL, refreshed via Pub/Sub or periodic check

export function clearKillSwitchCache(orgId?: string): void {
  if (orgId) {
    localKillSwitchCache.delete(orgId);
  } else {
    localKillSwitchCache.clear();
  }
}
let isSubscriberInitialized = false;

function initRedisSubscriber(): void {
  if (isSubscriberInitialized || process.env.NODE_ENV === "test") return;
  try {
    const redis = getRedisConnection();
    const subscriber = redis.duplicate({ enableOfflineQueue: true, lazyConnect: false });
    subscriber.subscribe("killswitch:invalidation", (err, count) => {
      if (!err) {
        isSubscriberInitialized = true;
        if (process.env.NODE_ENV !== "test") {
          console.log(`[X4G4T Kill Switch] Subscribed to killswitch:invalidation, count=${count}`);
        }
      } else if (process.env.NODE_ENV !== "test") {
        console.warn("[X4G4T Kill Switch] Subscription error:", err.message);
      }
    });

    subscriber.on("message", (_channel, message) => {
      try {
        const payload = JSON.parse(message) as {
          orgId?: string;
          active?: boolean;
          reason?: string;
          lockdownActive?: boolean;
          freezeActive?: boolean;
        };
        if (payload.orgId) {
          if (payload.active !== undefined) {
            localKillSwitchCache.set(payload.orgId, {
              active: payload.active,
              reason: payload.reason || "Emergency kill switch toggled.",
              activatedAt: new Date().toISOString(),
              expiresAt: Date.now() + CACHE_TTL_MS
            });
            setOrgKillSwitch(payload.orgId, payload.active, payload.reason);
            metricsRegistry.killSwitchActiveDropEngaged.set({}, payload.active ? 1 : 0);
          } else {
            localKillSwitchCache.delete(payload.orgId);
          }
        } else {
          // Global lockdown toggle
          const isEngaged = payload.active ?? payload.lockdownActive ?? false;
          setGlobalAiLockdown(isEngaged, payload.reason);
          metricsRegistry.killSwitchActiveDropEngaged.set({}, isEngaged ? 1 : 0);
          metricsRegistry.globalAiLockdownActive.set({}, isEngaged ? 1 : 0);
          localKillSwitchCache.clear();
        }
      } catch {}
    });

    subscriber.on("error", (err: Error) => {
      if (process.env.NODE_ENV !== "test") {
        console.warn("[X4G4T Kill Switch Subscriber Warning]:", err.message);
      }
    });
  } catch (err: any) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[X4G4T Kill Switch Subscriber Error]:", err?.message);
    }
  }
}

export async function isKillSwitchActiveForOrg(orgId?: string): Promise<{
  active: boolean;
  reason: string;
  activatedAt: string;
}> {
  // 1. Global Lockdown check (highest priority in-memory)
  if (isGlobalAiLockdownActive()) {
    const details = getGlobalAiLockdownDetails();
    return {
      active: true,
      reason: details.reason,
      activatedAt: details.updatedAt
    };
  }

  if (!orgId) {
    return { active: false, reason: "", activatedAt: "" };
  }

  // 2. Direct in-process check (<0.001ms) - authoritative for in-process changes
  if (isOrgKillSwitchActive(orgId)) {
    const details = getOrgKillSwitchDetails(orgId);
    return {
      active: true,
      reason: details.reason,
      activatedAt: details.updatedAt
    };
  }

  // 3. Check local in-memory cache (<0.01ms hot-path)
  const cached = localKillSwitchCache.get(orgId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return {
      active: cached.active,
      reason: cached.reason,
      activatedAt: cached.activatedAt
    };
  }

  // In test environment without active Redis, avoid hanging on network sockets
  if (process.env.NODE_ENV === "test") {
    localKillSwitchCache.set(orgId, {
      active: false,
      reason: "",
      activatedAt: "",
      expiresAt: now + CACHE_TTL_MS
    });
    return { active: false, reason: "", activatedAt: "" };
  }

  // 4. Redis lookup (atomic distributed key: killswitch:org:<orgId>)
  try {
    const redis = getRedisConnection();
    if (redis && redis.status === "ready") {
      const globalStatus = await redis.get("killswitch:global");
      if (globalStatus === "ACTIVE") {
        const globalReason = (await redis.get("killswitch:global:reason")) || "Emergency Global AI Lockdown engaged.";
        const activatedAt = (await redis.get("killswitch:global:activated_at")) || new Date().toISOString();
        setGlobalAiLockdown(true, globalReason);
        metricsRegistry.killSwitchActiveDropEngaged.set({}, 1);
        metricsRegistry.globalAiLockdownActive.set({}, 1);
        return { active: true, reason: globalReason, activatedAt };
      }

      const redisStatus = await redis.get(`killswitch:org:${orgId}`);
      if (redisStatus === "ACTIVE") {
        const redisReason = (await redis.get(`killswitch:org:${orgId}:reason`)) || "Emergency kill switch active in Redis.";
        const activatedAt = (await redis.get(`killswitch:org:${orgId}:activated_at`)) || new Date().toISOString();

        localKillSwitchCache.set(orgId, {
          active: true,
          reason: redisReason,
          activatedAt,
          expiresAt: now + CACHE_TTL_MS
        });
        setOrgKillSwitch(orgId, true, redisReason);
        metricsRegistry.killSwitchActiveDropEngaged.set({}, 1);

        return {
          active: true,
          reason: redisReason,
          activatedAt
        };
      } else if (redisStatus === "INACTIVE") {
        localKillSwitchCache.set(orgId, {
          active: false,
          reason: "",
          activatedAt: "",
          expiresAt: now + CACHE_TTL_MS
        });
        setOrgKillSwitch(orgId, false);
        return { active: false, reason: "", activatedAt: "" };
      }
    }
  } catch {}

  // 5. Database lookup (fallback when Redis is not yet populated)
  try {
    const db = getDbClient();
    const [org] = await db
      .select({
        active: organizations.killSwitchActive,
        reason: organizations.killSwitchReason,
        activatedAt: organizations.killSwitchActivatedAt
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (org && org.active) {
      const reason = org.reason || "Emergency bilateral air-gap kill switch active in database.";
      const activatedAt = org.activatedAt ? org.activatedAt.toISOString() : new Date().toISOString();
      localKillSwitchCache.set(orgId, {
        active: true,
        reason,
        activatedAt,
        expiresAt: now + CACHE_TTL_MS
      });
      setOrgKillSwitch(orgId, true, reason);
      metricsRegistry.killSwitchActiveDropEngaged.set({}, 1);

      // Backfill Redis cache
      try {
        const redis = getRedisConnection();
        if (redis && redis.status === "ready") {
          await redis.set(`killswitch:org:${orgId}`, "ACTIVE");
          await redis.set(`killswitch:org:${orgId}:reason`, reason);
          await redis.set(`killswitch:org:${orgId}:activated_at`, activatedAt);
        }
      } catch {}

      return { active: true, reason, activatedAt };
    }
  } catch {}

  // 6. Check shared file/process state (fallback when database and Redis are unreachable)
  if (isOrgKillSwitchActive(orgId)) {
    const details = getOrgKillSwitchDetails(orgId);
    localKillSwitchCache.set(orgId, {
      active: true,
      reason: details.reason,
      activatedAt: details.updatedAt,
      expiresAt: now + CACHE_TTL_MS
    });
    metricsRegistry.killSwitchActiveDropEngaged.set({}, 1);
    return {
      active: true,
      reason: details.reason,
      activatedAt: details.updatedAt
    };
  }

  localKillSwitchCache.set(orgId, {
    active: false,
    reason: "",
    activatedAt: "",
    expiresAt: now + CACHE_TTL_MS
  });
  setOrgKillSwitch(orgId, false);

  return { active: false, reason: "", activatedAt: "" };
}

const killSwitchPluginAsync: FastifyPluginAsync = async (fastify) => {
  initRedisSubscriber();

  fastify.decorate(
    "checkKillSwitch",
    async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
      const orgId = request.orgId || (request.headers["x-organization-id"] as string) || (request.headers["x-org-id"] as string);
      const state = await isKillSwitchActiveForOrg(orgId);

      if (state.active) {
        metricsRegistry.httpRequestsTotal.inc({
          method: request.method,
          route: request.url,
          status: 503,
          verdict: "KILL_SWITCH_ACTIVE"
        });

        const agentId = (request.body as { agent_id?: string } | undefined)?.agent_id || "unknown";
        const toolName = (request.body as { tool_name?: string } | undefined)?.tool_name || request.url;

        const clientIp = request.ip || (request.headers["x-forwarded-for"] as string) || "127.0.0.1";
        const userEmail = (request.headers["x-user-email"] as string) || request.userId || "system";

        void enqueueAuditLog({
          orgId: orgId || "global",
          agentId,
          toolName,
          arguments: {},
          verdict: "BLOCKED",
          triggeredPolicyId: "emergency_kill_switch",
          latencyMs: 0,
          createdAt: new Date().toISOString()
        });

        void exportLogToExternalServices({
          orgId: orgId || "global",
          agentId,
          toolName,
          arguments: {},
          verdict: "BLOCKED",
          triggeredPolicyId: "emergency_kill_switch",
          latencyMs: 0,
          statusCode: 503,
          iam: { userId: userEmail },
          network: { sourceIp: clientIp },
          createdAt: new Date().toISOString()
        }).catch(() => {});

        await reply.status(503).send({
          error: {
            code: "KILL_SWITCH_ACTIVE",
            message: "Emergency kill switch is active. All inbound and outbound AI traffic is severed.",
            activated_at: state.activatedAt || new Date().toISOString(),
            reason: state.reason
          }
        });
        return true; // was blocked
      }

      return false; // not blocked
    }
  );
};

export const killSwitchPlugin = fp(killSwitchPluginAsync, {
  name: "killSwitchPlugin"
});


