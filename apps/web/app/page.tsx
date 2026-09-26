import Link from "next/link";
import { ShieldAlert, ArrowRight, Lock, Eye, Zap, LogIn, LayoutDashboard } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/iam/config";

export default async function HomePage() {
  let isAuthenticated = false;
  try {
    if (isClerkConfigured()) {
      const { userId } = await auth();
      isAuthenticated = Boolean(userId);
    } else {
      isAuthenticated = true;
    }
  } catch {
    isAuthenticated = !isClerkConfigured();
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
            X4G4T <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono">PROXY</span>
          </span>
        </div>

        <nav className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/status"
            className="text-xs text-emerald-400 hover:text-emerald-300 transition font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/60"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            System Status
          </Link>

          <Link
            href="/dashboard/policies"
            className="text-xs text-slate-300 hover:text-white transition font-medium hidden sm:inline"
          >
            Policies
          </Link>

          <Link
            href="/dashboard/insights"
            className="text-xs text-purple-300 hover:text-purple-200 transition font-medium hidden sm:inline"
          >
            AI Insights
          </Link>

          <Link
            href="/dashboard/docs"
            className="text-xs text-slate-400 hover:text-white transition font-medium hidden md:inline"
          >
            Docs
          </Link>

          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition shadow-sm"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Console
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition shadow-sm"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </Link>
          )}
        </nav>
      </header>

      {/* Hero / Splashscreen Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/80 text-indigo-400 text-xs font-mono">
            <ShieldAlert className="h-3.5 w-3.5" />
            X4G4T Tactical Defense Gate
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl leading-tight">
            Tactical Defense Gate for <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
              Autonomous AI Agents
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto">
            An inline policy firewall sitting between your AI agent loops and enterprise SaaS APIs. Enforce deterministic limits, intercept high-impact mutations, and record tamper-evident audit logs in &lt;15ms.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/20"
              >
                <LogIn className="h-4 w-4" />
                Sign In to X4G4T
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            <Link
              href="/dashboard/docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-medium text-sm transition"
            >
              View Documentation
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-12 text-left">
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1.5">
              <Zap className="h-5 w-5 text-indigo-400" />
              <div className="text-sm font-semibold text-white">&lt;1ms In-Memory AST</div>
              <div className="text-xs text-slate-400">Pure deterministic operator comparisons without hot-path database lag.</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1.5">
              <Lock className="h-5 w-5 text-amber-400" />
              <div className="text-sm font-semibold text-white">Human-in-the-Loop</div>
              <div className="text-xs text-slate-400">Suspends destructive actions and alerts operators via Slack interactive cards.</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1.5">
              <Eye className="h-5 w-5 text-emerald-400" />
              <div className="text-sm font-semibold text-white">Tamper-Evident Audit</div>
              <div className="text-xs text-slate-400">ISO 27001 cryptographic hash chains and GDPR Art. 17 crypto-shredding.</div>
            </div>
          </div>
        </div>
      </main>

      {/* Corporate Branded Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 px-6 text-xs text-slate-500">
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
            <Link href="/status" className="hover:text-emerald-400 transition">
              System Status
            </Link>
            <span>•</span>
            <a
              href="http://localhost:3001/d/x4g4t-system-status"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-300 transition"
            >
              Grafana
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
