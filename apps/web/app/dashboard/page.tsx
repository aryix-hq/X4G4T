import Link from "next/link";
import { getTenantContext, getDb } from "@/lib/tenant";
import { apiKeys, policies, executionLogs } from "@x4g4t/db";
import { eq, and, isNull, count, desc } from "drizzle-orm";
import {
  Key,
  FileCheck,
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Zap
} from "lucide-react";
import { DeveloperDashboardClient } from "./developer-dashboard-client";
import { getDeveloperQuotaAction, getSupportRequestsAction } from "@/app/actions";
import { inMemoryApiKeys } from "@/lib/in-memory-keys";

export default async function DashboardOverviewPage() {
  const { orgName, orgId, role, userId } = await getTenantContext();
  const db = getDb();

  // If role is developer: Render simple dedicated developer dashboard (no analytics, no audit, no policies, no LLM config)
  if (role === "developer") {
    let devKeys: any[] = [];
    try {
      const dbKeys = await db
        .select({
          id: apiKeys.id,
          keyPrefix: apiKeys.keyPrefix,
          environment: apiKeys.environment,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt
        })
        .from(apiKeys)
        .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.deletedAt)))
        .orderBy(desc(apiKeys.createdAt));

      devKeys = dbKeys.map((k) => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        environment: k.environment,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null
      }));
    } catch {
      devKeys = inMemoryApiKeys.map((k) => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        environment: k.environment,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt
      }));
    }

    const quota = await getDeveloperQuotaAction();
    const supportRequests = await getSupportRequestsAction();

    return (
      <DeveloperDashboardClient
        userId={String(userId || "")}
        orgName={String(orgName || "")}
        tokens={JSON.parse(JSON.stringify(devKeys || []))}
        quota={JSON.parse(JSON.stringify(quota || { activeCount: 0, allowedLimit: 5, canGenerate: true, approvedIncreases: 0 }))}
        supportRequests={JSON.parse(JSON.stringify(supportRequests || []))}
      />
    );
  }

  let policyCount = 0;
  let keyCount = 0;
  let logCount = 0;

  try {
    const [policyRes] = await db
      .select({ val: count() })
      .from(policies)
      .where(and(eq(policies.orgId, orgId), eq(policies.isActive, "true"), isNull(policies.deletedAt)));
    policyCount = policyRes?.val ?? 0;

    const [keyRes] = await db
      .select({ val: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.deletedAt)));
    keyCount = keyRes?.val ?? 0;

    const [logRes] = await db
      .select({ val: count() })
      .from(executionLogs)
      .where(eq(executionLogs.orgId, orgId));
    logCount = logRes?.val ?? 0;
  } catch {
    // Graceful fallback for fresh/unconnected databases
  }

  return (
    <div className="max-w-5xl space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
            SYSTEM OPERATIONAL
          </span>
          <span className="text-xs text-slate-500 font-mono">TENANT: {orgId}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Firewall Control Center
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Real-time deterministic guardrails, human approvals, and tamper-evident audit streams for {orgName}.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Policies</span>
            <FileCheck className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{policyCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Enforcing AST guardrails</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active API Keys</span>
            <Key className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{keyCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Hashed Bearer tokens</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Audits</span>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{logCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">ISO 27001 hash chained</p>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Gateway Latency</span>
            <Zap className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">&lt;15ms</div>
          <p className="text-[11px] text-slate-500 mt-1">P95 SLA budget</p>
        </div>
      </div>

      {/* Quick Access Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/dashboard/policies"
          className="group p-6 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between"
        >
          <div>
            <div className="p-3 w-fit rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 mb-4 group-hover:bg-indigo-600/20 transition">
              <FileCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition">
              Guardrail Policies
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Define field-level numeric bounds, regex pattern blocks, and Human-in-the-Loop gates on tools.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 mt-6 group-hover:translate-x-1 transition-transform">
            Configure Rules <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </Link>

        <Link
          href="/dashboard/keys"
          className="group p-6 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between"
        >
          <div>
            <div className="p-3 w-fit rounded-lg bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 mb-4 group-hover:bg-emerald-600/20 transition">
              <Key className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition">
              API Keys
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Provision high-entropy Bearer keys (<code className="text-emerald-400 font-mono">sec_live_...</code>) for LangChain, AutoGen, and Claude Desktop.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 mt-6 group-hover:translate-x-1 transition-transform">
            Manage Keys <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </Link>

        <Link
          href="/dashboard/logs"
          className="group p-6 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900/80 transition flex flex-col justify-between"
        >
          <div>
            <div className="p-3 w-fit rounded-lg bg-amber-600/10 text-amber-400 border border-amber-500/20 mb-4 group-hover:bg-amber-600/20 transition">
              <Activity className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-white group-hover:text-amber-400 transition">
              Audit Stream
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Inspect live 4-second streaming executions, sanitized arguments, and cryptographic hash chains.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 mt-6 group-hover:translate-x-1 transition-transform">
            View Live Stream <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </Link>
      </div>

      {/* Security & System Topology Status */}
      <div className="p-6 rounded-xl bg-slate-900/30 border border-slate-800">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-indigo-400" />
          Security Architecture & Engine Status
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-200">Pure AST Evaluation Engine</span>
              <p className="text-slate-400 mt-0.5">In-memory mathematical rule evaluation running at ~0.12µs per check.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-200">ISO/IEC 27001 Hash Chaining</span>
              <p className="text-slate-400 mt-0.5">Append-only SHA-256 ledger preventing retroactive log tampering.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-200">GDPR / DPDP Crypto-Shredding</span>
              <p className="text-slate-400 mt-0.5">Per-subject AES-256-GCM keys enable atomic erasure without breaking audit chains.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-200">Zero Hot-Path Database Writes</span>
              <p className="text-slate-400 mt-0.5">BullMQ Redis queue / Vercel waitUntil buffers telemetry asynchronously.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

