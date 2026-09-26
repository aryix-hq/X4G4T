import Link from "next/link";
import { UserProfileButton } from "@/components/user-profile-button";
import { ShieldAlert, Key, FileCheck, Activity, BookOpen, UserCheck, Sparkles, Server, Cpu } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { isClerkConfigured } from "@/lib/iam/config";
import { DashboardFooter } from "./dashboard-footer";
import { KillSwitchBanner } from "@/components/kill-switch-banner";
import { TwoFactorEnrollmentTrigger } from "@/components/two-factor-enrollment-trigger";
import { getEmergencyKillSwitchAction } from "@/app/actions";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { orgName, role } = await getTenantContext();
  const clerkActive = isClerkConfigured();
  const killSwitch = await getEmergencyKillSwitchAction();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans flex-col">
      {/* Master 2FA Emergency Kill Switch Sticky Banner */}
      <KillSwitchBanner
        initialActive={killSwitch.active}
        initialReason={killSwitch.reason}
        activatedAt={killSwitch.activatedAt}
        role={role}
      />

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
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-bold tracking-wider border ${
                      role === "admin"
                        ? "bg-indigo-950/80 text-indigo-300 border-indigo-800"
                        : "bg-amber-950/80 text-amber-300 border-amber-800"
                    }`}
                  >
                    Role: {role}
                  </span>
                  <TwoFactorEnrollmentTrigger variant="badge" />
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
                    href="/dashboard/insights"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition group"
                  >
                    <Sparkles className="h-4 w-4 text-purple-400 group-hover:text-purple-300 transition" />
                    AI Insights & ML Rules
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
                    href="/dashboard/system"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Server className="h-4 w-4 text-emerald-400" />
                    System Health &amp; Telemetry
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
                    href="/dashboard/policies"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <FileCheck className="h-4 w-4 text-indigo-400" />
                    Guardrail Policies
                  </Link>

                  <Link
                    href="/dashboard/insights"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition group"
                  >
                    <Sparkles className="h-4 w-4 text-purple-400 group-hover:text-purple-300 transition" />
                    AI Insights & ML Rules
                  </Link>

                  <Link
                    href="/dashboard/status"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Server className="h-4 w-4 text-emerald-400" />
                    System Status & Health
                  </Link>

                  <Link
                    href="/dashboard/system"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Cpu className="h-4 w-4 text-cyan-400" />
                    Dynamic Telemetry
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

          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <TwoFactorEnrollmentTrigger variant="card" />

            <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-1">
              <span>v0.1.0-alpha</span>
              {clerkActive ? (
                <UserProfileButton />
              ) : (
                <div className="h-6 w-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-[10px] font-semibold text-indigo-300">
                  {orgName?.charAt(0)?.toUpperCase() || "A"}
                </div>
              )}
            </div>
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

