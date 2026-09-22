"use client";

import { useState, useTransition } from "react";
import { AlertOctagon, ShieldCheck, Zap, RefreshCw, UserCheck, Lock, Unlock } from "lucide-react";
import { toggleGlobalAiLockdownAction, togglePolicyFreezeAction, switchRoleAction } from "@/app/actions";

interface LockdownControlProps {
  initialActive: boolean;
  initialReason: string;
  updatedAt: string;
  updatedBy: string;
  initialFreezeActive?: boolean;
  initialFreezeReason?: string;
  freezeUpdatedAt?: string;
  freezeUpdatedBy?: string;
  currentRole: "admin" | "developer";
}

export function LockdownControl({
  initialActive,
  initialReason,
  updatedAt,
  updatedBy,
  initialFreezeActive = false,
  initialFreezeReason = "No freeze reason provided",
  freezeUpdatedAt = new Date().toISOString(),
  freezeUpdatedBy = "system",
  currentRole
}: LockdownControlProps) {
  const [isActive, setIsActive] = useState(initialActive);
  const [reason, setReason] = useState(initialReason);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [customReason, setCustomReason] = useState("");

  const [isFreezeActive, setIsFreezeActive] = useState(initialFreezeActive);
  const [freezeReason, setFreezeReason] = useState(initialFreezeReason);
  const [showFreezeInput, setShowFreezeInput] = useState(false);
  const [customFreezeReason, setCustomFreezeReason] = useState("");

  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    if (!isActive && !showReasonInput) {
      setShowReasonInput(true);
      return;
    }

    const finalReason = customReason.trim() || (isActive ? "Lockdown deactivated by SecOps." : "Emergency AI kill-switch engaged by SecOps.");

    startTransition(async () => {
      try {
        const nextState = !isActive;
        const res = await toggleGlobalAiLockdownAction(nextState, finalReason);
        setIsActive(res.active);
        setReason(res.details.reason);
        setShowReasonInput(false);
        setCustomReason("");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to toggle global AI lockdown.");
      }
    });
  };

  const handleToggleFreeze = () => {
    if (!isFreezeActive && !showFreezeInput) {
      setShowFreezeInput(true);
      return;
    }

    const finalReason = customFreezeReason.trim() || (isFreezeActive ? "Policy freeze lifted by SecOps." : "Policy freeze enabled to prevent configuration drift.");

    startTransition(async () => {
      try {
        const nextState = !isFreezeActive;
        const res = await togglePolicyFreezeAction(nextState, finalReason);
        setIsFreezeActive(res.active);
        setFreezeReason(res.details.reason);
        setShowFreezeInput(false);
        setCustomFreezeReason("");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to toggle policy freeze.");
      }
    });
  };

  const handleSwitchRole = (newRole: "admin" | "developer") => {
    startTransition(async () => {
      await switchRoleAction(newRole);
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Global Kill-Switch & Role Switcher */}
      <div
        className={`p-5 rounded-xl border transition-all ${
          isActive
            ? "bg-rose-950/40 border-rose-600/60 shadow-lg shadow-rose-950/50"
            : "bg-slate-900/60 border-slate-800"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-2.5 rounded-lg border shrink-0 ${
                isActive
                  ? "bg-rose-600/20 border-rose-500/50 text-rose-400 animate-pulse"
                  : "bg-emerald-600/10 border-emerald-500/30 text-emerald-400"
              }`}
            >
              {isActive ? <AlertOctagon className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">
                  Global AI / LLM Execution Lockdown
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase border ${
                    isActive
                      ? "bg-rose-950 text-rose-300 border-rose-800"
                      : "bg-emerald-950 text-emerald-300 border-emerald-800"
                  }`}
                >
                  {isActive ? "ACTIVE • 503 BLOCKED" : "OPERATIONAL"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                {isActive
                  ? `Emergency kill-switch is ENGAGED. All incoming autonomous agent tool executions and LLM proxy calls are immediately rejected with HTTP 503 (AI_LOCKDOWN_ACTIVE). Reason: "${reason}".`
                  : "When engaged, all autonomous agent tool executions across the entire organization are immediately halted at the reverse proxy gateway with HTTP 503."}
              </p>
              <div className="text-[11px] text-slate-500 font-mono mt-1.5 flex items-center gap-3">
                <span>Updated by: {updatedBy}</span>
                <span>•</span>
                <span>{new Date(updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {showReasonInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Reason for lockdown..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-rose-500/60 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 w-64"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleToggle}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50"
                >
                  {isPending ? "Locking..." : "Confirm Lockdown"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReasonInput(false)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handleToggle}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition flex items-center gap-2 ${
                  isActive
                    ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30"
                    : "bg-rose-600/20 border-rose-500/40 text-rose-300 hover:bg-rose-600/30"
                }`}
              >
                {isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                {isActive ? "Deactivate Lockdown" : "Engage Emergency Lockdown"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Middle Banner: Policy Freeze Mode (Lock/Freeze Policy Editing) */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          isFreezeActive
            ? "bg-amber-950/30 border-amber-600/60 shadow-lg shadow-amber-950/30"
            : "bg-slate-900/60 border-slate-800"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-2.5 rounded-lg border shrink-0 ${
                isFreezeActive
                  ? "bg-amber-600/20 border-amber-500/50 text-amber-400"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              {isFreezeActive ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">
                  Policy Edit Freeze Mode (SecOps Configuration Lock)
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase border ${
                    isFreezeActive
                      ? "bg-amber-950 text-amber-300 border-amber-800"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  {isFreezeActive ? "FROZEN • EDITING LOCKED" : "UNLOCKED • EDITABLE"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                {isFreezeActive
                  ? `Guardrail policy changes, additions, deletions, and library deployments are FROZEN to prevent configuration drift or accidental tampering. Reason: "${freezeReason}".`
                  : "Lock policy definitions across the organization during maintenance windows or audit freezes. Prevents any modifications to active guardrails."}
              </p>
              <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-3">
                <span>Freeze Updated by: {freezeUpdatedBy}</span>
                <span>•</span>
                <span>{new Date(freezeUpdatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {showFreezeInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Reason for policy freeze..."
                  value={customFreezeReason}
                  onChange={(e) => setCustomFreezeReason(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-amber-500/60 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 w-64"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleToggleFreeze}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-50"
                >
                  {isPending ? "Updating..." : "Confirm Freeze"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFreezeInput(false)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handleToggleFreeze}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition flex items-center gap-1.5 ${
                  isFreezeActive
                    ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                    : "bg-amber-600/20 border-amber-500/40 text-amber-300 hover:bg-amber-600/30"
                }`}
              >
                {isFreezeActive ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    Unfreeze Policies
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Freeze Policy Editing
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Role Switcher Demo Bar */}
      <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <UserCheck className="h-4 w-4 text-indigo-400" />
          <span>IAM Role RBAC Simulator:</span>
          <span className="font-mono text-white font-semibold uppercase">{currentRole}</span>
          <span className="text-slate-500">
            ({currentRole === "admin" ? "Full Policy & Lockdown Access" : "Read-only Keys & Vault Only"})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending || currentRole === "admin"}
            onClick={() => handleSwitchRole("admin")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              currentRole === "admin"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            Admin View
          </button>
          <button
            type="button"
            disabled={isPending || currentRole === "developer"}
            onClick={() => handleSwitchRole("developer")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              currentRole === "developer"
                ? "bg-amber-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            Developer View (Restricted)
          </button>
        </div>
      </div>
    </div>
  );
}
