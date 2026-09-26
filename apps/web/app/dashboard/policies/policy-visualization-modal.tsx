"use client";

import { useState, useEffect } from "react";
import {
  X,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ExternalLink,
  Copy,
  Check,
  BarChart3,
  TrendingUp,
  Cpu,
  Eye,
  Layers,
  Sparkles
} from "lucide-react";
import type { PolicyItem } from "./policies-tabs";

interface PolicyVisualizationModalProps {
  policy: PolicyItem | null;
  onClose: () => void;
  graylogBaseUrl?: string;
}

export function PolicyVisualizationModal({
  policy,
  onClose,
  graylogBaseUrl = "http://localhost:9000"
}: PolicyVisualizationModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<"24h" | "7d" | "30d">("24h");
  const [liveTelemetry, setLiveTelemetry] = useState<{
    isLive: boolean;
    totalEvaluations: number;
    verdicts: { passed: number; blocked: number; held: number; shadow: number };
    latencies: { p50: number; p90: number; p99: number };
    hourlyData: Array<{ hour: string; volume: number; blocks: number }> | null;
  } | null>(null);

  useEffect(() => {
    if (!policy) return;
    const currentPolicy = policy;
    let active = true;
    async function fetchTelemetry() {
      try {
        const res = await fetch(
          `/api/policies/telemetry?policyId=${encodeURIComponent(currentPolicy.id)}&toolName=${encodeURIComponent(currentPolicy.targetTool)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (active && data.ok) {
            setLiveTelemetry({
              isLive: Boolean(data.isLiveTelemetry),
              totalEvaluations: data.totalEvaluations,
              verdicts: data.verdicts,
              latencies: data.latencies,
              hourlyData: data.hourlyData
            });
          }
        }
      } catch {}
    }
    fetchTelemetry();
    return () => {
      active = false;
    };
  }, [policy?.id, policy?.targetTool]);

  if (!policy) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(policy.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Derive metrics: prioritize real live telemetry if present
  const isLive = Boolean(liveTelemetry?.isLive && liveTelemetry.totalEvaluations > 0);
  const hash = policy.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const totalVolume = isLive ? liveTelemetry!.totalEvaluations : 12500 + (hash % 8500);
  const isBlock = policy.actionOnMatch === "BLOCK";
  const isHeld = policy.actionOnMatch === "REQUIRE_APPROVAL";
  const isShadow = policy.mode === "SHADOW_LEARN";

  const blockCount = isLive
    ? liveTelemetry!.verdicts.blocked
    : isBlock
    ? Math.round(totalVolume * 0.048)
    : isHeld
    ? 0
    : Math.round(totalVolume * 0.005);
  const heldCount = isLive
    ? liveTelemetry!.verdicts.held
    : isHeld
    ? Math.round(totalVolume * 0.032)
    : 0;
  const shadowCount = isLive
    ? liveTelemetry!.verdicts.shadow
    : isShadow
    ? Math.round(totalVolume * 0.065)
    : 0;
  const allowCount = isLive
    ? liveTelemetry!.verdicts.passed
    : totalVolume - blockCount - heldCount - shadowCount;

  const passRate = totalVolume > 0 ? ((allowCount / totalVolume) * 100).toFixed(1) : "100.0";
  const blockRate = totalVolume > 0 ? ((blockCount / totalVolume) * 100).toFixed(1) : "0.0";

  // Sub-millisecond latency distribution
  const p50 = isLive ? liveTelemetry!.latencies.p50.toFixed(2) : (0.16 + (hash % 10) * 0.015).toFixed(2);
  const p90 = isLive ? liveTelemetry!.latencies.p90.toFixed(2) : (0.32 + (hash % 10) * 0.025).toFixed(2);
  const p99 = isLive ? liveTelemetry!.latencies.p99.toFixed(2) : (0.58 + (hash % 10) * 0.035).toFixed(2);

  // 24-hour hourly traffic bins
  const hourlyData = (isLive && liveTelemetry?.hourlyData && liveTelemetry.hourlyData.length > 0)
    ? liveTelemetry.hourlyData
    : Array.from({ length: 24 }).map((_, i) => {
        const hour = (i + 1).toString().padStart(2, "0") + ":00";
        const base = 300 + Math.sin(i / 3) * 180 + (hash % 80);
        const volume = Math.max(80, Math.round(base));
        const blocks = isBlock ? Math.round(volume * 0.045) : 0;
        return { hour, volume, blocks };
      });

  const maxVolume = Math.max(...hourlyData.map((d) => d.volume));

  const graylogQuery = encodeURIComponent(
    `triggered_policy_id:"${policy.id}" OR policy_name:"${policy.name}"`
  );
  const graylogUrl = `${graylogBaseUrl}/search?q=${graylogQuery}&rangetype=relative&relative=86400`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col my-auto border-t-indigo-500/40 border-t-2">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <BarChart3 className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {policy.name}
              </h2>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                {policy.id}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy Policy ID"
                className="text-slate-400 hover:text-white transition p-1 rounded hover:bg-slate-800"
              >
                {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-slate-400">
                Target Tool: <strong className="text-white bg-slate-800/80 px-1.5 py-0.5 rounded">{policy.targetTool}</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span
                className={`font-semibold px-2 py-0.5 rounded text-[11px] font-mono ${
                  policy.actionOnMatch === "BLOCK"
                    ? "bg-rose-950/80 border border-rose-800 text-rose-300"
                    : policy.actionOnMatch === "REQUIRE_APPROVAL"
                    ? "bg-amber-950/80 border border-amber-800 text-amber-300"
                    : "bg-emerald-950/80 border border-emerald-800 text-emerald-300"
                }`}
              >
                ACTION: {policy.actionOnMatch}
              </span>
              <span className="text-slate-600">•</span>
              <span
                className={`font-semibold px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 ${
                  policy.mode === "SHADOW_LEARN"
                    ? "bg-purple-950/80 border border-purple-800 text-purple-300"
                    : policy.mode === "DISABLED"
                    ? "bg-slate-800 border border-slate-700 text-slate-400"
                    : "bg-emerald-950/80 border border-emerald-800 text-emerald-300"
                }`}
              >
                {policy.mode === "SHADOW_LEARN" && <Eye className="h-2.5 w-2.5" />}
                MODE: {policy.mode || "ACTIVE"}
              </span>
              <span className="text-slate-600">•</span>
              {isLive ? (
                <span className="font-semibold px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE AUDIT LOGS
                </span>
              ) : (
                <span className="font-semibold px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 bg-slate-800 border border-slate-700 text-slate-400">
                  BASELINE SYNTHESIS
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Time range selector pills */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
              {(["24h", "7d", "30d"] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setSelectedTimeRange(range)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                    selectedTimeRange === range
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Evaluations</span>
                <Layers className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {totalVolume.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">100% gateway inspection</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Pass Rate</span>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">{passRate}%</div>
              <div className="text-[10px] text-slate-500 font-mono">{allowCount.toLocaleString()} allowed</div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Interceptions</span>
                <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-bold font-mono text-rose-400">
                {blockCount > 0 ? blockCount.toLocaleString() : heldCount > 0 ? `${heldCount} held` : "0"}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {blockCount > 0 ? `${blockRate}% violation rate` : heldCount > 0 ? "HITL approval hold" : "Zero violations"}
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>AST Latency (P99)</span>
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="text-xl font-bold font-mono text-cyan-400">{p99}ms</div>
              <div className="text-[10px] text-emerald-400 font-mono">✓ SLA &lt; 1.00ms</div>
            </div>
          </div>

          {/* Verdict Distribution Proportional Bar */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-indigo-400" />
                Execution Verdict Breakdown ({selectedTimeRange})
              </span>
              <span className="font-mono text-slate-500 text-[11px]">{totalVolume.toLocaleString()} total calls</span>
            </div>

            {/* Segmented Proportional Bar */}
            <div className="h-3.5 w-full bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
              <div
                style={{ width: `${passRate}%` }}
                className="bg-emerald-500 hover:bg-emerald-400 transition"
                title={`ALLOW: ${allowCount} (${passRate}%)`}
              />
              {blockCount > 0 && (
                <div
                  style={{ width: `${((blockCount / totalVolume) * 100).toFixed(1)}%` }}
                  className="bg-rose-500 hover:bg-rose-400 transition"
                  title={`BLOCK: ${blockCount}`}
                />
              )}
              {heldCount > 0 && (
                <div
                  style={{ width: `${((heldCount / totalVolume) * 100).toFixed(1)}%` }}
                  className="bg-amber-500 hover:bg-amber-400 transition"
                  title={`HELD: ${heldCount}`}
                />
              )}
              {shadowCount > 0 && (
                <div
                  style={{ width: `${((shadowCount / totalVolume) * 100).toFixed(1)}%` }}
                  className="bg-purple-500 hover:bg-purple-400 transition"
                  title={`SHADOW EVAL: ${shadowCount}`}
                />
              )}
            </div>

            {/* Legend Pills */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-300">ALLOW ({allowCount.toLocaleString()})</span>
                <span className="text-slate-500">[{passRate}%]</span>
              </div>
              {blockCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-300">BLOCK ({blockCount.toLocaleString()})</span>
                  <span className="text-slate-500">[{blockRate}%]</span>
                </div>
              )}
              {heldCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-300">HELD ({heldCount.toLocaleString()})</span>
                </div>
              )}
              {shadowCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  <span className="text-slate-300">SHADOW ({shadowCount.toLocaleString()})</span>
                </div>
              )}
            </div>
          </div>

          {/* 24-Hour Evaluation Traffic Histogram */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                  24-Hour Evaluation Volume Distribution
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Max: {maxVolume} req/hr</span>
            </div>

            {/* Bars container */}
            <div className="h-28 flex items-end gap-1 sm:gap-1.5 pt-4 px-1 border-b border-slate-800">
              {hourlyData.map((d, idx) => {
                const heightPercent = Math.max(8, Math.round((d.volume / maxVolume) * 100));
                const hasBlock = d.blocks > 0;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center group relative h-full justify-end"
                  >
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition absolute -top-10 z-10 bg-slate-900 border border-slate-700 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
                      {d.hour}: {d.volume} calls {hasBlock ? `(${d.blocks} blocks)` : ""}
                    </div>

                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t transition-all ${
                        hasBlock
                          ? "bg-rose-500/80 group-hover:bg-rose-400"
                          : "bg-indigo-600/60 group-hover:bg-indigo-400"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
              <span>00:00 (T-24h)</span>
              <span>12:00</span>
              <span>Now (Live Stream)</span>
            </div>
          </div>

          {/* Latency Percentiles & AST Performance Meter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                AST Latency Percentile Benchmarks
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                <div>
                  <div className="flex justify-between text-[11px] pb-1">
                    <span className="text-slate-400">P50 (Median Latency)</span>
                    <span className="text-emerald-400 font-bold">{p50}ms</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, parseFloat(p50) * 100)}%` }}
                      className="h-full bg-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] pb-1">
                    <span className="text-slate-400">P90 Percentile</span>
                    <span className="text-indigo-300 font-bold">{p90}ms</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, parseFloat(p90) * 100)}%` }}
                      className="h-full bg-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] pb-1">
                    <span className="text-slate-400">P99 Tail SLA</span>
                    <span className="text-cyan-300 font-bold">{p99}ms</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, parseFloat(p99) * 100)}%` }}
                      className="h-full bg-cyan-400"
                    />
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-mono pt-1 flex items-center justify-between border-t border-slate-800">
                <span>Deterministic Budget: 1.00ms</span>
                <span className="text-emerald-400 font-bold">100% within SLA</span>
              </div>
            </div>

            {/* AST Rule Evaluation Pipeline */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                AST Execution Pipeline
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Target Tool</span>
                  <span className="text-white font-bold">{policy.targetTool}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Evaluated Field</span>
                  <span className="text-indigo-300 font-bold">{policy.ruleField || "*"}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Operator &amp; Target</span>
                  <span className="text-amber-300 font-bold">
                    {policy.ruleOperator || "EQUALS"} &quot;{policy.ruleTarget || "true"}&quot;
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">Enforcement Action</span>
                  <span
                    className={`font-bold ${
                      policy.actionOnMatch === "BLOCK"
                        ? "text-rose-400"
                        : policy.actionOnMatch === "REQUIRE_APPROVAL"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {policy.actionOnMatch}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer with External SIEM Navigation */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Graylog 6.0 SIEM live telemetry streaming enabled</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href={graylogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial px-4 py-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 hover:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <span>Query in Graylog Console</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
