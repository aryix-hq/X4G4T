"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import { TwoFactorEnrollmentModal } from "./two-factor-enrollment-modal";
import { getTwoFactorEnrollmentAction } from "@/app/actions";

export interface TwoFactorEnrollmentTriggerProps {
  variant?: "badge" | "card" | "nav" | "button" | "inline";
  className?: string;
}

export function TwoFactorEnrollmentTrigger({
  variant = "card",
  className = ""
}: TwoFactorEnrollmentTriggerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  const fetchStatus = () => {
    getTwoFactorEnrollmentAction()
      .then((data) => setEnrolled(data.enrolled))
      .catch(() => setEnrolled(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (variant === "badge") {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border transition cursor-pointer ${
            enrolled
              ? "bg-emerald-950/70 border-emerald-800/80 text-emerald-400 hover:bg-emerald-900/60"
              : "bg-amber-950/70 border-amber-800/80 text-amber-400 hover:bg-amber-900/60 animate-pulse"
          } ${className}`}
          title={enrolled ? "2FA Protection Active (Click to manage)" : "2FA Not Configured (Click to enroll)"}
        >
          {enrolled ? (
            <ShieldCheck className="h-2.5 w-2.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-2.5 w-2.5 text-amber-400" />
          )}
          <span>{enrolled ? "2FA ON" : "2FA SETUP"}</span>
        </button>

        <TwoFactorEnrollmentModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onEnrolled={() => {
            setEnrolled(true);
            fetchStatus();
          }}
        />
      </>
    );
  }

  if (variant === "card") {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition cursor-pointer ${
            enrolled
              ? "bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/80 hover:border-slate-700"
              : "bg-amber-950/20 border-amber-900/40 hover:bg-amber-950/40 hover:border-amber-800/60"
          } ${className}`}
          title={enrolled ? "2FA Protection Active • Click to manage" : "2FA Not Configured • Click to enroll"}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-1.5 rounded-md shrink-0 ${
                enrolled
                  ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                  : "bg-amber-950/80 text-amber-400 border border-amber-800/60"
              }`}
            >
              {enrolled ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-200 truncate">
                Two-Factor Auth
              </div>
              <div
                className={`text-[10px] font-mono truncate ${
                  enrolled ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {enrolled ? "Active • Enforced" : "Setup Required"}
              </div>
            </div>
          </div>
          <KeyRound className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        </button>

        <TwoFactorEnrollmentModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onEnrolled={() => {
            setEnrolled(true);
            fetchStatus();
          }}
        />
      </>
    );
  }

  if (variant === "nav") {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
            enrolled
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50"
              : "bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/50 animate-pulse"
          } ${className}`}
          title={enrolled ? "2FA Protection Active (Click to manage)" : "2FA Not Configured (Click to enroll)"}
        >
          {enrolled ? (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span>{enrolled ? "2FA Protected" : "Enroll 2FA"}</span>
        </button>

        <TwoFactorEnrollmentModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onEnrolled={() => {
            setEnrolled(true);
            fetchStatus();
          }}
        />
      </>
    );
  }

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 cursor-pointer ${className}`}
        >
          <KeyRound className="h-3 w-3" />
          <span>{enrolled ? "Manage 2FA Key" : "Enroll 2FA Key"}</span>
        </button>

        <TwoFactorEnrollmentModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onEnrolled={() => {
            setEnrolled(true);
            fetchStatus();
          }}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
          enrolled
            ? "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
            : "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/30"
        } ${className}`}
      >
        <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
        <span>{enrolled ? "2FA Settings" : "Enroll 2-Factor Auth"}</span>
      </button>

      <TwoFactorEnrollmentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onEnrolled={() => {
          setEnrolled(true);
          fetchStatus();
        }}
      />
    </>
  );
}
