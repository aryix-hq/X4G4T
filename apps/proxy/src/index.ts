import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import { authPlugin } from "./plugins/auth.js";
import { telemetryPlugin } from "./plugins/telemetry.js";
import { killSwitchPlugin } from "./plugins/kill-switch.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { executeRoutes } from "./routes/execute.js";
import { hitlPollRoutes } from "./routes/hitl-poll.js";
import { mcpRoutes } from "./routes/mcp.js";
import { llmAdapterRoutes } from "./routes/llm-adapter.js";

import { setGlobalAiLockdown, setOrgKillSwitch, setPolicyFreeze } from "@x4g4t/policy-engine";
import { getRedisConnection } from "./services/queue.js";
import { metricsRegistry } from "./services/metrics.js";
import { getDbClient } from "./services/gateway.js";
import { organizations } from "@x4g4t/db";
import { eq } from "drizzle-orm";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : {
      level: process.env.LOG_LEVEL || "info"
    }
  });

  // Register plugins & routes
  void app.register(telemetryPlugin);
  void app.register(authPlugin);
  void app.register(killSwitchPlugin);
  void app.register(rateLimitPlugin);
  void app.register(executeRoutes);
  void app.register(hitlPollRoutes);
  void app.register(mcpRoutes);
  void app.register(llmAdapterRoutes);

  // Health check endpoint (supports GET and POST for downstream agent forward testing)
  app.get("/healthz", async () => ({ status: "ok" }));
  app.post("/healthz", async (request) => ({ status: "ok", received: request.body }));

  // Synchronize Kill-Switch & Policy Freeze state across microservices
  app.post("/v1/system/sync-lockdown", async (request) => {
    const body = (request.body || {}) as {
      lockdownActive?: boolean;
      orgId?: string;
      orgKillSwitchActive?: boolean;
      freezeActive?: boolean;
      reason?: string;
      updatedBy?: string;
    };

    if (body.lockdownActive !== undefined) {
      setGlobalAiLockdown(body.lockdownActive, body.reason, body.updatedBy);
      metricsRegistry.killSwitchActiveDropEngaged.set({}, body.lockdownActive ? 1 : 0);
      metricsRegistry.globalAiLockdownActive.set({}, body.lockdownActive ? 1 : 0);
      try {
        const redis = getRedisConnection();
        if (body.lockdownActive) {
          await redis.set("killswitch:global", "ACTIVE");
          if (body.reason) await redis.set("killswitch:global:reason", body.reason);
          await redis.set("killswitch:global:activated_at", new Date().toISOString());
          await redis.publish("killswitch:invalidation", JSON.stringify({ active: true, reason: body.reason, lockdownActive: true }));
        } else {
          await redis.del("killswitch:global");
          await redis.del("killswitch:global:reason");
          await redis.del("killswitch:global:activated_at");
          await redis.publish("killswitch:invalidation", JSON.stringify({ active: false, reason: body.reason, lockdownActive: false }));
        }
      } catch {}
    }

    if (body.orgId && body.orgKillSwitchActive !== undefined) {
      setOrgKillSwitch(body.orgId, body.orgKillSwitchActive, body.reason, body.updatedBy);
      metricsRegistry.killSwitchActiveDropEngaged.set({}, body.orgKillSwitchActive ? 1 : 0);
      try {
        const redis = getRedisConnection();
        if (body.orgKillSwitchActive) {
          await redis.set(`killswitch:org:${body.orgId}`, "ACTIVE");
          if (body.reason) await redis.set(`killswitch:org:${body.orgId}:reason`, body.reason);
          await redis.set(`killswitch:org:${body.orgId}:activated_at`, new Date().toISOString());
          await redis.publish("killswitch:invalidation", JSON.stringify({ orgId: body.orgId, active: true, reason: body.reason }));
        } else {
          await redis.del(`killswitch:org:${body.orgId}`);
          await redis.del(`killswitch:org:${body.orgId}:reason`);
          await redis.del(`killswitch:org:${body.orgId}:activated_at`);
          await redis.publish("killswitch:invalidation", JSON.stringify({ orgId: body.orgId, active: false, reason: body.reason }));
        }
      } catch {}
    }

    if (body.freezeActive !== undefined) {
      setPolicyFreeze(body.freezeActive, body.reason, body.updatedBy);
      metricsRegistry.policyFreezeActive.set({}, body.freezeActive ? 1 : 0);
      try {
        const redis = getRedisConnection();
        if (body.freezeActive) {
          await redis.set("policy:freeze:active", "1");
        } else {
          await redis.del("policy:freeze:active");
        }
      } catch {}
    }

    return { ok: true, status: "synchronized" };
  });

  // Prometheus Metrics endpoint
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return reply.send(metricsRegistry.render());
  });

  return app;
}

export const app = buildApp();

import { startAuditWorker } from "./workers/log-consumer.js";
import { initPolicyInvalidationSubscriber } from "./services/gateway.js";

async function initStartupLockdownSync() {
  try {
    const redis = getRedisConnection();
    const globalStatus = await redis.get("killswitch:global");
    if (globalStatus === "ACTIVE") {
      const reason = (await redis.get("killswitch:global:reason")) || "Emergency Global AI Lockdown engaged.";
      setGlobalAiLockdown(true, reason);
      metricsRegistry.killSwitchActiveDropEngaged.set({}, 1);
      metricsRegistry.globalAiLockdownActive.set({}, 1);
    }

    const freezeStatus = await redis.get("policy:freeze:active");
    if (freezeStatus === "1") {
      setPolicyFreeze(true, "Policy editing frozen.");
      metricsRegistry.policyFreezeActive.set({}, 1);
    }

    const db = getDbClient();
    const activeOrgs = await db
      .select({
        id: organizations.id,
        reason: organizations.killSwitchReason,
        activatedAt: organizations.killSwitchActivatedAt
      })
      .from(organizations)
      .where(eq(organizations.killSwitchActive, true));

    for (const org of activeOrgs) {
      setOrgKillSwitch(org.id, true, org.reason || undefined);
      await redis.set(`killswitch:org:${org.id}`, "ACTIVE");
      if (org.reason) await redis.set(`killswitch:org:${org.id}:reason`, org.reason);
      metricsRegistry.killSwitchActiveDropEngaged.set({}, 1);
    }
  } catch (err: any) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[X4G4T Startup Sync Warning]:", err?.message);
    }
  }
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");

async function start() {
  const port = Number(process.env.PORT) || 4000;
  const host = "0.0.0.0";

  try {
    await app.listen({ port, host });
    app.log.info(`X4G4T proxy ingestion engine active on http://${host}:${port}`);

    // Synchronize initial kill switch & lockdown state from Redis & Postgres
    await initStartupLockdownSync();

    // Start background telemetry and audit log consumer worker
    startAuditWorker();
    app.log.info("X4G4T BullMQ telemetry worker active and processing audit logs");

    // Initialize real-time policy cache invalidation subscriber
    initPolicyInvalidationSubscriber();
    app.log.info("X4G4T Redis Pub/Sub policy cache invalidation subscriber initialized");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (isMain && process.env.NODE_ENV !== "test") {
  start();
}

