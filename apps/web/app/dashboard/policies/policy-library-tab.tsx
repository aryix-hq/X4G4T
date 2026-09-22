"use client";

import { useState, useTransition } from "react";
import type {
  PredefinedPolicy,
  PolicyCategory
} from "@x4g4t/policy-engine";
import { deployLibraryPolicyAction, createPolicyAction } from "@/app/actions";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Edit3,
  X
} from "lucide-react";

const CATEGORIES: Array<"All" | PolicyCategory> = [
  "All",
  "AI Providers",
  "Fintech",
  "Security",
  "DevOps",
  "CRM",
  "Healthcare",
  "Cybersecurity",
  "HR"
];

interface PolicyLibraryTabProps {
  library: PredefinedPolicy[];
  isPolicyFrozen?: boolean;
}

export function PolicyLibraryTab({ library, isPolicyFrozen = false }: PolicyLibraryTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<"All" | PolicyCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});
  const [deployedIds, setDeployedIds] = useState<Record<string, boolean>>({});
  const [customizingPolicy, setCustomizingPolicy] = useState<PredefinedPolicy | null>(null);
  const [isPending, startTransition] = useTransition();

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeploy = (policy: PredefinedPolicy) => {
    startTransition(async () => {
      try {
        await deployLibraryPolicyAction(policy.id);
        setDeployedIds((prev) => ({ ...prev, [policy.id]: true }));
      } catch (err) {
        console.error("Failed to deploy policy:", err);
      }
    });
  };

  const filteredPolicies = library.filter((p) => {
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.useCase.toLowerCase().includes(q) ||
      p.threatModel.toLowerCase().includes(q) ||
      p.targetTool.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Search & Category Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search predefined policies by tool, threat model, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? "bg-indigo-600 border-indigo-500 text-white font-medium shadow-sm"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Policy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPolicies.map((policy) => {
          const isDeployed = deployedIds[policy.id];
          const isPayloadOpen = expandedPayloads[policy.id];

          return (
            <div
              key={policy.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
            >
              <div className="space-y-3">
                {/* Badges */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    {policy.category}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded font-semibold border ${
                      policy.actionOnMatch === "BLOCK"
                        ? "bg-rose-950/60 border-rose-800 text-rose-300"
                        : "bg-amber-950/60 border-amber-800 text-amber-300"
                    }`}
                  >
                    {policy.actionOnMatch}
                  </span>
                </div>

                {/* Title & Target */}
                <div>
                  <h3 className="text-base font-semibold text-white">{policy.name}</h3>
                  <div className="text-xs font-mono text-indigo-400 mt-0.5">
                    Target Tool: <span className="text-slate-200">{policy.targetTool}</span>
                  </div>
                </div>

                {/* Description & Threat Model */}
                <p className="text-xs text-slate-300 leading-relaxed">{policy.useCase}</p>
                <div className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-400" />
                    Threat Mitigated:
                  </div>
                  <div className="text-slate-300">{policy.threatModel}</div>
                </div>

                {/* AST Rule Constraint */}
                <div className="text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-400">
                  IF <span className="text-slate-200">{policy.rule.fieldPath}</span>{" "}
                  <span className="text-indigo-400">{policy.rule.operator}</span>{" "}
                  <span className="text-amber-300">{policy.rule.targetValue}</span>
                </div>

                {/* Sample Payload Accordion */}
                <div>
                  <button
                    type="button"
                    onClick={() => togglePayload(policy.id)}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono transition cursor-pointer"
                  >
                    {isPayloadOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {isPayloadOpen ? "Hide Test Payload" : "View Sample Test Payload"}
                  </button>
                  {isPayloadOpen && (
                    <pre className="mt-2 text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-300 overflow-x-auto">
                      {JSON.stringify(policy.samplePayload, null, 2)}
                    </pre>
                  )}
                </div>
              </div>

              {/* Action Buttons: Customize vs Quick Deploy */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isPolicyFrozen}
                  onClick={() => setCustomizingPolicy(policy)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    isPolicyFrozen
                      ? "border-slate-800 bg-slate-900 text-slate-500 cursor-not-allowed"
                      : "border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:border-slate-600 cursor-pointer"
                  }`}
                >
                  <Edit3 className="h-3.5 w-3.5 text-indigo-400" />
                  Customize & Deploy
                </button>

                <button
                  type="button"
                  disabled={isPending || isDeployed || isPolicyFrozen}
                  onClick={() => handleDeploy(policy)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    isPolicyFrozen
                      ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                      : isDeployed
                      ? "bg-emerald-950 border border-emerald-800 text-emerald-300 cursor-default"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                  }`}
                >
                  {isPolicyFrozen ? (
                    "Deploy Locked"
                  ) : isDeployed ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      Policy Deployed
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      1-Click Deploy
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPolicies.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          No predefined policies found matching your search criteria.
        </div>
      )}

      {/* Customize & Deploy Modal */}
      {customizingPolicy && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Customize & Deploy Policy</h3>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingPolicy(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              action={async (formData) => {
                await createPolicyAction(formData);
                setDeployedIds((prev) => ({ ...prev, [customizingPolicy.id]: true }));
                setCustomizingPolicy(null);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="text-slate-400 font-medium">Policy Name</label>
                <input
                  name="name"
                  required
                  defaultValue={customizingPolicy.name}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Target Tool (* for all)</label>
                  <input
                    name="targetTool"
                    required
                    defaultValue={customizingPolicy.targetTool}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Action On Match</label>
                  <select
                    name="actionOnMatch"
                    defaultValue={customizingPolicy.actionOnMatch}
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
                    defaultValue={customizingPolicy.rule.fieldPath}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Operator</label>
                  <select
                    name="operator"
                    defaultValue={customizingPolicy.rule.operator}
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
                    defaultValue={customizingPolicy.rule.targetValue}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomizingPolicy(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Deploy Customized Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
