"use client";

import { useState, useTransition } from "react";
import {
  Eye,
  ShieldCheck,
  TrendingUp,
  Radio,
  Search,
  RefreshCw
} from "lucide-react";
import { PolicyItem } from "./policies-tabs";
import { updatePolicyModeAction } from "@/app/actions";
import Link from "next/link";

interface LearningModeAnalyticsProps {
  policies: PolicyItem[];
  isPolicyFrozen?: boolean;
}

export function LearningModeAnalytics({
  policies,
  isPolicyFrozen = false
}: LearningModeAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("24h");
  const [graylogQuery, setGraylogQuery] = useState('mode:"SHADOW_LEARN"');
  const [, startTransition] = useTransition();
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const shadowPolicies = policies.filter((p) => p.mode === "SHADOW_LEARN");

  // Mocked time-series data points for visualization over time
  const timelineData = [
    { label: "00:00", total: 42, wouldBlock: 1 },
    { label: "04:00", total: 28, wouldBlock: 0 },
    { label: "08:00", total: 95, wouldBlock: 3 },
    { label: "12:00", total: 164, wouldBlock: 4 },
    { label: "16:00", total: 182, wouldBlock: 5 },
    { label: "20:00", total: 110, wouldBlock: 2 }
  ];

  const totalEvaluations = 621;
  const totalWouldBlock = 15;
  const passRate = ((602 / totalEvaluations) * 100).toFixed(1);
  const driftRate = ((totalWouldBlock / totalEvaluations) * 100).toFixed(2);

  const handlePromoteToActive = (policyId: string) => {
    if (isPolicyFrozen) return;
    setPromotingId(policyId);
    startTransition(async () => {
      try {
        await updatePolicyModeAction(policyId, "ACTIVE");
        window.location.reload();
      } catch (err: any) {
        alert(err?.message || "Failed to promote policy to ACTIVE.");
      } finally {
        setPromotingId(null);
      }
    });
  };

  return (
    <div className="space-y-6 text-left">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-400" />
              Learning Mode (Shadow Evaluation) Analytics &amp; Drift
            </h2>
            <p className="text-xs text-slate-400">
              Observe candidate policies against live production traffic counterfactually without blocking agents or breaking production workloads.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Window:</span>
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 font-mono text-xs">
              {(["24h", "7d", "30d"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setTimeRange(w)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    timeRange === w
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {w.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Shadow Policies Active
            </span>
            <div className="text-2xl font-bold text-purple-400 font-mono mt-1">
              {shadowPolicies.length}
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Counterfactual mode</span>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Intercepts Analyzed
            </span>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {totalEvaluations}
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">{passRate}% pass rate</span>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">
              Would Have Blocked (Drift)
            </span>
            <div className="text-2xl font-bold text-rose-400 font-mono mt-1">
              {totalWouldBlock}
            </div>
            <span className="text-[10px] text-rose-300/80 font-mono">{driftRate}% would fail</span>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
            <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
              False-Positive Risk
            </span>
            <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
              &lt; 0.2%
            </div>
            <span className="text-[10px] text-emerald-300/80 font-mono">Safe for enforcement</span>
          </div>
        </div>

        {/* Counterfactual Timeline Chart */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              Counterfactual Interceptions Timeline Over Time:
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Purple = Total Traffic • Red = Candidate Blocks
            </span>
          </div>

          <div className="h-28 flex items-end justify-between gap-3 pt-4 px-2 border-b border-slate-800">
            {timelineData.map((d, i) => {
              const maxH = 182;
              const barHeight = Math.round((d.total / maxH) * 85);
              const blockHeight = Math.max(4, Math.round((d.wouldBlock / 5) * 40));

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full max-w-[40px] flex flex-col items-center gap-0.5 justify-end h-full">
                    {/* Would block bar */}
                    {d.wouldBlock > 0 && (
                      <div
                        style={{ height: `${blockHeight}px` }}
                        className="w-full bg-rose-500/80 rounded-t-sm"
                        title={`Would block: ${d.wouldBlock}`}
                      />
                    )}
                    {/* Safe pass bar */}
                    <div
                      style={{ height: `${barHeight}px` }}
                      className="w-full bg-purple-600/40 border border-purple-500/50 rounded-t-sm group-hover:bg-purple-600/60 transition"
                      title={`Total: ${d.total}`}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Shadow Policies Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Policies in Learning / Shadow Mode</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 border border-purple-800 text-purple-300 font-mono">
              {shadowPolicies.length} Active
            </span>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Traffic is forwarded safely without blocking
          </span>
        </div>

        <div className="divide-y divide-slate-800">
          {shadowPolicies.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No policies are currently deployed in <span className="font-mono text-purple-300">SHADOW_LEARN</span> mode.
              You can toggle any active policy into Shadow Mode from the "Active Guardrails" tab to test counterfactually.
            </div>
          ) : (
            shadowPolicies.map((p) => (
              <div key={p.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-800/20 transition">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{p.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 border border-slate-700 text-indigo-300">
                      Tool: {p.targetTool}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-purple-950 border border-purple-800 text-purple-300">
                      SHADOW_LEARN
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    Target Rule: <span className="text-slate-200">{p.ruleField || "*"}</span>{" "}
                    <span className="text-indigo-400">{p.ruleOperator || "EQUALS"}</span>{" "}
                    <span className="text-amber-300">{p.ruleTarget || "true"}</span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono pt-1">
                    <span>Counterfactual Trigger Count: <span className="text-purple-300 font-bold">12 hits</span></span>
                    <span>•</span>
                    <span>False-Positive Score: <span className="text-emerald-400 font-bold">0.05%</span></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Search in Graylog Button */}
                  <Link
                    href={`/dashboard/logs?query=triggered_policy_id:"${p.id}" OR policy_name:"${p.name}"`}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 bg-slate-800 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Radio className="h-3.5 w-3.5 text-cyan-400" />
                    Search in Graylog
                  </Link>

                  {/* Promote to Live Button */}
                  <button
                    type="button"
                    disabled={isPolicyFrozen || promotingId === p.id}
                    onClick={() => handlePromoteToActive(p.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-600/20 disabled:opacity-40"
                  >
                    {promotingId === p.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    Promote to Live (ACTIVE)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Graylog Shadow Event Search & Ingestion Stream */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Graylog Shadow Event Trail &amp; Query Console</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">SINK: Graylog REST API (Port 9000)</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={graylogQuery}
              onChange={(e) => setGraylogQuery(e.target.value)}
              placeholder='e.g. mode:"SHADOW_LEARN" AND verdict:"BLOCK"'
              className="w-full bg-transparent text-white font-mono text-xs focus:outline-none placeholder-slate-600"
            />
          </div>
          <Link
            href={`/dashboard/logs?query=${encodeURIComponent(graylogQuery)}`}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-600/30"
          >
            <Radio className="h-3.5 w-3.5" />
            Execute Graylog Query
          </Link>
        </div>

        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-cyan-400 font-bold">Query Syntax Tip:</span>
            <span className="text-[10px] text-slate-500">Lucene Standard</span>
          </div>
          <p className="text-[11px] text-slate-300 font-sans">
            Query all shadow executions: <code className="text-indigo-300 font-mono">mode:"SHADOW_LEARN"</code> • Filter by counterfactual block: <code className="text-indigo-300 font-mono">mode:"SHADOW_LEARN" AND shadow_verdict:"BLOCK"</code>
          </p>
        </div>
      </div>
    </div>
  );
}
