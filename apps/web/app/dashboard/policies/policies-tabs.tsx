"use client";

import { useState } from "react";
import { BookOpen, Layers, Edit2, X, Check, Terminal } from "lucide-react";
import { PolicyFormWithTemplates } from "./policy-form-with-templates";
import { PolicyLibraryTab } from "./policy-library-tab";
import { GatewayIntegrationTab } from "./gateway-integration-tab";
import { togglePolicyAction, updatePolicyAction } from "@/app/actions";
import type { PredefinedPolicy } from "@x4g4t/policy-engine";

export interface PolicyItem {
  id: string;
  name: string;
  targetTool: string;
  actionOnMatch: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
  isActive: string;
  ruleField: string | null;
  ruleOperator: string | null;
  ruleTarget: string | null;
}

interface PoliciesTabsProps {
  policyList: PolicyItem[];
  library: PredefinedPolicy[];
  isPolicyFrozen?: boolean;
  freezeReason?: string;
}

export function PoliciesTabs({
  policyList,
  library,
  isPolicyFrozen = false,
  freezeReason = "Maintenance window"
}: PoliciesTabsProps) {
  const [activeTab, setActiveTab] = useState<"active" | "library" | "integration">("active");
  const [editingPolicy, setEditingPolicy] = useState<PolicyItem | null>(null);

  return (
    <div className="space-y-6">
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
              {policyList.length}
            </span>
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

          {/* Configured Policy Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Active Guardrail Rules</span>
              <span className="font-mono text-[11px] text-slate-500">{policyList.length} configured</span>
            </div>

            <div className="divide-y divide-slate-800">
              {policyList.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No active guardrails defined. Configure your first policy rule above or deploy pre-built policies from the{" "}
                  <button
                    onClick={() => setActiveTab("library")}
                    className="text-indigo-400 hover:underline cursor-pointer"
                  >
                    Policy Library
                  </button>
                  .
                </div>
              ) : (
                policyList.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
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
                      </div>

                      <div className="text-xs text-slate-400 font-mono">
                        IF <span className="text-slate-200">{p.ruleField || "*"}</span>{" "}
                        <span className="text-indigo-400">{p.ruleOperator || "EQUALS"}</span>{" "}
                        <span className="text-amber-300">{p.ruleTarget || "true"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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

                      <form action={togglePolicyAction.bind(null, p.id, p.isActive)}>
                        <button
                          type="submit"
                          disabled={isPolicyFrozen}
                          className={`text-xs px-2.5 py-1 rounded font-medium border transition ${
                            isPolicyFrozen
                              ? "border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed"
                              : p.isActive === "true"
                              ? "border-emerald-700 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40 cursor-pointer"
                              : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 cursor-pointer"
                          }`}
                        >
                          {p.isActive === "true" ? "Enabled" : "Disabled"}
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
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

              <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}
