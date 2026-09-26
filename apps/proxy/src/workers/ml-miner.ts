import { getDbClient } from "../services/gateway.js";
import { executionLogs, policyRecommendations } from "@x4g4t/db";
import { eq, and, desc } from "drizzle-orm";

export interface DiscoveredRecommendation {
  id: string;
  orgId: string;
  targetTool: string;
  fieldPath: string;
  suggestedOperator: "LESS_THAN_OR_EQUAL" | "IN";
  suggestedTargetValue: string;
  confidenceScore: number;
  reasoning: string;
  sampleSize: number;
  status: "PENDING" | "ACCEPTED" | "DISMISSED";
  distribution?: {
    min: number;
    p50: number;
    p90: number;
    p99: number;
    max: number;
    histogramBuckets: Array<{ bucket: string; count: number }>;
  };
  createdAt: string;
}

// In-memory recommendations store (for local development, fast caching, and offline demo)
const inMemoryRecommendations = new Map<string, DiscoveredRecommendation>();

// In-memory execution log buffer (to support testing and fast aggregation without DB dependency)
interface LogSample {
  orgId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  verdict: "PASSED" | "BLOCKED" | "HELD";
}

const sampleExecutionLogBuffer: LogSample[] = [];

export function feedSampleExecutions(samples: LogSample[]): void {
  sampleExecutionLogBuffer.push(...samples);
}

export function clearSampleExecutionBuffer(): void {
  sampleExecutionLogBuffer.length = 0;
}

export function getInMemoryRecommendations(orgId?: string): DiscoveredRecommendation[] {
  const all = Array.from(inMemoryRecommendations.values());
  if (!orgId) return all;
  return all.filter((r) => r.orgId === orgId);
}

export function updateInMemoryRecommendationStatus(
  id: string,
  status: "ACCEPTED" | "DISMISSED"
): boolean {
  const rec = inMemoryRecommendations.get(id);
  if (!rec) return false;
  rec.status = status;
  return true;
}

/**
 * Calculates quantile / percentile from a sorted array of numbers using linear interpolation.
 */
export function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  const lowerVal = sorted[lower]!;
  const upperVal = sorted[upper]!;

  return lowerVal + weight * (upperVal - lowerVal);
}

export function calculateDistribution(values: number[]): {
  count: number;
  min: number;
  max: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
} {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, median: 0, p90: 0, p95: 0, p99: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    median: calculatePercentile(sorted, 50),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99)
  };
}

/**
 * Calculates mean and standard deviation.
 */
export function calculateStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / Math.max(1, values.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

export interface MinedPolicyRecommendation {
  targetTool: string;
  field: string;
  fieldPath: string;
  suggestedThreshold: number;
  confidenceScore: number;
  sampleSize: number;
  reasoning: string;
}

export function minePolicyRecommendations(
  dataset: Array<{ toolName: string; field: string; value: unknown }>,
  options?: { minSampleSize?: number }
): MinedPolicyRecommendation[] {
  const minSampleSize = options?.minSampleSize ?? 50;
  if (dataset.length < minSampleSize) {
    return [];
  }

  const grouped = new Map<string, number[]>();
  for (const item of dataset) {
    if (typeof item.value === "number" && !isNaN(item.value)) {
      const key = `${item.toolName}::${item.field}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item.value);
    }
  }

  const results: MinedPolicyRecommendation[] = [];
  for (const [key, numbers] of grouped.entries()) {
    if (numbers.length < minSampleSize) continue;
    const [toolName, field] = key.split("::");
    const dist = calculateDistribution(numbers);
    const threshold = Math.round(dist.p99 * 100) / 100;
    results.push({
      targetTool: toolName!,
      field: field!,
      fieldPath: field!,
      suggestedThreshold: threshold,
      confidenceScore: 0.95,
      sampleSize: numbers.length,
      reasoning: `Observed ${numbers.length} calls for tool '${toolName}' with median ${dist.median} and p99 ${dist.p99}. Proposing upper bound threshold ${threshold}.`
    });
  }

  return results;
}

/**
 * Core log-mining and ML anomaly detection algorithm.
 * Scans past execution logs, aggregates distributions, and generates recommendations.

 */
export async function runMlMinerAnalysis(orgId: string = "org_demo_default"): Promise<DiscoveredRecommendation[]> {
  const numericValuesByToolField = new Map<string, number[]>();
  const stringValuesByToolField = new Map<string, string[]>();

  // 1. Ingest from sample memory buffer first (if present)
  for (const sample of sampleExecutionLogBuffer) {
    if (sample.orgId !== orgId || sample.verdict !== "PASSED") continue;
    extractArguments(sample.toolName, sample.arguments, numericValuesByToolField, stringValuesByToolField);
  }

  // 2. Ingest from PostgreSQL if available
  try {
    const db = getDbClient();
    const rows = await db
      .select({
        toolName: executionLogs.toolName,
        arguments: executionLogs.arguments,
        verdict: executionLogs.verdict
      })
      .from(executionLogs)
      .where(and(eq(executionLogs.orgId, orgId), eq(executionLogs.verdict, "PASSED")))
      .orderBy(desc(executionLogs.createdAt))
      .limit(1000);

    for (const row of rows) {
      if (typeof row.arguments === "object" && row.arguments !== null) {
        extractArguments(
          row.toolName,
          row.arguments as Record<string, unknown>,
          numericValuesByToolField,
          stringValuesByToolField
        );
      }
    }
  } catch {
    // If DB is unreachable or during test without DB, fallback gracefully to in-memory buffer
  }

  const recommendations: DiscoveredRecommendation[] = [];

  // 3. Process Numeric Arguments (Upper Bound Ceiling Proposals)
  for (const [key, values] of numericValuesByToolField.entries()) {
    const [toolName, fieldPath] = key.split("::");
    if (!toolName || !fieldPath) continue;

    // Minimum sample size threshold for statistical significance
    if (values.length < 5) continue;

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0]!;
    const max = sorted[sorted.length - 1]!;
    const p50 = calculatePercentile(sorted, 50);
    const p90 = calculatePercentile(sorted, 90);
    const p99 = calculatePercentile(sorted, 99);
    const { mean, stdDev } = calculateStats(sorted);

    // Ceiling target value with 15% safety buffer
    const bufferedP99 = p99 * 1.15;
    const suggestedTargetValue = String(
      Number.isInteger(p99) ? Math.ceil(bufferedP99) : Math.round(bufferedP99 * 100) / 100
    );

    // Confidence score based on sample size and relative variation
    const variationRatio = mean > 0 ? stdDev / mean : 1;
    const sizeWeight = Math.min(1.0, values.length / 50);
    const stabilityWeight = Math.max(0.7, 1 - Math.min(0.3, variationRatio * 0.1));
    const confidenceScore = Math.round(sizeWeight * stabilityWeight * 1000) / 1000;

    // Build histogram distribution preview
    const numBuckets = 5;
    const step = (max - min) / numBuckets || 1;
    const histogramBuckets: Array<{ bucket: string; count: number }> = [];

    for (let b = 0; b < numBuckets; b++) {
      const bMin = Math.round((min + b * step) * 10) / 10;
      const bMax = Math.round((min + (b + 1) * step) * 10) / 10;
      const count = sorted.filter((v) => (b === numBuckets - 1 ? v >= bMin && v <= bMax : v >= bMin && v < bMax)).length;
      histogramBuckets.push({
        bucket: `${bMin}-${bMax}`,
        count
      });
    }

    const recId = `rec_${toolName}_${fieldPath.replace(/\./g, "_")}`;
    const rec: DiscoveredRecommendation = {
      id: recId,
      orgId,
      targetTool: toolName,
      fieldPath,
      suggestedOperator: "LESS_THAN_OR_EQUAL",
      suggestedTargetValue,
      confidenceScore: Math.min(0.99, Math.max(0.85, confidenceScore)),
      reasoning: `99.0% of observed executions for tool '${toolName}' have '${fieldPath}' <= ${Math.round(p99 * 100) / 100}. Proposing ceiling of ${suggestedTargetValue} (15% safety buffer) to halt hallucinated mutations.`,
      sampleSize: values.length,
      status: "PENDING",
      distribution: {
        min: Math.round(min * 10) / 10,
        p50: Math.round(p50 * 10) / 10,
        p90: Math.round(p90 * 10) / 10,
        p99: Math.round(p99 * 10) / 10,
        max: Math.round(max * 10) / 10,
        histogramBuckets
      },
      createdAt: new Date().toISOString()
    };

    recommendations.push(rec);
    inMemoryRecommendations.set(recId, rec);

    // Save/upsert to PostgreSQL if available
    try {
      const db = getDbClient();
      await db
        .insert(policyRecommendations)
        .values({
          id: rec.id,
          orgId: rec.orgId,
          targetTool: rec.targetTool,
          fieldPath: rec.fieldPath,
          suggestedOperator: rec.suggestedOperator,
          suggestedTargetValue: rec.suggestedTargetValue,
          confidenceScore: rec.confidenceScore,
          reasoning: rec.reasoning,
          sampleSize: rec.sampleSize,
          status: rec.status
        })
        .onConflictDoNothing();
    } catch {}
  }

  // 4. Process String / Enum Arguments (Finite Discrete Whitelist Proposals)
  for (const [key, strings] of stringValuesByToolField.entries()) {
    const [toolName, fieldPath] = key.split("::");
    if (!toolName || !fieldPath) continue;

    if (strings.length < 10) continue;

    const uniqueSet = Array.from(new Set(strings));
    // If finite low-cardinality set (e.g. 1 to 8 distinct values like currencies or statuses)
    if (uniqueSet.length >= 1 && uniqueSet.length <= 8) {
      const suggestedTargetValue = JSON.stringify(uniqueSet.sort());
      const recId = `rec_enum_${toolName}_${fieldPath.replace(/\./g, "_")}`;
      const rec: DiscoveredRecommendation = {
        id: recId,
        orgId,
        targetTool: toolName,
        fieldPath,
        suggestedOperator: "IN",
        suggestedTargetValue,
        confidenceScore: 0.96,
        reasoning: `Observed strictly finite categorical values ${suggestedTargetValue} across ${strings.length} executions of tool '${toolName}'. Proposing explicit whitelist constraint.`,
        sampleSize: strings.length,
        status: "PENDING",
        createdAt: new Date().toISOString()
      };

      recommendations.push(rec);
      inMemoryRecommendations.set(recId, rec);
    }
  }

  return recommendations;
}

function extractArguments(
  toolName: string,
  args: Record<string, unknown>,
  numericMap: Map<string, number[]>,
  stringMap: Map<string, string[]>,
  prefix = ""
): void {
  for (const [k, v] of Object.entries(args)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "number" && !isNaN(v)) {
      const key = `${toolName}::${fullPath}`;
      if (!numericMap.has(key)) numericMap.set(key, []);
      numericMap.get(key)!.push(v);
    } else if (typeof v === "string" && v.length <= 32) {
      const key = `${toolName}::${fullPath}`;
      if (!stringMap.has(key)) stringMap.set(key, []);
      stringMap.get(key)!.push(v);
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      extractArguments(toolName, v as Record<string, unknown>, numericMap, stringMap, fullPath);
    }
  }
}
