import Link from "next/link";
import { UserProfileButton } from "@/components/user-profile-button";
import { ShieldAlert, Key, FileCheck, Activity, BookOpen, UserCheck, AlertOctagon } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { isClerkConfigured } from "@/lib/iam/config";
import { DashboardFooter } from "./dashboard-footer";
import { getGlobalAiLockdownDetails } from "@x4g4t/policy-engine";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { orgName, role } = await getTenantContext();
  const clerkActive = isClerkConfigured();
  const lockdown = getGlobalAiLockdownDetails();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans flex-col">
      {/* Emergency Global AI Lockdown Banner */}
      {lockdown.active && (
        <div className="bg-rose-600 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md animate-pulse z-50">
          <div className="flex items-center gap-2.5 mx-auto">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>
              EMERGENCY AI LOCKDOWN ACTIVE: All autonomous agent tool executions and proxy calls are blocked enterprise-wide (HTTP 503). Reason: &quot;{lockdown.reason}&quot;
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold tracking-tight text-white flex items-center gap-1.5">
                  X4G4T <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono">GATEWAY</span>
                </div>
                <div className="text-xs text-slate-400 truncate w-36" title={orgName}>
                  {orgName}
                </div>
                <div className="mt-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-bold tracking-wider border ${
                      role === "admin"
                        ? "bg-indigo-950/80 text-indigo-300 border-indigo-800"
                        : "bg-amber-950/80 text-amber-300 border-amber-800"
                    }`}
                  >
                    Role: {role}
                  </span>
                </div>
              </div>
            </div>

            <nav className="space-y-1.5 text-sm font-medium">
              {role === "admin" ? (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Activity className="h-4 w-4 text-slate-400" />
                    Overview & Metrics
                  </Link>

                  <Link
                    href="/dashboard/policies"
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition group"
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className="h-4 w-4 text-slate-400 group-hover:text-indigo-400 transition" />
                      Guardrail Policies
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/approvals"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <UserCheck className="h-4 w-4 text-slate-400" />
                    Approvals & Tickets
                  </Link>

                  <Link
                    href="/dashboard/keys"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Key className="h-4 w-4 text-slate-400" />
                    API Keys & LLM Vault
                  </Link>

                  <Link
                    href="/dashboard/logs"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Activity className="h-4 w-4 text-slate-400" />
                    Audit Stream & Analytics
                  </Link>

                  <Link
                    href="/dashboard/docs"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    Documentation
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Key className="h-4 w-4 text-emerald-400" />
                    Developer Dashboard
                  </Link>

                  <Link
                    href="/dashboard/docs"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    Documentation & SDKs
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono">v0.1.0-alpha</span>
            {clerkActive ? (
              <UserProfileButton />
            ) : (
              <div className="h-7 w-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-semibold text-indigo-300">
                {orgName?.charAt(0)?.toUpperCase() || "A"}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto flex flex-col justify-between min-h-screen">
          <div className="flex-1">{children}</div>
          <DashboardFooter />
        </main>
      </div>
    </div>
  );
}

