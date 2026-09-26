import { ShadowEvaluation } from "@x4g4t/policy-engine";
import { getRedisConnection } from "./queue.js";

export interface ShadowMetricHourly {
  policyId: string;
  orgId: string;
  bucketHour: string; // ISO string rounded to hour
  totalEvaluated: number;
  wouldHaveBlocked: number;
  wouldHavePassed: number;
}

// In-memory shadow aggregations for zero-latency recording
const inMemoryShadowBuckets = new Map<string, {
  policyId: string;
  orgId: string;
  bucketHour: Date;
  totalEvaluated: number;
  wouldHaveBlocked: number;
  wouldHavePassed: number;
}>();

export function getRoundedHour(d: Date = new Date()): Date {
  const rounded = new Date(d);
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

export async function recordShadowEvaluation(
  orgId: string,
  shadowResults: ShadowEvaluation[]
): Promise<void> {
  if (!shadowResults || shadowResults.length === 0) return;

  const bucketHour = getRoundedHour();
  const bucketHourIso = bucketHour.toISOString();

  for (const s of shadowResults) {
    const key = `${orgId}:${s.policyId}:${bucketHourIso}`;
    const existing = inMemoryShadowBuckets.get(key) || {
      policyId: s.policyId,
      orgId,
      bucketHour,
      totalEvaluated: 0,
      wouldHaveBlocked: 0,
      wouldHavePassed: 0
    };

    existing.totalEvaluated += 1;
    const isBlocked =
      s.wouldVerdict === "BLOCK" ||
      s.wouldVerdict === "REQUIRE_APPROVAL" ||
      (s as any).projectedVerdict === "SHADOW_BLOCKED" ||
      (s as any).projectedVerdict === "BLOCK";

    if (isBlocked) {
      existing.wouldHaveBlocked += 1;
    } else {
      existing.wouldHavePassed += 1;
    }

    inMemoryShadowBuckets.set(key, existing);

    // Also update Redis async if available
    try {
      const redis = getRedisConnection();
      const redisKey = `shadow:metric:${orgId}:${s.policyId}:${bucketHourIso}`;
      await redis.hincrby(redisKey, "totalEvaluated", 1);
      if (isBlocked) {
        await redis.hincrby(redisKey, "wouldHaveBlocked", 1);
      } else {
        await redis.hincrby(redisKey, "wouldHavePassed", 1);
      }
      await redis.expire(redisKey, 86400 * 30); // 30-day retention
    } catch {}
  }
}

export function getInMemoryShadowStats(policyId: string): {
  totalEvaluated: number;
  wouldHaveBlocked: number;
  wouldHavePassed: number;
  blockRatePercent: number;
} {
  let totalEvaluated = 0;
  let wouldHaveBlocked = 0;
  let wouldHavePassed = 0;

  for (const entry of inMemoryShadowBuckets.values()) {
    if (entry.policyId === policyId) {
      totalEvaluated += entry.totalEvaluated;
      wouldHaveBlocked += entry.wouldHaveBlocked;
      wouldHavePassed += entry.wouldHavePassed;
    }
  }

  const blockRatePercent = totalEvaluated > 0 ? (wouldHaveBlocked / totalEvaluated) * 100 : 0;
  return {
    totalEvaluated,
    wouldHaveBlocked,
    wouldHavePassed,
    blockRatePercent: Math.round(blockRatePercent * 10) / 10
  };
}

export function clearInMemoryShadowStats(): void {
  inMemoryShadowBuckets.clear();
}

export const clearShadowStore = clearInMemoryShadowStats;

export function getShadowViolations(orgId: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of inMemoryShadowBuckets.values()) {
    if (entry.orgId === orgId) {
      result[entry.policyId] = (result[entry.policyId] || 0) + entry.wouldHaveBlocked;
    }
  }
  return result;
}
