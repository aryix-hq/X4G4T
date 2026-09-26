import Fastify from "fastify";
import {
  runMlMinerAnalysis,
  getInMemoryRecommendations,
  feedSampleExecutions,
  clearSampleExecutionBuffer
} from "./workers/ml-miner.js";

const PORT = parseInt(process.env.ML_SERVICE_PORT || process.env.PORT || "5001", 10);
const HOST = process.env.HOST || "0.0.0.0";

export async function buildMlService() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info"
    }
  });

  let lastAnalysisTimestamp: string | null = null;
  let totalAnalysesRun = 0;

  // 1. Component Health Check Endpoints
  const healthHandler = async (_request: any, reply: any) => {
    const memory = process.memoryUsage();
    return reply.status(200).send({
      status: "healthy",
      service: "x4g4t-ml-service",
      version: "0.1.0",
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
      totalAnalysesRun,
      lastAnalysisTimestamp,
      activeRecommendationsCount: getInMemoryRecommendations().length
    });
  };

  app.get("/health", healthHandler);
  app.get("/healthz", healthHandler);

  // 1b. Prometheus Metrics Scrape Endpoint
  app.get("/metrics", async (_request, reply) => {
    const memory = process.memoryUsage();
    const metrics = [
      `# HELP ml_service_uptime_seconds Total runtime of ML service in seconds`,
      `# TYPE ml_service_uptime_seconds gauge`,
      `ml_service_uptime_seconds ${Math.floor(process.uptime())}`,
      `# HELP ml_service_analyses_total Total outlier mining analyses run`,
      `# TYPE ml_service_analyses_total counter`,
      `ml_service_analyses_total ${totalAnalysesRun}`,
      `# HELP ml_service_recommendations_count Current count of active policy recommendations`,
      `# TYPE ml_service_recommendations_count gauge`,
      `ml_service_recommendations_count ${getInMemoryRecommendations().length}`,
      `# HELP ml_service_memory_rss_bytes Memory RSS in bytes`,
      `# TYPE ml_service_memory_rss_bytes gauge`,
      `ml_service_memory_rss_bytes ${memory.rss}`
    ].join("\n") + "\n";

    return reply.type("text/plain").send(metrics);
  });

  // 2. Trigger Outlier Mining Run
  app.post<{ Body: { orgId?: string } }>("/mine", async (request, reply) => {
    const orgId = request.body?.orgId || "org_demo_default";
    try {
      const recommendations = await runMlMinerAnalysis(orgId);
      lastAnalysisTimestamp = new Date().toISOString();
      totalAnalysesRun += 1;

      return reply.status(200).send({
        success: true,
        orgId,
        count: recommendations.length,
        recommendations,
        analyzedAt: lastAnalysisTimestamp
      });
    } catch (err: any) {
      app.log.error(err, "ML mining analysis failed");
      return reply.status(500).send({
        success: false,
        error: err?.message || "Internal ML service mining error"
      });
    }
  });

  // 3. Query Discovered Recommendations for an Organization
  app.get<{ Params: { orgId: string } }>("/recommendations/:orgId", async (request, reply) => {
    const { orgId } = request.params;
    const list = getInMemoryRecommendations(orgId);
    return reply.status(200).send({
      orgId,
      count: list.length,
      recommendations: list
    });
  });

  // 4. Test Helper Endpoint: Feed In-Memory Execution Samples
  app.post<{ Body: { samples: any[] } }>("/samples", async (request, reply) => {
    if (Array.isArray(request.body?.samples)) {
      feedSampleExecutions(request.body.samples);
      return reply.status(200).send({ success: true, count: request.body.samples.length });
    }
    return reply.status(400).send({ error: "Expected 'samples' array" });
  });

  // 5. Test Helper Endpoint: Clear In-Memory Buffer
  app.delete("/samples", async (_request, reply) => {
    clearSampleExecutionBuffer();
    return reply.status(200).send({ success: true, cleared: true });
  });

  return app;
}

async function start() {
  const app = await buildMlService();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[X4G4T ML Service] Independent ML Microservice listening at http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start();
}

