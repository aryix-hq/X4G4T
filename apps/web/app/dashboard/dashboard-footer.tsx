"use client";

import { useState } from "react";
import Link from "next/link";
import {
  HelpCircle,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
  Lock
} from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
  category: "Performance" | "HITL" | "MCP" | "IAM" | "Policies" | "Privacy";
}

const FAQS: FaqItem[] = [
  {
    category: "Performance",
    question: "How does X4G4T achieve ultra-low (<15ms) latency?",
    answer:
      "X4G4T evaluates tool calls using a pure in-memory Abstract Syntax Tree (AST) compiled from active guardrail rules. Traversal takes 0.15 microseconds (0.00015ms), enabling 6.6M+ evaluations/sec per core. With 5-minute in-memory SHA-256 token caching, the Fastify gateway P50 latency is just 0.065ms."
  },
  {
    category: "HITL",
    question: "What happens when an agent tool call is HELD for review?",
    answer:
      "High-impact operations (e.g. large wire transfers or bulk user deletions) are suspended with HTTP 202 Accepted. An interactive Slack or Microsoft Teams card is instantly dispatched with HMAC-SHA256 signed 'Approve' and 'Reject' buttons. The agent polls the hold endpoint until a human supervisor decides."
  },
  {
    category: "MCP",
    question: "How do I connect Cursor or Claude Desktop via Model Context Protocol?",
    answer:
      "Configure your MCP client settings with the endpoint URL 'http://localhost:4000/v1/gateway/mcp', include your Bearer API key or IAM JWT token, and provide the 'X-Target-MCP-URL' header pointing to your backend MCP server. X4G4T natively intercepts 'tools/call' JSON-RPC 2.0 frames."
  },
  {
    category: "IAM",
    question: "Which IAM providers are supported for enterprise authentication?",
    answer:
      "X4G4T supports dual-mode authentication: static 256-bit API keys and enterprise JWT Bearer tokens from Clerk, WorkOS (Enterprise SSO & SAML), Okta / Auth0 / Generic OIDC, AWS Cognito, and Azure Active Directory / Microsoft Entra ID."
  },
  {
    category: "Policies",
    question: "How do I customize a predefined policy template before deploying?",
    answer:
      "Navigate to the Predefined Policy Library tab in the Policies dashboard. Click 'Customize & Deploy' on any policy card to modify the policy name, target tool, numerical thresholds, dot-path fields, or operators in an interactive modal."
  },
  {
    category: "Privacy",
    question: "Is customer or agent payload data shared with external AI models?",
    answer:
      "No. X4G4T is a 100% deterministic, standalone policy firewall. Zero payload data is ever transmitted to external LLMs or third parties for rule evaluation. Automatic zero-latency PII sanitization redacts emails, SSNs, and credit cards before audit ingestion."
  }
];

export function DashboardFooter() {
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    setExpandedFaq(expandedFaq === idx ? null : idx);
  };

  return (
    <>
      <footer className="mt-12 pt-6 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        {/* Left: System Status & Metrics */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Operational
          </div>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-[11px] text-slate-400">
            AST: &lt;0.15µs &bull; P50: 0.065ms
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-[11px] font-mono text-slate-400">X4G4T Defense Systems &bull; v0.1.0</span>
        </div>

        {/* Right: Documentation & Help Links */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setIsFaqOpen(true)}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition cursor-pointer hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
            Help & FAQs
          </button>

          <Link
            href="/dashboard/docs/user-guide"
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition hover:underline"
          >
            <BookOpen className="h-3.5 w-3.5 text-slate-400" />
            User Guide
          </Link>

          <Link
            href="/dashboard/docs/policy-guide"
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            Policy Guide
          </Link>

          <Link
            href="/dashboard/docs/iam-guide"
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition hover:underline"
          >
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            IAM Guide
          </Link>
        </div>
      </footer>

      {/* Help & FAQs Modal */}
      {isFaqOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <HelpCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Help & Frequently Asked Questions</h3>
                  <p className="text-xs text-slate-400">Everything you need to know about X4G4T defense gate & runtime firewall</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFaqOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* FAQs List */}
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {FAQS.map((faq, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <div
                    key={faq.question}
                    className="bg-slate-950 border border-slate-800/80 rounded-xl overflow-hidden transition"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full text-left p-3.5 flex items-center justify-between gap-3 text-xs font-semibold text-white hover:bg-slate-900/50 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {faq.category}
                        </span>
                        <span>{faq.question}</span>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 pt-1 text-xs text-slate-300 leading-relaxed border-t border-slate-900">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Need further assistance? Check the operator documentation.</span>
              <button
                type="button"
                onClick={() => setIsFaqOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

