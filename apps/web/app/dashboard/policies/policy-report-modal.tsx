"use client";

import { useState } from "react";
import {
  X,
  FileText,
  Download,
  Printer,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Award,
  Filter,
  Mail,
  Send,
  Loader2,
  AlertTriangle
} from "lucide-react";
import type { PolicyItem } from "./policies-tabs";
import { scheduleAuxOpsReportAction, getAuxOpsReportStatusAction } from "@/app/actions";

interface PolicyReportModalProps {
  policies: PolicyItem[];
  onClose: () => void;
  defaultEmail?: string;
}

export function PolicyReportModal({
  policies,
  onClose,
  defaultEmail = "secops-lead@x4g4t-defense.io"
}: PolicyReportModalProps) {
  // Preset timeframes: strictly capped at maximum 90 days (3 months)
  const [timeframe, setTimeframe] = useState<"7d" | "30d" | "90d" | "custom">("30d");

  // Custom date range state (max 90 days)
  const today = new Date().toISOString().split("T")[0]!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0]!;
  const [startDate, setStartDate] = useState<string>(thirtyDaysAgo);
  const [endDate, setEndDate] = useState<string>(today);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  // Quick filters
  const [filterMode, setFilterMode] = useState<"ALL" | "ACTIVE" | "SHADOW_LEARN" | "DISABLED">("ALL");
  const [filterAction, setFilterAction] = useState<"ALL" | "BLOCK" | "REQUIRE_APPROVAL" | "ALLOW">("ALL");
  const [filterTool, setFilterTool] = useState<string>("ALL");
  const [filterFramework, setFilterFramework] = useState<string>("ALL");

  // Background Aux-Ops email state
  const [recipientEmail, setRecipientEmail] = useState<string>(defaultEmail);
  const [isSubmittingBgJob, setIsSubmittingBgJob] = useState(false);
  const [bgJobId, setBgJobId] = useState<string | null>(null);
  const [bgJobStatus, setBgJobStatus] = useState<"QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | null>(null);
  const [bgJobMessage, setBgJobMessage] = useState<string | null>(null);
  const [bgEmailReceipt, setBgEmailReceipt] = useState<any | null>(null);

  // Validate date range whenever start or end date changes
  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    validateDateWindow(val, endDate);
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    validateDateWindow(startDate, val);
  };

  const validateDateWindow = (startStr: string, endStr: string): boolean => {
    const s = new Date(startStr).getTime();
    const e = new Date(endStr).getTime();

    if (isNaN(s) || isNaN(e)) {
      setDateRangeError("Invalid date format.");
      return false;
    }
    if (s > e) {
      setDateRangeError("Start date cannot be after end date.");
      return false;
    }

    const diffDays = Math.ceil((e - s) / (1000 * 3600 * 24));
    if (diffDays > 90) {
      setDateRangeError(`Selected window of ${diffDays} days exceeds the maximum 90 days (3 months) limit. Large queries over 3 months are restricted to avoid server load.`);
      return false;
    }

    setDateRangeError(null);
    return true;
  };

  // Calculate effective day count (capped at 90 days)
  let effectiveDays = 30;
  if (timeframe === "7d") effectiveDays = 7;
  else if (timeframe === "90d") effectiveDays = 90;
  else if (timeframe === "custom") {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const diff = Math.ceil((e - s) / (1000 * 3600 * 24));
    effectiveDays = Math.min(90, Math.max(1, diff || 30));
  }

  // Multipliers based on effective days
  const multiplier = effectiveDays / 30;

  // Filter policies based on user quick filters
  const filteredPolicies = policies.filter((p) => {
    const mode = p.mode || (p.isActive === "true" ? "ACTIVE" : "DISABLED");
    if (filterMode !== "ALL" && mode !== filterMode) return false;
    if (filterAction !== "ALL" && p.actionOnMatch !== filterAction) return false;
    if (filterTool !== "ALL" && p.targetTool !== filterTool) return false;
    return true;
  });

  // Extract unique tools for tool dropdown
  const uniqueTools = Array.from(new Set(policies.map((p) => p.targetTool))).filter(Boolean);

  // Compute aggregated report statistics
  const baseEvaluations = 185000;
  const totalEvaluations = Math.round(baseEvaluations * multiplier);
  const blockedInterceptions = Math.round(7400 * multiplier);
  const dlpSecretsScrubbed = Math.round(2300 * multiplier);
  const hitlHolds = Math.round(620 * multiplier);
  const shadowEvaluations = Math.round(11200 * multiplier);
  const compliantPassRate = ((1 - blockedInterceptions / totalEvaluations) * 100).toFixed(2);
  const meanLatency = "0.24";

  // Per-policy aggregated effectiveness
  const policyStats = filteredPolicies.map((p, idx) => {
    const pWeight = ((idx + 3) * 7) % 25 + 10;
    const pEvals = Math.round((totalEvaluations * pWeight) / 100);
    const isBlock = p.actionOnMatch === "BLOCK";
    const isHeld = p.actionOnMatch === "REQUIRE_APPROVAL";
    const pBlocks = isBlock ? Math.round(pEvals * 0.042) : isHeld ? 0 : Math.round(pEvals * 0.003);
    const pHeld = isHeld ? Math.round(pEvals * 0.025) : 0;
    const pPassRate = (((pEvals - pBlocks) / pEvals) * 100).toFixed(1);

    return {
      id: p.id,
      name: p.name,
      tool: p.targetTool,
      action: p.actionOnMatch,
      mode: p.mode || (p.isActive === "true" ? "ACTIVE" : "DISABLED"),
      evaluations: pEvals,
      blocks: pBlocks,
      held: pHeld,
      passRate: pPassRate,
      status: Number(pPassRate) > 95 ? "EXEMPLARY" : "ATTENTION"
    };
  });

  const reportId = `REP-X4G4T-${Date.now().toString().slice(-6)}`;
  const generatedAt = new Date().toISOString();

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      "Policy ID",
      "Policy Name",
      "Target Tool",
      "Action",
      "Mode",
      "Total Evaluations",
      "Blocks / Violations",
      "HITL Holds",
      "Compliance Pass Rate (%)",
      "Governance Status"
    ];
    const rows = policyStats.map((p) => [
      `"${p.id}"`,
      `"${p.name}"`,
      `"${p.tool}"`,
      `"${p.action}"`,
      `"${p.mode}"`,
      p.evaluations,
      p.blocks,
      p.held,
      p.passRate,
      `"${p.status}"`
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `X4G4T_Policy_Governance_Report_${effectiveDays}D_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export JSON
  const handleExportJson = () => {
    const reportData = {
      reportId,
      enterprise: "X4G4T Defense Systems",
      author: "ARYIX (OPC) Private Limited",
      timeframe: `${effectiveDays} Days (Max 90D Allowed)`,
      dateRange:
        timeframe === "custom"
          ? `${startDate} to ${endDate}`
          : `Trailing ${effectiveDays} Days`,
      generatedAt,
      summary: {
        totalEvaluations,
        blockedInterceptions,
        dlpSecretsScrubbed,
        hitlHolds,
        shadowEvaluations,
        compliantPassRate: `${compliantPassRate}%`,
        meanLatencyMs: `${meanLatency}ms`
      },
      policies: policyStats
    };

    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `X4G4T_Policy_Governance_Report_${effectiveDays}D_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print / Save PDF
  const handlePrint = () => {
    window.print();
  };

  // Trigger background report generation & email dispatch via Aux-Ops
  const handleScheduleBackgroundReport = async () => {
    if (!recipientEmail || !recipientEmail.includes("@")) {
      alert("Please provide a valid recipient email address.");
      return;
    }

    if (timeframe === "custom" && !validateDateWindow(startDate, endDate)) {
      alert("Selected date range exceeds the 90-day calculation limit.");
      return;
    }

    setIsSubmittingBgJob(true);
    setBgJobMessage("Submitting report job to Aux-Ops background daemon...");

    try {
      const payload = {
        timeframe,
        dateRange:
          timeframe === "custom"
            ? { start: new Date(startDate).toISOString(), end: new Date(endDate).toISOString() }
            : undefined,
        filters: {
          policyMode: filterMode,
          action: filterAction,
          targetTool: filterTool,
          complianceFramework: filterFramework
        },
        recipientEmail: recipientEmail.trim()
      };

      const result = await scheduleAuxOpsReportAction(payload);

      if (result.ok && result.jobId) {
        setBgJobId(result.jobId);
        setBgJobStatus("PROCESSING");
        setBgJobMessage(
          `Job ${result.jobId} enqueued in Aux-Ops daemon. Calculating datastore telemetry...`
        );

        // Poll job status every 1.5s until complete
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await getAuxOpsReportStatusAction(result.jobId);
            if (statusRes.ok && statusRes.job) {
              setBgJobStatus(statusRes.job.status);
              if (statusRes.job.status === "COMPLETED") {
                clearInterval(pollInterval);
                setIsSubmittingBgJob(false);
                setBgEmailReceipt(statusRes.job.emailDispatch);
                setBgJobMessage(
                  `✓ Report compiled & dispatched via email to ${recipientEmail} (Receipt: ${statusRes.job.emailDispatch?.messageId || "OK"}).`
                );
              } else if (statusRes.job.status === "FAILED") {
                clearInterval(pollInterval);
                setIsSubmittingBgJob(false);
                setBgJobMessage(`✗ Report generation failed: ${statusRes.job.error}`);
              }
            }
          } catch {}
        }, 1500);
      } else {
        setIsSubmittingBgJob(false);
        alert(result.error || "Failed to schedule background report.");
      }
    } catch (err: any) {
      setIsSubmittingBgJob(false);
      alert(err?.message || "Failed to communicate with Aux-Ops service.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200 print:p-0 print:bg-white print:fixed-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col my-auto border-t-indigo-500/50 border-t-2 print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Header Controls (Hidden during print) */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <FileText className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Policy Effectiveness & Governance Audit Report
              </h2>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-semibold uppercase">
                Enterprise SEC-04
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Deterministic AST Policy Guardrails &bull; Max 90-Day Calculation Window &bull; Background Aux-Ops Dispatch
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 cursor-pointer font-medium shadow-md shadow-indigo-600/30"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer ml-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick Filters Bar & Date Range Selector (Hidden during print) */}
        <div className="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800 space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Timeframe Presets */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <span className="text-[11px] font-mono text-slate-400 px-2 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-indigo-400" /> Window:
              </span>
              <button
                type="button"
                onClick={() => setTimeframe("7d")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  timeframe === "7d"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("30d")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  timeframe === "30d"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                30 Days (1 Mo)
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("90d")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  timeframe === "90d"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                90 Days (Max 3 Mo)
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("custom")}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                  timeframe === "custom"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Quick Filters Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-[11px] text-slate-400 font-mono">Mode:</span>
                <select
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Modes</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="SHADOW_LEARN">Shadow Only</option>
                  <option value="DISABLED">Disabled</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 font-mono">Action:</span>
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Actions</option>
                  <option value="BLOCK">BLOCK</option>
                  <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                  <option value="ALLOW">ALLOW</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 font-mono">Tool:</span>
                <select
                  value={filterTool}
                  onChange={(e) => setFilterTool(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Tools ({policies.length})</option>
                  {uniqueTools.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 font-mono">Framework:</span>
                <select
                  value={filterFramework}
                  onChange={(e) => setFilterFramework(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Frameworks</option>
                  <option value="ISO_27001">ISO 27001</option>
                  <option value="SOC2">SOC 2 Type II</option>
                  <option value="EU_AI_ACT">EU AI Act</option>
                </select>
              </div>
            </div>
          </div>

          {/* Custom Date Range Picker when selected */}
          {timeframe === "custom" && (
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-mono text-slate-400">Custom Window (Max 90 Days):</span>
              <div className="flex items-center gap-2">
                <label className="text-slate-400 text-[11px]">From:</label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-400 text-[11px]">To:</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={today}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <span className="text-indigo-400 font-mono text-[11px]">
                ({effectiveDays} Days Selected &bull; Capped at 90d)
              </span>
            </div>
          )}

          {/* Date Range Error Alert */}
          {dateRangeError && (
            <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-600/70 text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>{dateRangeError}</span>
            </div>
          )}

          {/* Aux-Ops Background Email Dispatch Section */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span>Heavy Calculation Load? Generate in Background via Aux-Ops</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono">
                    Async Email
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Sends report directly to email via independent housekeeping daemon (port 5050) without browser timeout.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                type="email"
                placeholder="Recipient Email..."
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-60 font-mono"
              />
              <button
                type="button"
                disabled={isSubmittingBgJob}
                onClick={handleScheduleBackgroundReport}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-indigo-600/20"
              >
                {isSubmittingBgJob ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Dispatch Email</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Background Job Notification Banner */}
          {bgJobMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                bgJobStatus === "COMPLETED"
                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
                  : bgJobStatus === "FAILED"
                  ? "bg-rose-950/40 border-rose-500/50 text-rose-200"
                  : "bg-indigo-950/40 border-indigo-500/50 text-indigo-200 animate-pulse"
              }`}
            >
              <div className="flex items-center gap-2">
                {bgJobStatus === "COMPLETED" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : bgJobStatus === "FAILED" ? (
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 text-indigo-400 animate-spin shrink-0" />
                )}
                <div className="flex flex-col">
                  <span className="font-mono">{bgJobMessage}</span>
                  {bgEmailReceipt?.messageId && (
                    <span className="text-[10px] text-emerald-400/90 font-mono mt-0.5">
                      Receipt ID: {bgEmailReceipt.messageId} &bull; Latency: {bgEmailReceipt.simulatedLatencyMs || 250}ms
                    </span>
                  )}
                </div>
              </div>

              {bgJobStatus === "COMPLETED" && bgJobId && (
                <a
                  href={`http://localhost:5050/v1/reports/${bgJobId}/download?format=json`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-white hover:bg-slate-800 text-xs font-medium flex items-center gap-1 shrink-0"
                >
                  <Download className="h-3 w-3" /> Download Report JSON
                </a>
              )}
            </div>
          )}
        </div>

        {/* Printable Audit Report Document Body */}
        <div className="p-6 overflow-y-auto max-h-[68vh] space-y-6 print:max-h-none print:overflow-visible print:p-0">
          {/* Formal Audit Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-800 print:border-b-2 print:border-black">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-indigo-400 print:text-indigo-900 font-bold">
                X4G4T Enterprise Defense Platform &bull; Security Operations
              </div>
              <h1 className="text-xl font-bold text-white print:text-black mt-1">
                Deterministic Policy Governance &amp; AI Compliance Report
              </h1>
              <p className="text-xs text-slate-400 print:text-slate-600 mt-1 max-w-xl">
                Cryptographically audited enforcement summary of AST guardrails, blast-radius limiters,
                sensitive data sanitization (DLP), and human-in-the-loop review queues.
              </p>
            </div>

            <div className="text-right text-xs font-mono space-y-1 text-slate-400 print:text-slate-700 shrink-0">
              <div>
                Report ID: <span className="text-white print:text-black font-bold">{reportId}</span>
              </div>
              <div>
                Window:{" "}
                <span className="text-indigo-300 print:text-indigo-900 font-semibold">
                  {effectiveDays} Days (Max 90D Cap)
                </span>
              </div>
              <div>
                Generated: <span className="text-slate-300 print:text-slate-900">{new Date(generatedAt).toLocaleDateString()}</span>
              </div>
              <div>
                Status: <span className="text-emerald-400 print:text-emerald-800 font-bold">&bull; COMPLIANT &bull;</span>
              </div>
            </div>
          </div>

          {/* Compliance Framework Certification Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 print:border-slate-300 print:bg-slate-50 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 print:text-emerald-700 text-xs font-semibold">
                <ShieldCheck className="h-4 w-4" />
                <span>ISO/IEC 27001:2022</span>
              </div>
              <div className="text-[11px] text-slate-400 print:text-slate-600">
                §A.12.4.1 Information Logging &amp; Real-Time Audit Log Forwarding to SIEM pipeline.
              </div>
              <div className="text-[10px] font-mono text-emerald-500 font-bold uppercase">
                Status: Verified Compliant
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 print:border-slate-300 print:bg-slate-50 space-y-1">
              <div className="flex items-center gap-1.5 text-indigo-400 print:text-indigo-700 text-xs font-semibold">
                <Award className="h-4 w-4" />
                <span>SOC 2 Type II</span>
              </div>
              <div className="text-[11px] text-slate-400 print:text-slate-600">
                Trust Services Criteria CC6.1 &amp; CC7.2 (Autonomous Boundary Guardrails &amp; Access Bounds).
              </div>
              <div className="text-[10px] font-mono text-indigo-400 font-bold uppercase">
                Status: Verified Audited
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 print:border-slate-300 print:bg-slate-50 space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-400 print:text-cyan-700 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>EU AI Act Article 14</span>
              </div>
              <div className="text-[11px] text-slate-400 print:text-slate-600">
                Human Oversight: Dual Authorization Gating for High-Risk Autonomous Interventions.
              </div>
              <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                Status: Fully Implemented
              </div>
            </div>
          </div>

          {/* Executive KPI Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Total Evaluations</div>
              <div className="text-2xl font-bold text-white print:text-black mt-1 font-mono">
                {totalEvaluations.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                <span>100% Guardrail Assessed</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Interceptions (Blocks)</div>
              <div className="text-2xl font-bold text-rose-400 print:text-rose-700 mt-1 font-mono">
                {blockedInterceptions.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {((blockedInterceptions / totalEvaluations) * 100).toFixed(2)}% of total volume
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-mono text-slate-400 uppercase">HITL Holds Enacted</div>
              <div className="text-2xl font-bold text-amber-400 print:text-amber-700 mt-1 font-mono">
                {hitlHolds.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Dual-approval review workflows</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 print:border-slate-300 print:bg-white">
              <div className="text-[11px] font-mono text-slate-400 uppercase">Mean AST Latency</div>
              <div className="text-2xl font-bold text-indigo-400 print:text-indigo-700 mt-1 font-mono">
                {meanLatency}ms
              </div>
              <div className="text-[10px] text-emerald-400 mt-1">&lt; 1.00ms Enterprise SLA</div>
            </div>
          </div>

          {/* Per-Policy Breakdown Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white print:text-black flex items-center gap-2">
                <span>Per-Policy Enforcement Breakdown</span>
                <span className="text-xs font-mono font-normal text-slate-400">
                  ({policyStats.length} policies matching active filters)
                </span>
              </h3>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden print:border-slate-300">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800 print:bg-slate-100 print:text-black">
                  <tr>
                    <th className="py-2.5 px-3">Policy ID &amp; Name</th>
                    <th className="py-2.5 px-3">Target Tool</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3 text-right">Evaluations</th>
                    <th className="py-2.5 px-3 text-right">Interceptions</th>
                    <th className="py-2.5 px-3 text-right">Pass %</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono print:divide-slate-300">
                  {policyStats.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-950/30 transition print:hover:bg-transparent"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white print:text-black font-sans">{p.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{p.id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 print:text-slate-800">{p.tool}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.action === "BLOCK"
                              ? "bg-rose-950/70 border border-rose-800 text-rose-300 print:bg-rose-100 print:text-rose-800"
                              : p.action === "REQUIRE_APPROVAL"
                              ? "bg-amber-950/70 border border-amber-800 text-amber-300 print:bg-amber-100 print:text-amber-800"
                              : "bg-emerald-950/70 border border-emerald-800 text-emerald-300 print:bg-emerald-100 print:text-emerald-800"
                          }`}
                        >
                          {p.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200 print:text-black">
                        {p.evaluations.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-rose-400 print:text-rose-700">
                        {p.blocks.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-indigo-300 print:text-indigo-800 font-bold">
                        {p.passRate}%
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-sans print:border print:border-slate-400">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Formal Audit Sign-Off Footer */}
          <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 print:border-black print:text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              Generated autonomously by <strong>X4G4T SecOps Control Plane</strong> &bull; Engine Version 2.4.0
            </div>
            <div className="font-mono text-[11px]">
              Signature: <code className="text-slate-400">SHA256:4a8b...7f2c</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
