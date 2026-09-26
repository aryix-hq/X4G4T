"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Layers,
  Edit2,
  X,
  Check,
  Terminal,
  Eye,
  ShieldCheck,
  Sparkles,
  Search,
  BarChart3,
  FileText,
  Filter,
  ShieldAlert,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Radio
} from "lucide-react";
import { PolicyFormWithTemplates } from "./policy-form-with-templates";
import { PolicyLibraryTab } from "./policy-library-tab";
import { GatewayIntegrationTab } from "./gateway-integration-tab";
import { AdvancedPolicyCreator } from "./advanced-policy-creator";
import { LearningModeAnalytics } from "./learning-mode-analytics";
import { PolicyVisualizationModal } from "./policy-visualization-modal";
import { PolicyReportModal } from "./policy-report-modal";
import { updatePolicyAction, updatePolicyModeAction } from "@/app/actions";
import type { PredefinedPolicy } from "@x4g4t/policy-engine";

export interface PolicyItem {
  id: string;
  name: string;
  targetTool: string;
  actionOnMatch: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
  mode?: "ACTIVE" | "SHADOW_LEARN" | "DISABLED";
  isActive: string;
  ruleField: string | null;
  ruleOperator: string | null;
  ruleTarget: string | null;
  matchLogic?: string | null;
}

interface PoliciesTabsProps {
  policyList: PolicyItem[];
  library: PredefinedPolicy[];
  isPolicyFrozen?: boolean;
  freezeReason?: string;
  isLockdownActive?: boolean;
  lockdownReason?: string;
}

export function PoliciesTabs({
  policyList,
  library,
  isPolicyFrozen = false,
  freezeReason = "Maintenance window",
  isLockdownActive = false,
  lockdownReason = "Emergency air-gap kill switch engaged"
}: PoliciesTabsProps) {
  const [activeTab, setActiveTab] = useState<"active" | "advanced" | "learning" | "library" | "integration">("active");
  const [editingPolicy, setEditingPolicy] = useState<PolicyItem | null>(null);
  const [policiesList, setPoliciesList] = useState<PolicyItem[]>(policyList);
  const [isUpdatingMode, setIsUpdatingMode] = useState<string | null>(null);

  // Search & Visualization & Reporting & Pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [visualizingPolicy, setVisualizingPolicy] = useState<PolicyItem | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const shadowPoliciesCount = policiesList.filter((p) => p.mode === "SHADOW_LEARN").length;
  const activePoliciesCount = policiesList.filter((p) => p.mode === "ACTIVE").length;
  const disabledPoliciesCount = policiesList.filter((p) => p.mode === "DISABLED").length;
  const blockPoliciesCount = policiesList.filter((p) => p.actionOnMatch === "BLOCK").length;
  const heldPoliciesCount = policiesList.filter((p) => p.actionOnMatch === "REQUIRE_APPROVAL").length;
  const allowPoliciesCount = policiesList.filter((p) => p.actionOnMatch === "ALLOW").length;

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleFilterCategoryChange = (cat: string) => {
    setFilterCategory(cat);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const filteredPolicies = useMemo(() => {
    return policiesList.filter((p) => {
      if (filterCategory !== "ALL") {
        if (filterCategory === "ACTIVE" && p.mode !== "ACTIVE") return false;
        if (filterCategory === "SHADOW_LEARN" && p.mode !== "SHADOW_LEARN") return false;
        if (filterCategory === "DISABLED" && p.mode !== "DISABLED") return false;
        if (filterCategory === "BLOCK" && p.actionOnMatch !== "BLOCK") return false;
        if (filterCategory === "REQUIRE_APPROVAL" && p.actionOnMatch !== "REQUIRE_APPROVAL") return false;
        if (filterCategory === "ALLOW" && p.actionOnMatch !== "ALLOW") return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const name = (p.name || "").toLowerCase();
        const tool = (p.targetTool || "").toLowerCase();
        const field = (p.ruleField || "").toLowerCase();
        const op = (p.ruleOperator || "").toLowerCase();
        const target = (p.ruleTarget || "").toLowerCase();
        const id = (p.id || "").toLowerCase();
        return (
          name.includes(q) ||
          tool.includes(q) ||
          field.includes(q) ||
          op.includes(q) ||
          target.includes(q) ||
          id.includes(q)
        );
      }
      return true;
    });
  }, [policiesList, filterCategory, searchQuery]);

  // Derived pagination metrics
  const totalPages = Math.max(1, Math.ceil(filteredPolicies.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredPolicies.length);
  const paginatedPolicies = useMemo(() => {
    return filteredPolicies.slice(startIndex, endIndex);
  }, [filteredPolicies, startIndex, endIndex]);

  const handleModeChange = async (policyId: string, newMode: "ACTIVE" | "SHADOW_LEARN" | "DISABLED") => {
    setIsUpdatingMode(policyId);
    try {
      await updatePolicyModeAction(policyId, newMode);
      setPoliciesList((prev) =>
        prev.map((p) =>
          p.id === policyId
            ? { ...p, mode: newMode, isActive: newMode === "DISABLED" ? "false" : "true" }
            : p
        )
      );
    } catch (err: any) {
      alert(err?.message || "Failed to update policy mode.");
    } finally {
      setIsUpdatingMode(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Air-Gap Severed Banner */}
      {isLockdownActive && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-600 flex items-center justify-between text-xs text-rose-200 shadow-lg animate-pulse">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded bg-rose-900 border border-rose-700 text-rose-300 font-mono font-bold flex items-center gap-1">
              <ShieldAlert className="h-4 w-4" /> AIR-GAP SEVERED
            </span>
            <span>
              <strong>EMERGENCY LOCKDOWN ENGAGED:</strong> All autonomous AI agent tool executions and inference streams are blocked at the gateway. Reason: <span className="font-semibold text-white">&quot;{lockdownReason}&quot;</span>
            </span>
          </div>
        </div>
      )}

      {/* Policy Freeze Banner */}
      {isPolicyFrozen && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/60 flex items-center justify-between text-xs text-amber-200 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-900/60 border border-amber-700 text-amber-300 font-mono font-bold">
              POLICY FREEZE ACTIVE
            </span>
            <span>
              All policy authoring, updates, and library deployments are locked to prevent configuration drift. Reason: <span className="font-semibold text-white">"{freezeReason}"</span>
            </span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === "active"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Layers className="h-4 w-4" />
            Active Guardrails
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              {policiesList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("advanced")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === "advanced"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            Advanced Rule Creator (AND / OR)
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Multi-Field
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("learning")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === "learning"
                ? "bg-purple-600/20 text-purple-300 border border-purple-500/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Eye className="h-4 w-4 text-purple-400" />
            Learning Mode (Shadow) Analytics
            {shadowPoliciesCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-mono font-bold animate-pulse">
                {shadowPoliciesCount} Active
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === "library"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Predefined Policy Library
            <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono">
              {library.length} Pre-built
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("integration")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === "integration"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Terminal className="h-4 w-4" />
            Gateway Integration (Agent Connect)
          </button>
        </div>
      </div>

      {activeTab === "active" ? (
        <div className="space-y-8">
          {/* New Policy Form with Quick Templates */}
          <PolicyFormWithTemplates isPolicyFrozen={isPolicyFrozen} />

          {/* Configured Policy Table with Search & Filtering */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-0">
            {/* Search, Filter & Report Action Bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search policies by name, tool, field, operator, target..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange("")}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Generate Report Trigger Button */}
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-600/20 shrink-0"
              >
                <FileText className="h-3.5 w-3.5" />
                Generate Policy Report
              </button>
            </div>

            {/* Filter Chips Bar */}
            <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mr-1">
                <Filter className="h-3 w-3" /> Filters:
              </span>

              {[
                { key: "ALL", label: "All", count: policiesList.length },
                { key: "ACTIVE", label: "Active", count: activePoliciesCount },
                { key: "SHADOW_LEARN", label: "Shadow", count: shadowPoliciesCount },
                { key: "DISABLED", label: "Disabled", count: disabledPoliciesCount },
                { key: "BLOCK", label: "Block", count: blockPoliciesCount },
                { key: "REQUIRE_APPROVAL", label: "Approval", count: heldPoliciesCount },
                { key: "ALLOW", label: "Allow", count: allowPoliciesCount }
              ].map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => handleFilterCategoryChange(chip.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    filterCategory === chip.key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded ${
                      filterCategory === chip.key ? "bg-indigo-700 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              ))}

              <div className="ml-auto text-[11px] font-mono text-slate-500">
                Showing {filteredPolicies.length > 0 ? startIndex + 1 : 0} - {endIndex} of {filteredPolicies.length} guardrails
              </div>
            </div>

            {/* Configured Policy List */}
            <div className="divide-y divide-slate-800">
              {filteredPolicies.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No guardrails match your search query &quot;{searchQuery}&quot; or selected filter.
                </div>
              ) : (
                paginatedPolicies.map((p) => {
                  const effectiveMode = p.mode || (p.isActive === "true" ? "ACTIVE" : "DISABLED");
                  const isChangingThis = isUpdatingMode === p.id;

                  return (
                    <div
                      key={p.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-800/30 transition"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-white">{p.name}</span>
                          <span className="text-xs font-mono bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-indigo-300">
                            Tool: {p.targetTool}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              p.actionOnMatch === "BLOCK"
                                ? "bg-rose-950/60 border border-rose-800 text-rose-300"
                                : p.actionOnMatch === "REQUIRE_APPROVAL"
                                ? "bg-amber-950/60 border border-amber-800 text-amber-300"
                                : "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                            }`}
                          >
                            {p.actionOnMatch}
                          </span>

                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 font-bold" title="Combinator evaluation logic">
                            {p.matchLogic || "AND"}
                          </span>

                          {/* Mode Posture Badge */}
                          {effectiveMode === "SHADOW_LEARN" ? (
                            <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-purple-950/80 border border-purple-800 text-purple-300 flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              SHADOW LEARN
                            </span>
                          ) : effectiveMode === "ACTIVE" ? (
                            <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-300 flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              ACTIVE
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-slate-800 border border-slate-700 text-slate-400">
                              DISABLED
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 font-mono">
                          IF <span className="text-slate-200">{p.ruleField || "*"}</span>{" "}
                          <span className="text-indigo-400">{p.ruleOperator || "EQUALS"}</span>{" "}
                          <span className="text-amber-300">{p.ruleTarget || "true"}</span>
                        </div>

                        {effectiveMode === "SHADOW_LEARN" && (
                          <div className="text-[11px] text-purple-300/80 font-mono flex items-center gap-2 pt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-bold">
                              COUNTERFACTUAL EVALUATION
                            </span>
                            <span>Evaluating live requests non-blocking • False-positive metrics active</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Visualize Modal Trigger */}
                        <button
                          type="button"
                          onClick={() => setVisualizingPolicy(p)}
                          title="View telemetry distribution & SLA"
                          className="text-xs px-2.5 py-1 rounded font-medium border border-indigo-700/80 bg-indigo-950/60 text-indigo-300 hover:text-white hover:border-indigo-500 transition flex items-center gap-1 cursor-pointer"
                        >
                          <BarChart3 className="h-3 w-3 text-indigo-400" />
                          Visualize
                        </button>

                        {/* In-App Analytics Log Search (Primary) */}
                        <Link
                          href={`/dashboard/logs?query=${encodeURIComponent(`triggered_policy_id:"${p.id}" OR policy_name:"${p.name}"`)}`}
                          title="Open in Analytics Logs with pre-populated query"
                          className="text-xs px-2.5 py-1 rounded font-medium border border-indigo-900/60 bg-slate-900/90 text-indigo-300 hover:text-white hover:border-indigo-600 hover:bg-indigo-950/60 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Radio className="h-3 w-3 text-indigo-400" />
                          Analytics Trail
                        </Link>

                        {/* Direct Graylog 6.0 Console Deep-Link (Optional icon) */}
                        <a
                          href={`http://localhost:9000/search?q=${encodeURIComponent(`triggered_policy_id:"${p.id}" OR policy_name:"${p.name}"`)}&rangetype=relative&relative=86400`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open query in external Graylog 6.0 Console (Port 9000)"
                          className="text-xs p-1.5 rounded font-medium border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-indigo-300 hover:border-indigo-700 hover:bg-slate-800 transition flex items-center cursor-pointer"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>

                        {/* 3-way Mode Segmented Control */}
                        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                          <button
                            type="button"
                            disabled={isPolicyFrozen || isChangingThis}
                            onClick={() => handleModeChange(p.id, "ACTIVE")}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                              effectiveMode === "ACTIVE"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            Active
                          </button>
                          <button
                            type="button"
                            disabled={isPolicyFrozen || isChangingThis}
                            onClick={() => handleModeChange(p.id, "SHADOW_LEARN")}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                              effectiveMode === "SHADOW_LEARN"
                                ? "bg-purple-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-purple-300"
                            }`}
                          >
                            <Eye className="h-2.5 w-2.5" />
                            Shadow
                          </button>
                          <button
                            type="button"
                            disabled={isPolicyFrozen || isChangingThis}
                            onClick={() => handleModeChange(p.id, "DISABLED")}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                              effectiveMode === "DISABLED"
                                ? "bg-slate-700 text-slate-300"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            Off
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isPolicyFrozen}
                          onClick={() => setEditingPolicy(p)}
                          className={`text-xs px-2.5 py-1 rounded font-medium border transition flex items-center gap-1 ${
                            isPolicyFrozen
                              ? "border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed"
                              : "border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:border-slate-600 cursor-pointer"
                          }`}
                        >
                          <Edit2 className="h-3 w-3 text-indigo-400" />
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls Footer */}
            {filteredPolicies.length > 0 && (
              <div className="p-3.5 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-400 font-mono">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono cursor-pointer"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>per page</span>
                  <span className="text-slate-600">|</span>
                  <span>
                    Showing <strong className="text-slate-200">{filteredPolicies.length > 0 ? startIndex + 1 : 0}</strong> - <strong className="text-slate-200">{endIndex}</strong> of <strong className="text-white">{filteredPolicies.length}</strong> policies
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono">
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    title="First Page"
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    title="Previous Page"
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  {/* Page indicator & numeric buttons */}
                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => {
                        return p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1;
                      })
                      .reduce<Array<number | string>>((acc, p, idx, arr) => {
                        if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
                          acc.push("...");
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) =>
                        typeof item === "string" ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-slate-500">
                            ...
                          </span>
                        ) : (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setCurrentPage(item)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                              safeCurrentPage === item
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800"
                            }`}
                          >
                            {item}
                          </button>
                        )
                      )}
                  </div>

                  <button
                    type="button"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    title="Next Page"
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    title="Last Page"
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "advanced" ? (
        <AdvancedPolicyCreator
          isPolicyFrozen={isPolicyFrozen}
          onSuccess={() => setActiveTab("active")}
        />
      ) : activeTab === "learning" ? (
        <LearningModeAnalytics
          policies={policiesList}
          isPolicyFrozen={isPolicyFrozen}
        />
      ) : activeTab === "library" ? (
        <PolicyLibraryTab library={library} isPolicyFrozen={isPolicyFrozen} />
      ) : (
        <GatewayIntegrationTab />
      )}

      {/* Edit Active Policy Modal */}
      {editingPolicy && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Edit Active Policy</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPolicy(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await updatePolicyAction(editingPolicy.id, formData);
                const updatedMode = (formData.get("mode") as any) || "ACTIVE";
                setPoliciesList((prev) =>
                  prev.map((p) =>
                    p.id === editingPolicy.id
                      ? {
                          ...p,
                          name: String(formData.get("name")),
                          targetTool: String(formData.get("targetTool")),
                          actionOnMatch: formData.get("actionOnMatch") as any,
                          mode: updatedMode,
                          isActive: updatedMode === "DISABLED" ? "false" : "true",
                          ruleField: String(formData.get("fieldPath")),
                          ruleOperator: String(formData.get("operator")),
                          ruleTarget: String(formData.get("targetValue"))
                        }
                      : p
                  )
                );
                setEditingPolicy(null);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="text-slate-400 font-medium">Policy Name</label>
                <input
                  name="name"
                  required
                  defaultValue={editingPolicy.name}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Target Tool (* for all)</label>
                  <input
                    name="targetTool"
                    required
                    defaultValue={editingPolicy.targetTool}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Action On Match</label>
                  <select
                    name="actionOnMatch"
                    defaultValue={editingPolicy.actionOnMatch}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="BLOCK">BLOCK</option>
                    <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                    <option value="ALLOW">ALLOW</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Deployment Mode</label>
                  <select
                    name="mode"
                    defaultValue={editingPolicy.mode || (editingPolicy.isActive === "true" ? "ACTIVE" : "DISABLED")}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ACTIVE">ACTIVE (Enforcing)</option>
                    <option value="SHADOW_LEARN">SHADOW_LEARN (Test)</option>
                    <option value="DISABLED">DISABLED (Off)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Field Dot-Path</label>
                  <input
                    name="fieldPath"
                    required
                    defaultValue={editingPolicy.ruleField || ""}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Operator</label>
                  <select
                    name="operator"
                    defaultValue={editingPolicy.ruleOperator || "EQUALS"}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="GREATER_THAN">GREATER_THAN (&gt;)</option>
                    <option value="LESS_THAN">LESS_THAN (&lt;)</option>
                    <option value="GREATER_THAN_OR_EQUAL">GREATER_THAN_OR_EQUAL (&gt;=)</option>
                    <option value="LESS_THAN_OR_EQUAL">LESS_THAN_OR_EQUAL (&lt;=)</option>
                    <option value="EQUALS">EQUALS (==)</option>
                    <option value="NOT_EQUALS">NOT_EQUALS (!=)</option>
                    <option value="CONTAINS">CONTAINS</option>
                    <option value="REGEX">REGEX Match</option>
                    <option value="IN">IN (Comma separated)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Target Value</label>
                  <input
                    name="targetValue"
                    required
                    defaultValue={editingPolicy.ruleTarget || ""}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPolicy(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy Telemetry & Visualization Modal */}
      <PolicyVisualizationModal
        policy={visualizingPolicy}
        onClose={() => setVisualizingPolicy(null)}
      />

      {/* Policy Governance & Effectiveness Audit Report Modal */}
      {showReportModal && (
        <PolicyReportModal
          policies={policiesList}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
