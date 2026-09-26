"use client";

import { useState, useEffect, useTransition } from "react";
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  X,
  Lock,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import {
  getTwoFactorEnrollmentAction,
  confirmTwoFactorEnrollmentAction
} from "@/app/actions";

interface TwoFactorEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled?: () => void;
}

export function TwoFactorEnrollmentModal({
  isOpen,
  onClose,
  onEnrolled
}: TwoFactorEnrollmentModalProps) {
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setStatusMessage(null);
    getTwoFactorEnrollmentAction()
      .then((data) => {
        setEnrolled(data.enrolled);
        setSecret(data.secret);
        setOtpauthUrl(data.otpauthUrl);
        setBackupCodes(data.backupCodes);
        setLoading(false);
      })
      .catch((err) => {
        setStatusMessage({ type: "error", text: err?.message || "Failed to load 2FA configuration" });
        setLoading(false);
      });
  }, [isOpen]);

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleCopyUrl = () => {
    if (!otpauthUrl) return;
    navigator.clipboard.writeText(otpauthUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleConfirm = () => {
    if (verificationCode.trim().length !== 6) return;
    setStatusMessage(null);

    startTransition(async () => {
      try {
        const res = await confirmTwoFactorEnrollmentAction({
          secret,
          verificationCode: verificationCode.trim()
        });
        setStatusMessage({ type: "success", text: res.message });
        setEnrolled(true);
        if (onEnrolled) onEnrolled();
        setTimeout(() => {
          onClose();
        }, 1800);
      } catch (err: any) {
        setStatusMessage({ type: "error", text: err?.message || "Verification failed" });
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative text-left">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                2-Factor Authenticator Enrollment (RFC 6238 TOTP)
              </h3>
              <p className="text-xs text-slate-400">
                Required to authorize the Global Bilateral AI Air-Gap Kill Switch.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Generating secure HMAC-SHA1 20-byte secret...</p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Enrollment Status Badge */}
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cyan-400" />
                <span className="font-semibold text-slate-200">Current Enrollment Status:</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                  enrolled
                    ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
                    : "bg-amber-950/80 border-amber-800 text-amber-300"
                }`}
              >
                {enrolled ? "ACTIVE • ENROLLED" : "NOT ENROLLED • ACTION REQUIRED"}
              </span>
            </div>

            {/* Step 1: Base32 Secret */}
            <div className="space-y-2">
              <label className="text-slate-300 font-semibold flex items-center justify-between">
                <span>1. Add Base32 Secret to Authenticator App:</span>
                <span className="text-[10px] text-slate-500 font-normal">Google Authenticator / 1Password / YubiKey</span>
              </label>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-sm text-cyan-300 tracking-wider font-bold select-all overflow-x-auto">
                  {secret}
                </div>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5 shrink-0 cursor-pointer font-medium"
                >
                  {copiedSecret ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {copiedSecret ? "Copied" : "Copy Key"}
                </button>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>App Account Name: <span className="text-slate-300 font-mono">X4G4T SecOps</span></span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                  {copiedUrl ? "Copied URI!" : "Copy otpauth:// URI"}
                </button>
              </div>
            </div>

            {/* Step 2: Verification Input */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <label className="text-slate-300 font-semibold block">
                2. Enter 6-Digit Code from Authenticator to Confirm &amp; Arm:
              </label>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-36 bg-slate-900 border border-indigo-500/60 rounded-xl px-3 py-2 text-center text-lg font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending || verificationCode.trim().length !== 6}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  {isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {isPending ? "Validating Time Step..." : "Confirm & Arm 2FA Air-Gap"}
                </button>
              </div>

              {statusMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    statusMessage.type === "success"
                      ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                      : "bg-rose-950/60 border-rose-800 text-rose-300"
                  }`}
                >
                  {statusMessage.type === "success" ? (
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}
            </div>

            {/* Emergency Break-Glass Codes */}
            <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 text-[11px] space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Emergency Break-Glass Recovery Codes (Offline Vault):</span>
              </div>
              <p className="text-slate-400 text-[10px]">
                In a catastrophe (e.g. mobile device loss), SecOps can authenticate with these disaster recovery codes:
              </p>
              <div className="flex gap-2 font-mono text-amber-300 text-xs font-bold pt-1">
                {backupCodes.map((code) => (
                  <span key={code} className="px-2 py-0.5 rounded bg-slate-950 border border-amber-800/60">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

