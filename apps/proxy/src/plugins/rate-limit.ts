import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  evaluateInMemoryRateLimit,
  RateLimitCheckResult,
  RateLimitPolicyConfig,
  SLIDING_WINDOW_LUA_SCRIPT
} from "@x4g4t/policy-engine";
import { Redis } from "ioredis";
import { metricsRegistry } from "../services/metrics.js";

declare module "fastify" {
  interface FastifyInstance {
    checkRateLimit: (
      request: FastifyRequest,
      reply: FastifyReply,
      policy?: RateLimitPolicyConfig
    ) => Promise<RateLimitCheckResult>;
  }
}

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisClient && process.env.REDIS_URL) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1
      });
      redisClient.on("error", (err: Error) => {
        if (process.env.NODE_ENV !== "test") {
          console.warn("[X4G4T Rate Limit Redis Error, falling back to memory]:", err.message);
        }
      });
    } catch {
      redisClient = null;
    }
  }
  return redisClient;
}

export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicyConfig = {
  id: "pol_default_rate_limit",
  name: "Enterprise Sliding Window (10,000 req / 1 hour)",
  windowSizeSeconds: 3600,
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "10000", 10),
  scope: "PER_USER"
};

const rateLimitPluginCallback: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    "checkRateLimit",
    async (
      request: FastifyRequest,
      reply: FastifyReply,
      customPolicy?: RateLimitPolicyConfig
    ): Promise<RateLimitCheckResult> => {
      if (process.env.RATE_LIMIT_DISABLED === "true") {
        return {
          allowed: true,
          limit: 1000000,
          remaining: 1000000,
          resetSeconds: 0,
          policyId: "disabled"
        };
      }

      const policy = customPolicy || DEFAULT_RATE_LIMIT_POLICY;
      const orgId = request.orgId || "org_default";
      const userId = request.userId || request.keyId || "anonymous";
      const ip = request.ip || (request.headers["x-forwarded-for"] as string) || "127.0.0.1";

      const redis = getRedisClient();

      if (redis && redis.status === "ready") {
        metricsRegistry.redisConnected.set({}, 1);
        try {
          let subject = orgId;
          if (policy.scope === "PER_USER") subject = userId;
          else if (policy.scope === "PER_IP") subject = ip;

          const key = `x4g4t:ratelimit:${policy.id}:${policy.scope.toLowerCase()}:${subject}`;
          const nowSec = Math.floor(Date.now() / 1000);

          const evalResult = (await redis.eval(
            SLIDING_WINDOW_LUA_SCRIPT,
            1,
            key,
            nowSec,
            policy.windowSizeSeconds,
            policy.maxRequests
          )) as [number, number, number];

          const allowed = evalResult[0] === 1;
          const remaining = Math.max(0, evalResult[1] || 0);
          const resetSeconds = evalResult[2] || policy.windowSizeSeconds;

          // Set standard RateLimit headers
          reply.header("X-RateLimit-Limit", policy.maxRequests);
          reply.header("X-RateLimit-Remaining", remaining);
          reply.header("X-RateLimit-Reset", resetSeconds);

          if (!allowed) {
            metricsRegistry.rateLimitHitsTotal.inc({ scope: policy.scope });
            reply.header("Retry-After", resetSeconds);
          }

          return {
            allowed,
            limit: policy.maxRequests,
            remaining,
            resetSeconds,
            policyId: policy.id,
            reason: allowed ? undefined : `Rate limit exceeded: ${policy.maxRequests} requests per ${policy.windowSizeSeconds}s`
          };
        } catch {
          // Graceful fallback to in-memory evaluation
        }
      } else if (redis && redis.status !== "ready") {
        metricsRegistry.redisConnected.set({}, 0);
      }

      // In-Memory Evaluation fallback
      const result = evaluateInMemoryRateLimit(policy, { orgId, userId, ip });

      reply.header("X-RateLimit-Limit", result.limit);
      reply.header("X-RateLimit-Remaining", result.remaining);
      reply.header("X-RateLimit-Reset", result.resetSeconds);

      if (!result.allowed) {
        metricsRegistry.rateLimitHitsTotal.inc({ scope: policy.scope });
        reply.header("Retry-After", result.resetSeconds);
      }

      return result;
    }
  );
};

export const rateLimitPlugin = fp(rateLimitPluginCallback);
