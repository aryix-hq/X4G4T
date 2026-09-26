"use client";

import { useState } from "react";
import { Plus, Sparkles, Wand2, Globe } from "lucide-react";
import { createPolicyAction } from "@/app/actions";

export interface PolicyTemplate {
  label: string;
  category: "Fintech" | "Security" | "DevOps" | "CRM" | "Compliance";
  name: string;
  targetTool: string;
  actionOnMatch: "BLOCK" | "REQUIRE_APPROVAL" | "ALLOW";
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

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    label: "Refund Cap ($250)",
    category: "Fintech",
    name: "Enforce Max Refund Threshold ($250)",
    targetTool: "issue_refund",
    actionOnMatch: "BLOCK",
    fieldPath: "amount",
    operator: "GREATER_THAN",
    targetValue: "250"
  },
  {
    label: "Large Wire Gate ($10k)",
    category: "Fintech",
    name: "High-Value Wire Transfer Sign-Off",
    targetTool: "wire_transfer",
    actionOnMatch: "REQUIRE_APPROVAL",
    fieldPath: "amount",
    operator: "GREATER_THAN_OR_EQUAL",
    targetValue: "10000"
  },
  {
    label: "Currency Whitelist",
    category: "Fintech",
    name: "Restrict Transactions to Approved Currencies",
    targetTool: "create_payment",
    actionOnMatch: "BLOCK",
    fieldPath: "currency",
    operator: "NOT_EQUALS",
    targetValue: "USD"
  },
  {
    label: "Destructive SQL Guard",
    category: "Security",
    name: "Block Destructive SQL Commands",
    targetTool: "execute_sql",
    actionOnMatch: "BLOCK",
    fieldPath: "query",
    operator: "REGEX",
    targetValue: "(?i)(DROP|TRUNCATE|ALTER)\\s+TABLE"
  },
  {
    label: "Mass User Deletion Gate",
    category: "Security",
    name: "Prevent Bulk User Deletions",
    targetTool: "delete_users",
    actionOnMatch: "REQUIRE_APPROVAL",
    fieldPath: "user_ids_count",
    operator: "GREATER_THAN",
    targetValue: "1"
  },
  {
    label: "Block S3 Public Bucket",
    category: "DevOps",
    name: "Block Public Cloud Storage Creation",
    targetTool: "create_s3_bucket",
    actionOnMatch: "BLOCK",
    fieldPath: "is_public",
    operator: "EQUALS",
    targetValue: "true"
  },
  {
    label: "Protect K8s Production",
    category: "DevOps",
    name: "Gate Production Kubernetes Deletions",
    targetTool: "kubectl_delete",
    actionOnMatch: "REQUIRE_APPROVAL",
    fieldPath: "namespace",
    operator: "EQUALS",
    targetValue: "production"
  },
  {
    label: "Bulk Email Gate (>50)",
    category: "CRM",
    name: "Gate Bulk Customer Email Blast",
    targetTool: "send_email_campaign",
    actionOnMatch: "REQUIRE_APPROVAL",
    fieldPath: "recipient_count",
    operator: "GREATER_THAN",
    targetValue: "50"
  },
  {
    label: "VIP Customer Gate",
    category: "CRM",
    name: "Require Review for VIP Modifications",
    targetTool: "modify_customer",
    actionOnMatch: "REQUIRE_APPROVAL",
    fieldPath: "customer.tier",
    operator: "EQUALS",
    targetValue: "enterprise"
  },
  {
    label: "PII SSN Pattern Block",
    category: "Compliance",
    name: "Block Outbound Social Security Numbers",
    targetTool: "*",
    actionOnMatch: "BLOCK",
    fieldPath: "payload.text",
    operator: "REGEX",
    targetValue: "\\b\\d{3}-\\d{2}-\\d{4}\\b"
  },
  {
    label: "CIDR Ingress Restrict",
    category: "Security",
    name: "Restrict Inbound Callers to Corporate CIDR",
    targetTool: "*",
    actionOnMatch: "ALLOW",
    fieldPath: "network.source_ip",
    operator: "CIDR_MATCH",
    targetValue: "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16"
  },
  {
    label: "Egress Host Whitelist",
    category: "DevOps",
    name: "Block Unapproved External Egress Targets",
    targetTool: "*",
    actionOnMatch: "BLOCK",
    fieldPath: "network.destination_host",
    operator: "NOT_EQUALS",
    targetValue: "api.openai.com"
  }
];

interface PolicyFormWithTemplatesProps {
  isPolicyFrozen?: boolean;
}

export function PolicyFormWithTemplates({ isPolicyFrozen = false }: PolicyFormWithTemplatesProps) {
  const [name, setName] = useState("");
  const [targetTool, setTargetTool] = useState("");
  const [actionOnMatch, setActionOnMatch] = useState<string>("BLOCK");
  const [fieldPath, setFieldPath] = useState("");
  const [operator, setOperator] = useState<string>("GREATER_THAN");
  const [targetValue, setTargetValue] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const applyTemplate = (t: PolicyTemplate) => {
    if (isPolicyFrozen) return;
    setName(t.name);
    setTargetTool(t.targetTool);
    setActionOnMatch(t.actionOnMatch);
    setFieldPath(t.fieldPath);
    setOperator(t.operator);
    setTargetValue(t.targetValue);
    setSelectedTemplate(t.label);
  };

  return (
    <div className={`bg-slate-900 border rounded-xl p-6 space-y-5 shadow-sm transition ${
      isPolicyFrozen ? "border-amber-800/60 bg-slate-900/60 opacity-80" : "border-slate-800"
    }`}>
      {/* Templates Bar */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2.5">
          <Wand2 className="h-3.5 w-3.5 text-indigo-400" />
          Quick Policy Templates (Click to Auto-Fill):
        </div>
        <div className="flex flex-wrap gap-2">
          {POLICY_TEMPLATES.map((t) => {
            const isSelected = selectedTemplate === t.label;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => applyTemplate(t)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 font-medium"
                    : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                  {t.category}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Network & Context Fields Reference */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
        <div className="flex items-center justify-between text-slate-300 font-medium">
          <div className="flex items-center gap-1.5 text-indigo-400">
            <Globe className="h-3.5 w-3.5 text-indigo-400" />
            <span>Available Network &amp; Context Fields in Policy Rules:</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Supports CSV Multi-Path e.g. amount, total</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 font-mono text-[11px]">
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <span className="text-cyan-400 font-bold">network.source_ip</span>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Caller IP (from X-Forwarded-For). Use with <span className="text-indigo-300 font-mono">CIDR_MATCH</span> e.g. <span className="text-slate-300">10.0.0.0/8, 192.168.0.0/16</span></p>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <span className="text-cyan-400 font-bold">network.destination_host</span>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Parsed target egress domain. Use with <span className="text-indigo-300 font-mono">EQUALS / IN</span> e.g. <span className="text-slate-300">api.openai.com</span></p>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <span className="text-cyan-400 font-bold">network.destination_port</span>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Egress port e.g. <span className="text-slate-300">443, 80, 5432</span></p>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <span className="text-cyan-400 font-bold">network.source_hostname</span>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Caller host e.g. <span className="text-slate-300">workstation-.*</span></p>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <span className="text-cyan-400 font-bold">network.protocol</span>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Egress transport protocol (<span className="text-slate-300">https, http</span>)</p>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
            <span className="text-cyan-400 font-bold">iam.userId / iam.roles</span>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Authenticated agent identity and role tokens</p>
          </div>
        </div>
      </div>

      {/* Policy Form */}
      <form action={createPolicyAction} className="space-y-4 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between pb-2 text-sm font-semibold text-white">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-400" />
            Define Guardrail Policy
          </div>
          {selectedTemplate && (
            <span className="text-xs text-indigo-400 font-mono">
              Loaded template: {selectedTemplate}
            </span>
          )}
        </div>

        {/* Row 1: Header Info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-400">Policy Name</label>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cap Max Refunds"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400">Target Tool (* for all)</label>
            <input
              name="targetTool"
              required
              value={targetTool}
              onChange={(e) => setTargetTool(e.target.value)}
              placeholder="e.g. issue_refund"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400">Action On Match</label>
            <select
              name="actionOnMatch"
              value={actionOnMatch}
              onChange={(e) => setActionOnMatch(e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="BLOCK">BLOCK (Halt Execution)</option>
              <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL (HITL Hold)</option>
              <option value="ALLOW">ALLOW (Pass Through)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400">Deployment Mode</label>
            <select
              name="mode"
              defaultValue="ACTIVE"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ACTIVE">ACTIVE (Enforcing)</option>
              <option value="SHADOW_LEARN">SHADOW_LEARN (Test)</option>
              <option value="DISABLED">DISABLED (Off)</option>
            </select>
          </div>
        </div>

        {/* Row 2: Constraint Definition */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="text-xs font-medium text-slate-400">Field Dot-Path (CSV for multi-field)</label>
            <input
              name="fieldPath"
              required
              value={fieldPath}
              onChange={(e) => setFieldPath(e.target.value)}
              placeholder="e.g. amount, transaction.total or network.source_ip"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400">Operator</label>
            <select
              name="operator"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              <option value="CIDR_MATCH">CIDR Subnet Match (CIDR_MATCH)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400">Target Value</label>
            <input
              name="targetValue"
              required
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="e.g. 250 or (?i)drop\s+table"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          {isPolicyFrozen ? (
            <span className="text-xs text-amber-400 font-mono">
              Policy freeze active: policy creation is currently locked by SecOps.
            </span>
          ) : <span />}

          <button
            type="submit"
            disabled={isPolicyFrozen}
            className={`font-medium text-sm px-4 py-2 rounded-lg transition flex items-center gap-1.5 ${
              isPolicyFrozen
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            {isPolicyFrozen ? "Policies Frozen (Locked)" : "Create Policy"}
          </button>
        </div>
      </form>
    </div>
  );
}
