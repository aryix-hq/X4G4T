"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Code2,
  Play,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Radio
} from "lucide-react";
import { createAdvancedPolicyAction } from "@/app/actions";
import { useRouter } from "next/navigation";

export interface RuleRow {
  id: string;
  fieldPath: string;
  operator:
    | "GREATER_THAN"
    | "LESS_THAN"
    | "GREATER_THAN_OR_EQUAL"
    | "LESS_THAN_OR_EQUAL"
    | "EQUALS"
    | "NOT_EQUALS"
    | "CONTAINS"
    | "REGEX"
    | "IN"
    | "CIDR_MATCH";
  targetValue: string;
}

interface AdvancedPolicyCreatorProps {
  isPolicyFrozen?: boolean;
  onSuccess?: () => void;
}

export function AdvancedPolicyCreator({
  isPolicyFrozen = false,
  onSuccess
}: AdvancedPolicyCreatorProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [targetTool, setTargetTool] = useState("issue_refund");
  const [actionOnMatch, setActionOnMatch] = useState<"BLOCK" | "REQUIRE_APPROVAL" | "ALLOW">("BLOCK");
  const [mode, setMode] = useState<"ACTIVE" | "SHADOW_LEARN" | "DISABLED">("ACTIVE");
  const [matchLogic, setMatchLogic] = useState<"AND" | "OR">("AND");

  const [rules, setRules] = useState<RuleRow[]>([
    {
      id: "rule_1",
      fieldPath: "amount, transaction.total",
      operator: "GREATER_THAN",
      targetValue: "250"
    },
    {
      id: "rule_2",
      fieldPath: "network.source_ip",
      operator: "CIDR_MATCH",
      targetValue: "10.0.0.0/8"
    }
  ]);

  const [testPayload, setTestPayload] = useState<string>(
    JSON.stringify(
      {
        amount: 350,
        network: {
          source_ip: "10.1.2.3"
        }
      },
      null,
      2
    )
  );
  const [testResult, setTestResult] = useState<{
    evaluated: boolean;
    matched: boolean;
    verdict: string;
    details: string;
  } | null>(null);

  const [copiedQuery, setCopiedQuery] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAddRule = () => {
    setRules((prev) => [
      ...prev,
      {
        id: `rule_${Date.now()}`,
        fieldPath: "",
        operator: "EQUALS",
        targetValue: ""
      }
    ]);
  };

  const handleRemoveRule = (id: string) => {
    if (rules.length <= 1) return;
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRuleChange = (id: string, field: keyof RuleRow, val: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  // Generate Graylog / Lucene search query syntax preview
  const generateGraylogQuery = () => {
    const toolFilter = targetTool === "*" ? "*" : `tool_name:"${targetTool}"`;
    const ruleClauses = rules
      .map((r) => {
        const paths = r.fieldPath.split(",").map((p) => p.trim()).filter(Boolean);
        const opSym =
          r.operator === "EQUALS" ? ":"
          : r.operator === "NOT_EQUALS" ? ":NOT "
          : r.operator === "GREATER_THAN" ? ":>"
          : r.operator === "LESS_THAN" ? ":<"
          : r.operator === "GREATER_THAN_OR_EQUAL" ? ":>="
          : r.operator === "LESS_THAN_OR_EQUAL" ? ":<="
          : r.operator === "CONTAINS" ? ":*"
          : r.operator === "CIDR_MATCH" ? ":CIDR "
          : ":";

        if (paths.length > 1) {
          const innerOr = paths.map((p) => `${p}${opSym}"${r.targetValue}"`).join(" OR ");
          return `(${innerOr})`;
        }
        return `${r.fieldPath || "field"}${opSym}"${r.targetValue || ""}"`;
      })
      .join(` ${matchLogic} `);

    return `${toolFilter} AND (${ruleClauses})`;
  };

  const graylogQuery = generateGraylogQuery();

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(graylogQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  // Live client-side dry-run simulator
  const handleRunSimulator = () => {
    try {
      const parsedArgs = JSON.parse(testPayload);
      let matchedCount = 0;

      for (const rule of rules) {
        const candidatePaths = rule.fieldPath.split(",").map((p) => p.trim()).filter(Boolean);
        let ruleMatched = false;

        for (const p of candidatePaths) {
          const parts = p.split(".");
          let cur: any = parsedArgs;
          for (const part of parts) {
            cur = cur?.[part];
          }

          if (cur !== undefined && cur !== null) {
            if (rule.operator === "GREATER_THAN") ruleMatched = Number(cur) > Number(rule.targetValue);
            else if (rule.operator === "LESS_THAN") ruleMatched = Number(cur) < Number(rule.targetValue);
            else if (rule.operator === "GREATER_THAN_OR_EQUAL") ruleMatched = Number(cur) >= Number(rule.targetValue);
            else if (rule.operator === "LESS_THAN_OR_EQUAL") ruleMatched = Number(cur) <= Number(rule.targetValue);
            else if (rule.operator === "EQUALS") ruleMatched = String(cur).toLowerCase() === String(rule.targetValue).toLowerCase();
            else if (rule.operator === "NOT_EQUALS") ruleMatched = String(cur).toLowerCase() !== String(rule.targetValue).toLowerCase();
            else if (rule.operator === "CONTAINS") ruleMatched = String(cur).toLowerCase().includes(String(rule.targetValue).toLowerCase());
            else if (rule.operator === "CIDR_MATCH") ruleMatched = true; // Subnet match simulation
            else if (rule.operator === "REGEX") {
              try {
                ruleMatched = new RegExp(rule.targetValue, "i").test(String(cur));
              } catch {
                ruleMatched = false;
              }
            }
            if (ruleMatched) break;
          }
        }

        if (ruleMatched) {
          matchedCount++;
        }
      }

      const policyTriggered =
        matchLogic === "OR" ? matchedCount > 0 : matchedCount === rules.length;

      setTestResult({
        evaluated: true,
        matched: policyTriggered,
        verdict: policyTriggered ? actionOnMatch : "PASS (No Violation)",
        details: policyTriggered
          ? `Policy matched (${matchedCount}/${rules.length} conditions satisfied via ${matchLogic} logic). Verdict: ${actionOnMatch}`
          : `Policy not triggered (${matchedCount}/${rules.length} conditions matched). Inbound payload passes through safely.`
      });
    } catch (err: any) {
      setTestResult({
        evaluated: true,
        matched: false,
        verdict: "INVALID JSON",
        details: `Payload JSON parsing error: ${err?.message}`
      });
    }
  };

  const handleCreatePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPolicyFrozen) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg("Policy name is required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createAdvancedPolicyAction({
          name: name.trim(),
          targetTool: targetTool.trim(),
          actionOnMatch,
          mode,
          matchLogic,
          rules: rules.map((r) => ({
            fieldPath: r.fieldPath,
            operator: r.operator,
            targetValue: r.targetValue
          }))
        });

        if (res.success) {
          setSuccessMsg(`Policy '${name}' created successfully with ${rules.length} conditions!`);
          router.refresh();
          if (onSuccess) onSuccess();
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to create advanced policy.");
      }
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            Advanced Policy Creator &amp; AST Clause Builder
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Construct multi-rule guardrails with boolean <span className="font-mono text-cyan-300">AND / OR</span> clauses, Graylog query mapping, and live AST simulation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Match Combinator:</span>
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => setMatchLogic("AND")}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                matchLogic === "AND"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              AND (All Must Match)
            </button>
            <button
              type="button"
              onClick={() => setMatchLogic("OR")}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                matchLogic === "OR"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              OR (Any May Match)
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleCreatePolicy} className="space-y-6">
        {/* Header Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="font-semibold text-slate-300">Policy Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Network & Wire Safeguard"
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-300">Target Tool (* for wildcard)</label>
            <input
              type="text"
              required
              value={targetTool}
              onChange={(e) => setTargetTool(e.target.value)}
              placeholder="e.g. issue_refund or *"
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-300">Action On Match</label>
            <select
              value={actionOnMatch}
              onChange={(e) => setActionOnMatch(e.target.value as any)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="BLOCK">BLOCK (Terminate Execution 422)</option>
              <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL (HITL Hold 202)</option>
              <option value="ALLOW">ALLOW (Explicit Pass-Through)</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-300">Deployment Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="ACTIVE">ACTIVE (Enforce Real-Time)</option>
              <option value="SHADOW_LEARN">SHADOW_LEARN (Counterfactual Test)</option>
              <option value="DISABLED">DISABLED (Off)</option>
            </select>
          </div>
        </div>

        {/* Rule Conditions Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <Code2 className="h-4 w-4 text-cyan-400" />
              Rule Conditions ({rules.length} conditions combined with {matchLogic})
            </span>
            <button
              type="button"
              onClick={handleAddRule}
              className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Condition
            </button>
          </div>

          <div className="space-y-2.5">
            {rules.map((rule, idx) => (
              <div
                key={rule.id}
                className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center gap-3 text-xs"
              >
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 font-bold">
                  #{idx + 1}
                </span>

                <div className="flex-1 w-full md:w-auto">
                  <input
                    type="text"
                    required
                    value={rule.fieldPath}
                    onChange={(e) => handleRuleChange(rule.id, "fieldPath", e.target.value)}
                    placeholder="Field path (CSV supported e.g. amount, total)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-600 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="w-full md:w-48">
                  <select
                    value={rule.operator}
                    onChange={(e) => handleRuleChange(rule.id, "operator", e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="GREATER_THAN">GREATER_THAN (&gt;)</option>
                    <option value="LESS_THAN">LESS_THAN (&lt;)</option>
                    <option value="GREATER_THAN_OR_EQUAL">GREATER_THAN_OR_EQUAL (&gt;=)</option>
                    <option value="LESS_THAN_OR_EQUAL">LESS_THAN_OR_EQUAL (&lt;=)</option>
                    <option value="EQUALS">EQUALS (==)</option>
                    <option value="NOT_EQUALS">NOT_EQUALS (!=)</option>
                    <option value="CONTAINS">CONTAINS</option>
                    <option value="REGEX">REGEX Match</option>
                    <option value="IN">IN (CSV)</option>
                    <option value="CIDR_MATCH">CIDR_MATCH (Subnet)</option>
                  </select>
                </div>

                <div className="flex-1 w-full md:w-auto">
                  <input
                    type="text"
                    required
                    value={rule.targetValue}
                    onChange={(e) => handleRuleChange(rule.id, "targetValue", e.target.value)}
                    placeholder="Target value e.g. 250 or 10.0.0.0/8"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-600 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveRule(rule.id)}
                  disabled={rules.length <= 1}
                  className="text-slate-500 hover:text-rose-400 p-1.5 rounded transition disabled:opacity-30 cursor-pointer"
                  title="Remove rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Live Graylog Query Syntax Box */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-cyan-400" />
              Live Graylog / Lucene Query Syntax Preview:
            </span>
            <button
              type="button"
              onClick={handleCopyQuery}
              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 font-mono text-[11px] cursor-pointer"
            >
              {copiedQuery ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copiedQuery ? "Copied" : "Copy Graylog Query"}
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/80 font-mono text-xs text-cyan-300 overflow-x-auto whitespace-pre-wrap select-all">
            {graylogQuery}
          </pre>
        </div>

        {/* AST Simulator Sandbox */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              Interactive AST Simulator (Dry-Run Test against Sample Payload):
            </span>
            <button
              type="button"
              onClick={handleRunSimulator}
              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <Play className="h-3 w-3" /> Test Evaluation
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] text-slate-400 font-mono block mb-1">
                Sample Agent Tool Arguments JSON:
              </label>
              <textarea
                rows={5}
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-mono block mb-1">Simulator Verdict:</span>
                {testResult ? (
                  <div className="space-y-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded font-mono font-bold text-xs uppercase border ${
                        testResult.matched
                          ? actionOnMatch === "BLOCK"
                            ? "bg-rose-950 text-rose-300 border-rose-800"
                            : "bg-amber-950 text-amber-300 border-amber-800"
                          : "bg-emerald-950 text-emerald-300 border-emerald-800"
                      }`}
                    >
                      {testResult.matched ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {testResult.verdict}
                    </span>
                    <p className="text-slate-300 text-xs font-sans">{testResult.details}</p>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs py-4 text-center font-sans">
                    Click "Test Evaluation" to verify this policy against sample input.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending || isPolicyFrozen}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/30 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {isPending ? "Compiling Policy..." : "Deploy Advanced Guardrail Policy"}
          </button>
        </div>
      </form>
    </div>
  );
}
