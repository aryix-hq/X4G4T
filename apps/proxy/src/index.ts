import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import { authPlugin } from "./plugins/auth.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { executeRoutes } from "./routes/execute.js";
import { hitlPollRoutes } from "./routes/hitl-poll.js";
import { mcpRoutes } from "./routes/mcp.js";

import { metricsRegistry } from "./services/metrics.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : {
      level: process.env.LOG_LEVEL || "info"
    }
  });

  // Register plugins & routes
  void app.register(authPlugin);
  void app.register(rateLimitPlugin);
  void app.register(executeRoutes);
  void app.register(hitlPollRoutes);
  void app.register(mcpRoutes);

  // Health check endpoint (supports GET and POST for downstream agent forward testing)
  app.get("/healthz", async () => ({ status: "ok" }));
  app.post("/healthz", async (request) => ({ status: "ok", received: request.body }));

  // Prometheus Metrics endpoint
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return reply.send(metricsRegistry.render());
  });

  return app;
}

export const app = buildApp();

import { startAuditWorker } from "./workers/log-consumer.js";

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");

if (isMain && process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT) || 4000;
  const host = "0.0.0.0";

  try {
    await app.listen({ port, host });
    app.log.info(`X4G4T proxy ingestion engine active on http://${host}:${port}`);

    // Start background telemetry and audit log consumer worker
    startAuditWorker();
    app.log.info("X4G4T BullMQ telemetry worker active and processing audit logs");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

