"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Database,
  Cpu,
  Layers,
  Server,
  ExternalLink,
  ShieldCheck,
  Clock,
  Terminal
} from "lucide-react";
import { getSystemStatusAction, SystemOverallStatus } from "@/app/actions";

interface StatusClientProps {
  initialStatus: SystemOverallStatus;
}

export function StatusClient({ initialStatus }: StatusClientProps) {
  const [status, setStatus] = useState<SystemOverallStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(async () => {
      try {
        const next = await getSystemStatusAction();
        setStatus(next);
      } catch (err: any) {
        alert(err?.message || "Failed to query system status.");
      }
    });
  };

  const isAllGood = status.overall === "ALL_SYSTEMS_OPERATIONAL";
  const isDegraded = status.overall === "PARTIAL_DEGRADATION";

  return (
    <div className="space-y-6">
      {/* Top Health Posture Card */}
      <div
        className={`p-6 rounded-2xl border transition-all shadow-lg ${
          isAllGood
            ? "bg-slate-900/80 border-emerald-500/40 shadow-emerald-950/20"
            : isDegraded
            ? "bg-slate-900/80 border-amber-500/50 shadow-amber-950/20"
            : "bg-slate-900/80 border-rose-600/70 shadow-rose-950/30"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-3 rounded-xl border shrink-0 ${
                isAllGood
                  ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-400"
                  : isDegraded
                  ? "bg-amber-950/80 border-amber-500/50 text-amber-400"
                  : "bg-rose-950/80 border-rose-500/50 text-rose-400 animate-pulse"
              }`}
            >
              {isAllGood ? (
                <ShieldCheck className="h-7 w-7" />
              ) : isDegraded ? (
                <AlertTriangle className="h-7 w-7" />
              ) : (
                <XCircle className="h-7 w-7" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white font-mono">
                  {isAllGood
                    ? "ALL SYSTEMS OPERATIONAL"
                    : isDegraded
                    ? "PARTIAL SYSTEM DEGRADATION"
                    : "CRITICAL COMPONENT OUTAGE"}
                </h2>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase border ${
                    isAllGood
                      ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                      : isDegraded
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : "bg-rose-950 text-rose-300 border-rose-800"
                  }`}
                >
                  {status.overall}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                {isAllGood
                  ? "All core infrastructure dependencies (PostgreSQL 16, Redis 7, Elasticsearch 8, Fastify Proxy Gateway, and ML Policy Miner) are healthy with sub-millisecond telemetry."
                  : isDegraded
                  ? "One or more secondary dependencies is unreachable or reporting latency spikes. Proxy traffic enforcement remains protected via cached local guardrails."
                  : "Core proxy gateway or database connectivity is impaired. Immediate operator review required."}
              </p>
              <div className="text-[11px] text-slate-500 font-mono mt-2 flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Checked: {new Date(status.checkedAt).toLocaleTimeString()}
                </span>
                <span>•</span>
                <span>
                  {status.components.filter((c) => c.status === "OPERATIONAL").length} / {status.components.length} Monitored Microservices
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isPending}
              onClick={handleRefresh}
              className="px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/90 text-slate-200 hover:text-white hover:border-slate-600 text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
              {isPending ? "Pinging..." : "Refresh Posture"}
            </button>

            <Link
              href="/dashboard/system"
              className="px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>Live Telemetry</span>
            </Link>

            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl border border-indigo-500/40 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <span>Grafana Dashboards</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Service Component Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {status.components.map((comp) => {
          const isCompOk = comp.status === "OPERATIONAL";
          const isCompDegraded = comp.status === "DEGRADED";

          return (
            <div
              key={comp.name}
              className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
                      {comp.category === "DATABASE" ? (
                        <Database className="h-4 w-4 text-cyan-400" />
                      ) : comp.category === "CACHE" ? (
                        <Cpu className="h-4 w-4 text-amber-400" />
                      ) : comp.category === "STORAGE" ? (
                        <Layers className="h-4 w-4 text-emerald-400" />
                      ) : comp.category === "GATEWAY" ? (
                        <Server className="h-4 w-4 text-indigo-400" />
                      ) : (
                        <Activity className="h-4 w-4 text-purple-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{comp.name}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">{comp.category}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                      isCompOk
                        ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                        : isCompDegraded
                        ? "bg-amber-950 text-amber-300 border-amber-800"
                        : "bg-rose-950 text-rose-300 border-rose-800"
                    }`}
                  >
                    {comp.status}
                  </span>
                </div>

                {/* Metrics & Details */}
                <div className="mt-3.5 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Round-Trip Latency:</span>
                    <span className="text-white font-semibold">
                      {comp.latencyMs} ms
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span>Endpoint:</span>
                    <span className="text-slate-300 truncate max-w-[180px]" title={comp.endpoint}>
                      {comp.endpoint}
                    </span>
                  </div>

                  {Object.entries(comp.details).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span className="capitalize">{k.replace(/([A-Z])/g, " $1")}:</span>
                      <span className="text-slate-200 truncate max-w-[170px]">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error notice if degraded */}
              {comp.error && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-[11px] text-rose-300 font-mono">
                  Error: {comp.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unhealthy / Degradation Log Stream */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-400" />
            <span>Component Diagnostics & Incident Log Stream</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            {status.unhealthyLogs.length} logged incidents
          </span>
        </div>

        <div className="divide-y divide-slate-800">
          {status.unhealthyLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 space-y-1">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-mono font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Zero Degradations Detected</span>
              </div>
              <p className="text-[11px] text-slate-500">
                All database queries, cache buses, Elasticsearch logs, proxy gateway routes, and ML workers
                are operating cleanly without errors.
              </p>
            </div>
          ) : (
            status.unhealthyLogs.map((log, idx) => (
              <div key={idx} className="p-4 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.level === "ERROR"
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : "bg-amber-950 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="font-semibold text-white">{log.service}</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-rose-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                  {log.message}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                  <div>
                    <strong className="text-slate-300">Operational Impact:</strong> {log.impact}
                  </div>
                  <div>
                    <strong className="text-indigo-300">Remediation:</strong> {log.suggestedAction}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

