"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Cpu,
  Layers,
  HardDrive,
  Wifi,
  RefreshCw,
  Server,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Database,
  Activity,
  Gauge
} from "lucide-react";
import {
  getSystemTelemetryAction,
  getSystemStatusAction,
  SystemTelemetryData,
  SystemOverallStatus
} from "@/app/actions";

interface SystemTelemetryClientProps {
  initialData: SystemTelemetryData;
  initialStatus?: SystemOverallStatus;
}

export function SystemTelemetryClient({ initialData, initialStatus }: SystemTelemetryClientProps) {
  const [data, setData] = useState<SystemTelemetryData>(initialData);
  const [status, setStatus] = useState<SystemOverallStatus | undefined>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchTelemetry = () => {
    startTransition(async () => {
      try {
        const [nextData, nextStatus] = await Promise.all([
          getSystemTelemetryAction(),
          getSystemStatusAction()
        ]);
        setData(nextData);
        setStatus(nextStatus);
      } catch (err) {
        console.error("Failed to refresh system telemetry & status", err);
      }
    });
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const { metrics, cgroups, nodes } = data;

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-slate-300">
            Host: <span className="text-white font-semibold">{data.hostname}</span>
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-xs font-mono text-slate-400">
            Last Harvest: {new Date(data.timestamp).toLocaleTimeString()}
          </span>
          {cgroups.isCgroupsV2 && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono font-bold">
              cgroups v2
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0"
            />
            Auto-refresh (3s)
          </label>

          <button
            type="button"
            disabled={isPending}
            onClick={fetchTelemetry}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:text-white hover:border-slate-600 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg border border-indigo-700/60 bg-indigo-950/60 text-indigo-200 hover:text-white text-xs font-medium flex items-center gap-1.5 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Grafana
          </a>
        </div>
      </div>

      {/* 1. Infrastructure Microservice Health Cards */}
      {status && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Ecosystem Availability Posture</h2>
            </div>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded font-mono font-bold tracking-wider uppercase border ${
                status.overall === "ALL_SYSTEMS_OPERATIONAL"
                  ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                  : "bg-amber-950 text-amber-300 border-amber-800"
              }`}
            >
              {status.overall}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {status.components.map((comp) => {
              const isOk = comp.status === "OPERATIONAL";
              return (
                <div
                  key={comp.name}
                  className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition ${
                    isOk
                      ? "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      : "bg-rose-950/20 border-rose-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
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
                        <h4 className="text-xs font-bold text-white">{comp.name}</h4>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {comp.endpoint || comp.category}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase border ${
                        isOk
                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                          : "bg-rose-950 text-rose-300 border-rose-800"
                      }`}
                    >
                      {comp.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-slate-800/60 text-slate-400">
                    <span>Round-Trip Latency:</span>
                    <span className={`font-bold ${comp.latencyMs < 5 ? "text-emerald-400" : "text-amber-400"}`}>
                      {comp.latencyMs} ms
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid: 4 Core Resource Meters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. CPU Utilization */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">CPU Utilization</span>
            <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white font-mono">
                {metrics.cpuUtilization}%
              </span>
              <span className="text-xs text-slate-500 font-mono">load average</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  metrics.cpuUtilization > 80
                    ? "bg-rose-500"
                    : metrics.cpuUtilization > 50
                    ? "bg-amber-500"
                    : "bg-indigo-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, metrics.cpuUtilization))}%` }}
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between font-mono">
            <span>Cores / Workers</span>
            <span>Allocated</span>
          </div>
        </div>

        {/* 2. Memory RSS */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Memory RSS</span>
            <div className="p-2 rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white font-mono">
                {formatBytes(metrics.memoryRssBytes)}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                / {formatBytes(metrics.memoryLimitBytes)}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  metrics.memoryPercent > 85
                    ? "bg-rose-500"
                    : metrics.memoryPercent > 65
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, metrics.memoryPercent))}%` }}
              />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between font-mono">
            <span>Usage</span>
            <span>{metrics.memoryPercent}% limit</span>
          </div>
        </div>

        {/* 3. Disk I/O */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Disk Throughput</span>
            <div className="p-2 rounded-lg bg-cyan-600/10 text-cyan-400 border border-cyan-500/20">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {formatBytes(metrics.diskReadBytes)}
              </span>
              <span className="text-xs text-slate-500 font-mono">Read</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-cyan-300 font-mono">
                {formatBytes(metrics.diskWriteBytes)}
              </span>
              <span className="text-xs text-slate-500 font-mono">Write</span>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between font-mono">
            <span>Volume I/O</span>
            <span>Buffered NVMe</span>
          </div>
        </div>

        {/* 4. Network Throughput */}
        <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Network I/O</span>
            <div className="p-2 rounded-lg bg-purple-600/10 text-purple-400 border border-purple-500/20">
              <Wifi className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white font-mono">
                {formatBytes(metrics.networkRxBytes)}
              </span>
              <span className="text-xs text-slate-500 font-mono">Ingress</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-extrabold text-purple-300 font-mono">
                {formatBytes(metrics.networkTxBytes)}
              </span>
              <span className="text-xs text-slate-500 font-mono">Egress</span>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 flex justify-between font-mono">
            <span>Interface eth0</span>
            <span>TLS Intercepted</span>
          </div>
        </div>
      </div>

      {/* Fastify Event Loop Lag Quantiles */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-600/10 text-amber-400 border border-amber-500/20">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Fastify Event Loop Lag (Quantile Distribution)
              </h2>
              <p className="text-xs text-slate-400">
                Measures thread responsiveness and macro-task blocking in milliseconds.
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Target: &lt;10ms
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <div className="text-xs text-slate-400 font-medium">P50 (Median Lag)</div>
            <div className="text-2xl font-extrabold text-white font-mono mt-1">
              {metrics.eventLoopLagMs.p50} ms
            </div>
            <div className="text-[10px] text-emerald-400 font-mono mt-2">
              Normal non-blocking execution
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <div className="text-xs text-slate-400 font-medium">P90 (90th Percentile)</div>
            <div className="text-2xl font-extrabold text-amber-300 font-mono mt-1">
              {metrics.eventLoopLagMs.p90} ms
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-2">
              Regex DLP & parsing bursts
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <div className="text-xs text-slate-400 font-medium">P99 (Worst Case)</div>
            <div className="text-2xl font-extrabold text-purple-300 font-mono mt-1">
              {metrics.eventLoopLagMs.p99} ms
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-2">
              Bounded AST evaluation
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Discovered Service Mesh Matrix */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Auto-Discovered Microservice Mesh Probes
              </h2>
              <p className="text-xs text-slate-400">
                Real-time TCP socket probes and round-trip ping latencies across container nodes.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {nodes.length} Nodes Discovered
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nodes.map((node) => {
            const isUp = node.status === "UP";
            return (
              <div
                key={`${node.service}-${node.port}`}
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  isUp
                    ? "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    : "border-rose-900/60 bg-rose-950/20"
                } transition`}
              >
                <div className="flex items-center gap-2.5">
                  {isUp ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white font-mono capitalize">
                      {node.service}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {node.host}:{node.port}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-xs font-mono font-bold ${
                      node.latencyMs < 2
                        ? "text-emerald-400"
                        : node.latencyMs < 10
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    {node.latencyMs} ms
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase font-mono">
                    {node.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
