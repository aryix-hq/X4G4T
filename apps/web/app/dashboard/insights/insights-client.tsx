"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  ShieldCheck,
  Eye,
  CheckCircle2,
  BarChart3,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Layers,
  Database
} from "lucide-react";
import {
  acceptPolicyRecommendationAction,
  dismissPolicyRecommendationAction
} from "@/app/actions";

export interface RecommendationItem {
  id: string;
  orgId: string;
  targetTool: string;
  fieldPath: string;
  suggestedOperator: string;
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

interface InsightsClientProps {
  initialRecommendations: RecommendationItem[];
  isPolicyFrozen?: boolean;
}

export function InsightsClient({
  initialRecommendations,
  isPolicyFrozen = false
}: InsightsClientProps) {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(initialRecommendations);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const activeRecs = recommendations.filter((r) => r.status === "PENDING");
  const totalSamples = activeRecs.reduce((acc, r) => acc + r.sampleSize, 0);
  const highConfidenceCount = activeRecs.filter((r) => r.confidenceScore >= 0.95).length;

  const handleAccept = (id: string, asMode: "SHADOW_LEARN" | "ACTIVE") => {
    setProcessingId(id);
    setErrorNotice(null);
    setSuccessNotice(null);

    startTransition(async () => {
      try {
        await acceptPolicyRecommendationAction(id, asMode);
        setRecommendations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "ACCEPTED" as const } : r))
        );
        setSuccessNotice(
          asMode === "SHADOW_LEARN"
            ? "Policy deployed in SHADOW LEARN mode! Traffic continues non-blocking while counterfactual evaluations are monitored."
            : "Policy promoted and ENFORCED live! Traffic exceeding this threshold will now be blocked."
        );
      } catch (err: any) {
        setErrorNotice(err?.message || "Failed to accept recommendation.");
      } finally {
        setProcessingId(null);
      }
    });
  };

  const handleDismiss = (id: string) => {
    setProcessingId(id);
    setErrorNotice(null);
    setSuccessNotice(null);

    startTransition(async () => {
      try {
        await dismissPolicyRecommendationAction(id);
        setRecommendations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "DISMISSED" as const } : r))
        );
        setSuccessNotice("Recommendation dismissed.");
      } catch (err: any) {
        setErrorNotice(err?.message || "Failed to dismiss recommendation.");
      } finally {
        setProcessingId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Policy Freeze Banner */}
      {isPolicyFrozen && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/60 flex items-center justify-between text-xs text-amber-200 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-900/60 border border-amber-700 text-amber-300 font-mono font-bold">
              POLICY FREEZE ACTIVE
            </span>
            <span>
              Policy promotions and adoptions are locked by SecOps. Lift policy freeze to apply recommendations.
            </span>
          </div>
        </div>
      )}

      {/* Notifications */}
      {successNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-400 hover:text-white text-xs font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button
            onClick={() => setErrorNotice(null)}
            className="text-rose-400 hover:text-white text-xs font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-purple-600/10 border border-purple-500/30 text-purple-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{activeRecs.length}</div>
            <div className="text-xs text-slate-400">Pending Recommendations</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-600/10 border border-emerald-500/30 text-emerald-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{highConfidenceCount}</div>
            <div className="text-xs text-slate-400">High Confidence (&gt;95%)</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-600/10 border border-indigo-500/30 text-indigo-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{totalSamples}</div>
            <div className="text-xs text-slate-400">Tool Calls Analyzed</div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-cyan-600/10 border border-cyan-500/30 text-cyan-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">99.2%</div>
            <div className="text-xs text-slate-400">Target Blast-Radius Cutoff</div>
          </div>
        </div>
      </div>

      {/* Recommendations Feed */}
      <div className="space-y-5">
        {activeRecs.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-white">All Recommendations Triaged</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              The continuous ML audit log miner is observing ongoing agent executions. High-confidence
              quantile thresholds and enum whitelists will automatically appear here.
            </p>
          </div>
        ) : (
          activeRecs.map((rec) => {
            const isRecPending = isPending && processingId === rec.id;
            const maxBucketCount = rec.distribution?.histogramBuckets?.length
              ? Math.max(...rec.distribution.histogramBuckets.map((b) => b.count))
              : 1;

            return (
              <div
                key={rec.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all shadow-sm space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
                      Tool: {rec.targetTool}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Field: {rec.fieldPath}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800 flex items-center gap-1 font-semibold">
                      <Sparkles className="h-3 w-3" />
                      {(rec.confidenceScore * 100).toFixed(1)}% Confidence
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {rec.sampleSize} samples analyzed
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono">
                    Inferred: {new Date(rec.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {/* Reasoning & Guardrail Formula */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 space-y-2.5">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {rec.reasoning}
                    </p>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs flex items-center gap-2">
                      <span className="text-purple-400 font-bold">SYNTHESIZED RULE:</span>
                      <span className="text-slate-400">IF</span>
                      <span className="text-slate-100 font-semibold">{rec.fieldPath}</span>
                      <span className="text-indigo-400 font-bold">{rec.suggestedOperator}</span>
                      <span className="text-amber-300 font-bold">{rec.suggestedTargetValue}</span>
                      <span className="text-slate-400">THEN</span>
                      <span className="text-emerald-400 font-bold">ALLOW</span>
                      <span className="text-slate-400">ELSE</span>
                      <span className="text-rose-400 font-bold">BLOCK</span>
                    </div>
                  </div>

                  {/* Quantile Baselines Summary */}
                  {rec.distribution && rec.distribution.p99 > 0 && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 font-mono">
                      <div className="text-[11px] text-slate-400 uppercase font-semibold flex items-center gap-1.5">
                        <BarChart3 className="h-3 w-3 text-indigo-400" />
                        Historical Quantiles
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <div className="text-slate-500">Min:</div>
                        <div className="text-slate-300 text-right">{rec.distribution.min}</div>
                        <div className="text-slate-500">P50 (Median):</div>
                        <div className="text-slate-300 text-right">{rec.distribution.p50}</div>
                        <div className="text-slate-500">P90:</div>
                        <div className="text-slate-300 text-right">{rec.distribution.p90}</div>
                        <div className="text-slate-500">P99 Ceiling:</div>
                        <div className="text-amber-400 font-bold text-right">{rec.distribution.p99}</div>
                        <div className="text-purple-400 font-bold">Suggested Limit:</div>
                        <div className="text-emerald-400 font-bold text-right">
                          {rec.suggestedTargetValue}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Histogram Visualizer */}
                {rec.distribution?.histogramBuckets && rec.distribution.histogramBuckets.length > 0 && (
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-semibold uppercase tracking-wider flex items-center gap-1 font-mono">
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                        Distribution Histogram & Frequency Density
                      </span>
                      <span className="font-mono text-slate-500">
                        {rec.sampleSize} Total Executions
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {rec.distribution.histogramBuckets.map((bucket, idx) => {
                        const pct = Math.round((bucket.count / rec.sampleSize) * 100);
                        const barWidth = Math.max(8, Math.round((bucket.count / maxBucketCount) * 100));

                        return (
                          <div key={idx} className="flex items-center gap-2 text-xs font-mono">
                            <span className="w-20 text-slate-400 truncate text-[11px]">
                              {bucket.bucket}
                            </span>
                            <div className="flex-1 bg-slate-900 rounded h-4 overflow-hidden relative">
                              <div
                                className="bg-indigo-600/70 h-full rounded transition-all duration-500 flex items-center justify-end pr-1.5"
                                style={{ width: `${barWidth}%` }}
                              >
                                <span className="text-[9px] text-indigo-100 font-bold">
                                  {bucket.count}
                                </span>
                              </div>
                            </div>
                            <span className="w-10 text-right text-[11px] text-slate-500 font-mono">
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-purple-400" />
                    <span>Shadow mode tests rule against live traffic without blocking requests.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isRecPending || isPolicyFrozen}
                      onClick={() => handleDismiss(rec.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-400 hover:text-white hover:border-slate-600 text-xs font-medium transition cursor-pointer disabled:opacity-40"
                    >
                      Dismiss
                    </button>

                    <button
                      type="button"
                      disabled={isRecPending || isPolicyFrozen}
                      onClick={() => handleAccept(rec.id, "SHADOW_LEARN")}
                      className="px-3.5 py-1.5 rounded-lg border border-purple-600/50 bg-purple-950/40 text-purple-200 hover:bg-purple-900/50 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                    >
                      {isRecPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-purple-400" />
                      )}
                      Test in Shadow Mode
                    </button>

                    <button
                      type="button"
                      disabled={isRecPending || isPolicyFrozen}
                      onClick={() => handleAccept(rec.id, "ACTIVE")}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-40"
                    >
                      {isRecPending ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      Enforce Immediately
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
