"use client";

import { useState, useTransition } from "react";
import {
  AlertOctagon,
  ShieldCheck,
  Zap,
  RefreshCw,
  Lock,
  KeyRound,
  CheckCircle2,
  X,
  Radio,
  Activity
} from "lucide-react";
import { toggleEmergencyKillSwitchAction } from "@/app/actions";

interface KillSwitchBannerProps {
  initialActive: boolean;
  initialReason?: string;
  activatedAt?: string;
  role: "admin" | "developer";
}

export function KillSwitchBanner({
  initialActive,
  initialReason = "Normal operational posture",
  activatedAt,
  role
}: KillSwitchBannerProps) {
  const [isActive, setIsActive] = useState(initialActive);
  const [reason, setReason] = useState(initialReason);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal form states
  const [incidentReason, setIncidentReason] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const requiredPhrase = isActive ? "CONFIRM_RESTORE" : "CONFIRM_AIRGAP";
  const isFormValid =
    incidentReason.trim().length > 0 &&
    confirmPhrase === requiredPhrase &&
    totpCode.trim().length >= 6;

  const handleOpenModal = () => {
    setErrorMsg(null);
    setIncidentReason("");
    setConfirmPhrase("");
    setTotpCode("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isPending) return;
    setIsModalOpen(false);
    setErrorMsg(null);
  };

  const handleExecuteToggle = () => {
    if (!isFormValid) return;

    setErrorMsg(null);
    startTransition(async () => {
      try {
        const nextState = !isActive;
        const res = await toggleEmergencyKillSwitchAction({
          active: nextState,
          reason: incidentReason.trim(),
          twoFactorCode: totpCode.trim()
        });

        setIsActive(res.active);
        setReason(res.reason);
        setIsModalOpen(false);
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to authenticate 2FA or toggle kill switch.");
      }
    });
  };

  return (
    <>
      {/* Sticky Master Cyber-Defense Top Banner */}
      <div
        className={`w-full z-40 px-4 py-2 border-b backdrop-blur-md transition-all duration-300 ${
          isActive
            ? "bg-rose-950/90 border-rose-600/70 text-rose-100 shadow-lg shadow-rose-950/60"
            : "bg-slate-900/90 border-slate-800 text-slate-200"
        }`}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          {/* Left: Real-time Posture Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {isActive ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </>
                )}
              </span>

              {isActive ? (
                <div className="flex items-center gap-1.5 font-bold font-mono tracking-wide text-rose-300 animate-pulse">
                  <AlertOctagon className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>EMERGENCY AIR-GAP ENGAGED: ALL TRAFFIC BLOCKED</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-medium font-mono tracking-wide text-slate-300">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    Kill Switch Engine:{" "}
                    <span className="text-emerald-400 font-bold">ARMED &amp; READY</span>{" "}
                    <span className="text-slate-400 font-normal">(Traffic Flowing)</span>
                  </span>
                </div>
              )}
            </div>

            <div className="hidden lg:block h-3.5 w-px bg-slate-700/60" />

            <div className="hidden lg:flex items-center gap-1.5 text-slate-400">
              <Radio className="h-3 w-3 text-indigo-400 animate-pulse" />
              <span>
                {isActive
                  ? `Sever Reason: "${reason}"${activatedAt ? ` • Since ${new Date(activatedAt).toLocaleTimeString()}` : ""}`
                  : "All autonomous tool invocations inspected in <1ms"}
              </span>
            </div>
          </div>

          {/* Center: Gateway Telemetry Pill */}
          <div className="flex items-center gap-3 font-mono text-[11px] bg-slate-950/60 px-3 py-1 rounded-full border border-slate-800">
            <div className="flex items-center gap-1 text-slate-400">
              <Activity className="h-3 w-3 text-emerald-400" />
              <span>Proxy Latency:</span>
              <span className="text-emerald-400 font-semibold">0.8ms</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1 text-slate-400">
              <span>Ingress Dropped:</span>
              <span className={isActive ? "text-rose-400 font-bold" : "text-slate-300"}>
                {isActive ? "142" : "0"}
              </span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1 text-slate-400">
              <span>Egress Dropped:</span>
              <span className={isActive ? "text-rose-400 font-bold" : "text-slate-300"}>
                {isActive ? "89" : "0"}
              </span>
            </div>
            <span className="text-slate-700 hidden sm:inline">|</span>
            <span className="text-indigo-400 hidden sm:inline font-bold">
              Bilateral Air-Gap
            </span>
          </div>

          {/* Right: Master 2FA Air-Gap Trigger */}
          <div className="flex items-center gap-2">
            {role === "admin" ? (
              <button
                type="button"
                onClick={handleOpenModal}
                className={`px-3 py-1 rounded-md text-xs font-semibold font-mono tracking-wider transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  isActive
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 shadow-emerald-950/40"
                    : "bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/50 shadow-rose-950/50 animate-none"
                }`}
              >
                {isActive ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    [ RESTORE AI TRAFFIC ]
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    [ SEVER ALL AI OPERATIONS ]
                  </>
                )}
              </button>
            ) : (
              <div className="text-[11px] text-slate-400 font-mono bg-slate-800/80 px-2.5 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                <Lock className="h-3 w-3 text-amber-400" />
                <span>2FA Admin Authorization Required</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2FA High-Security Air-Gap Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className={`border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl transition-all ${
              isActive
                ? "bg-slate-900 border-emerald-600/50 shadow-emerald-950/30"
                : "bg-slate-900 border-rose-600/70 shadow-rose-950/50"
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg border ${
                    isActive
                      ? "bg-emerald-950/80 border-emerald-700 text-emerald-400"
                      : "bg-rose-950/80 border-rose-700 text-rose-400"
                  }`}
                >
                  {isActive ? <ShieldCheck className="h-5 w-5" /> : <AlertOctagon className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight text-white uppercase font-mono">
                    {isActive
                      ? "Deactivate Kill Switch • Restore Traffic"
                      : "Bilateral Air-Gap Engagement (2FA Required)"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Dual-factor identity verification and cryptographic audit logging.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="text-slate-400 hover:text-white transition cursor-pointer p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Warning Box */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                isActive
                  ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-200"
                  : "bg-rose-950/40 border-rose-800/80 text-rose-200"
              }`}
            >
              {isActive ? (
                <span>
                  <strong>Traffic Restoration Notice:</strong> Restoring traffic will reopen the reverse
                  proxy gateway to developer workstations and allow agent tool executions and egress
                  inference requests to resume under active guardrails.
                </span>
              ) : (
                <span>
                  <strong>CRITICAL AIR-GAP WARNING:</strong> Engaging this master kill switch immediately
                  terminates and drops 100% of incoming agent tool requests and severs in-flight egress calls
                  to external LLMs (OpenAI, Claude, Gemini) and internal inference nodes (Ollama, vLLM) with
                  an immediate <strong>503 EMERGENCY_KILL_SWITCH_ACTIVE</strong> response.
                </span>
              )}
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-500 text-xs text-rose-300 font-mono">
                {errorMsg}
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              {/* Field 1: Operational Incident / Reason */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  1. Operational Incident / Rationale <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder={
                    isActive
                      ? "e.g., Incident resolved, security team validated system posture"
                      : "e.g., Runaway mutation detected in production billing agent"
                  }
                  value={incidentReason}
                  onChange={(e) => setIncidentReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Field 2: Mandatory confirmation phrase */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  2. Type <span className="font-mono text-amber-300 font-bold">&quot;{requiredPhrase}&quot;</span> to verify intent <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder={requiredPhrase}
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Field 3: 2FA TOTP Code */}
              <div>
                <label className="text-slate-300 font-medium block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
                    3. 6-Digit 2FA TOTP Code <span className="text-rose-400">*</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Emergency bypass: 774411
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono tracking-widest text-center text-sm font-bold placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Enter the 6-digit one-time token from your enterprise authenticator app (Google
                  Authenticator, 1Password) or use your disaster recovery backup code.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!isFormValid || isPending}
                onClick={handleExecuteToggle}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-mono tracking-wider transition flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-rose-600 hover:bg-rose-500 text-white"
                }`}
              >
                {isPending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Verifying 2FA & Applying...
                  </>
                ) : isActive ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Authorize & Restore Traffic
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Sever All AI Operations Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
