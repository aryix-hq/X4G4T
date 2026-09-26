import Link from "next/link";
import { Activity, ShieldAlert, ExternalLink, ArrowRight, BarChart2, Layers, Sparkles } from "lucide-react";
import { getSystemStatusAction } from "@/app/actions";
import { StatusClient } from "../dashboard/status/status-client";

export const dynamic = "force-dynamic";

export default async function PublicStatusPage() {
  const status = await getSystemStatusAction();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 group-hover:scale-105 transition">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <span className="font-bold tracking-tight text-white flex items-center gap-1.5 text-base">
                  X4G4T
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono">
                    STATUS
                  </span>
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  by ARYIX (OPC) Private Limited
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="http://localhost:3001/d/x4g4t-system-status"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <BarChart2 className="h-3.5 w-3.5 text-indigo-400" />
              Grafana Live
              <ExternalLink className="h-3 w-3 text-slate-500" />
            </a>

            <Link
              href="/dashboard/policies"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              Policies
            </Link>

            <Link
              href="/dashboard/insights"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-xs font-medium text-purple-300 hover:text-purple-200 transition"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              AI Insights
            </Link>

            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm"
            >
              Console
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-10 w-full space-y-8 flex-1">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/80 text-[11px] font-mono font-medium text-emerald-300 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE TELEMETRY & MULTI-SERVICE HEALTH MONITOR
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Activity className="h-8 w-8 text-emerald-400" />
            X4G4T Ecosystem Operational Status
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
            Real-time availability, sub-millisecond AST evaluation latency, and diagnostic telemetry across PostgreSQL,
            Redis rate-limiting bus, Elasticsearch audit stream, X4G4T Fastify Proxy Gateway, and the independent ML Mining Service.
          </p>
        </div>

        <StatusClient initialStatus={JSON.parse(JSON.stringify(status))} />
      </main>

      {/* Branded Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-8 px-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">X4G4T</span>
            <span>•</span>
            <span>Zero-Latency Headless Policy Firewall &amp; DLP Proxy</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.aryix.co.in/"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-indigo-400 transition underline underline-offset-4"
            >
              ARYIX (OPC) Private Limited
            </a>
            <span>•</span>
            <a
              href="http://localhost:3001/d/x4g4t-system-status"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300 transition"
            >
              Grafana Metrics
            </a>
            <span>•</span>
            <a
              href="http://localhost:9090"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300 transition"
            >
              Prometheus
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

