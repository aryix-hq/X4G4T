"use client";

import { useState } from "react";
import { Key, Copy, Check, Trash2, Plus, ShieldCheck, AlertCircle, Clock, CheckCircle2, XCircle, Terminal, HelpCircle } from "lucide-react";
import { createApiKeyAction, revokeApiKeyAction, createSupportRequestAction } from "@/app/actions";
import { SupportRequest } from "@/lib/support-requests";

export interface DeveloperTokenRecord {
  id: string;
  keyPrefix: string;
  environment: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface DeveloperDashboardClientProps {
  userId: string;
  orgName: string;
  tokens: DeveloperTokenRecord[];
  quota: {
    activeCount: number;
    allowedLimit: number;
    canGenerate: boolean;
    approvedIncreases: number;
  };
  supportRequests: SupportRequest[];
}

export function DeveloperDashboardClient({
  userId,
  orgName,
  tokens: initialTokens,
  quota: initialQuota,
  supportRequests: initialSupportRequests
}: DeveloperDashboardClientProps) {
  const [tokens, setTokens] = useState<DeveloperTokenRecord[]>(initialTokens);
  const [quota, setQuota] = useState(initialQuota);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>(initialSupportRequests);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Support ticket modal state
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketCategory, setTicketCategory] = useState<SupportRequest["category"]>("TOKEN_QUOTA");
  const [ticketAgentId, setTicketAgentId] = useState("my-dev-agent");
  const [ticketRequestedItem, setTicketRequestedItem] = useState("Additional 5 API Tokens");
  const [ticketJustification, setTicketJustification] = useState("");
  const [ticketPriority, setTicketPriority] = useState<SupportRequest["priority"]>("MEDIUM");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const handleGenerateToken = async () => {
    setErrorMessage(null);
    setIsPending(true);
    try {
      const res = await createApiKeyAction();
      setRevealedKey(res.rawKey);
      setTokens((prev) => [
        {
          id: `key_${Date.now()}`,
          keyPrefix: res.prefix,
          environment: "production",
          createdAt: new Date().toISOString(),
          lastUsedAt: null
        },
        ...prev
      ]);
      setQuota((prev) => ({
        ...prev,
        activeCount: prev.activeCount + 1,
        canGenerate: prev.activeCount + 1 < prev.allowedLimit
      }));
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to generate token.");
    } finally {
      setIsPending(false);
    }
  };

  const handleRevokeToken = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API token? Any agents using it will immediately lose access.")) {
      return;
    }
    setIsPending(true);
    try {
      await revokeApiKeyAction(keyId);
      setTokens((prev) => prev.filter((t) => t.id !== keyId));
      setQuota((prev) => ({
        ...prev,
        activeCount: Math.max(0, prev.activeCount - 1),
        canGenerate: true
      }));
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to revoke token.");
    } finally {
      setIsPending(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenQuotaRequest = () => {
    setTicketCategory("TOKEN_QUOTA");
    setTicketAgentId("my-dev-agent");
    setTicketRequestedItem("Token Quota Increase (+5 Tokens)");
    setTicketJustification("Reached default limit of 5 tokens. Requesting approval for additional tokens for development and testing.");
    setTicketPriority("HIGH");
    setShowTicketModal(true);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketJustification.trim()) return;
    setTicketSubmitting(true);
    try {
      const res = await createSupportRequestAction({
        category: ticketCategory,
        agentId: ticketAgentId,
        requestedToolOrModel: ticketRequestedItem,
        justification: ticketJustification,
        priority: ticketPriority
      });
      const newTicket: SupportRequest = {
        id: res.id,
        userId,
        category: ticketCategory,
        agentId: ticketAgentId,
        requestedToolOrModel: ticketRequestedItem,
        justification: ticketJustification,
        priority: ticketPriority,
        status: "PENDING",
        createdAt: new Date().toISOString()
      };
      setSupportRequests((prev) => [newTicket, ...prev]);
      setShowTicketModal(false);
      setTicketJustification("");
    } catch (err: any) {
      alert("Failed to submit request: " + err.message);
    } finally {
      setTicketSubmitting(false);
    }
  };

  // Filter support requests belonging to this developer
  const myRequests = supportRequests.filter((r) => r.userId === userId || r.userId.includes(userId.slice(-6)));

  return (
    <div className="max-w-5xl space-y-8">
      {/* 1. Header & Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold uppercase">
              Role: Developer
            </span>
            <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">User: {userId}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Developer Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your agent proxy tokens and submit support or exemption requests for {orgName}.
          </p>
        </div>

        {/* Quota Indicator Badge */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4 shrink-0">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Token Quota</div>
            <div className="text-xl font-bold text-white mt-0.5 font-mono">
              <span className={quota.activeCount >= quota.allowedLimit ? "text-amber-400" : "text-emerald-400"}>
                {quota.activeCount}
              </span>{" "}
              / {quota.allowedLimit}
            </div>
          </div>
          <div className="h-9 w-9 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Key className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SECTION 1: API TOKENS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-indigo-400" />
              My API Tokens
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tokens are capped at {quota.allowedLimit}. Generating additional tokens requires administrator approval.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {quota.canGenerate ? (
              <button
                onClick={handleGenerateToken}
                disabled={isPending}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Generate Token ({quota.activeCount}/{quota.allowedLimit})
              </button>
            ) : (
              <button
                onClick={handleOpenQuotaRequest}
                className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <HelpCircle className="h-4 w-4" />
                Request Token Quota Increase
              </button>
            )}
          </div>
        </div>

        {/* Revealed Token Banner (One-Time Display) */}
        {revealedKey && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Token Generated Successfully!
            </div>
            <p className="text-xs text-slate-300">
              Copy this token now. For your security, it will not be displayed again.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                readOnly
                value={revealedKey}
                className="bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs px-3 py-2 rounded-lg flex-1 select-all"
              />
              <button
                onClick={() => copyToClipboard(revealedKey)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => setRevealedKey(null)}
                className="text-slate-400 hover:text-white px-3 py-2 text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Token List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Active Tokens ({tokens.length})</span>
            <span>Environment: Production</span>
          </div>

          {tokens.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No active tokens found. Click &quot;Generate Token&quot; above to create your first proxy token.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {tokens.map((token) => (
                <div key={token.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-800/50">
                      <Key className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-mono text-xs font-bold text-white flex items-center gap-2">
                        <span>{token.keyPrefix}...</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                          ACTIVE
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Created: {new Date(token.createdAt).toLocaleDateString()} at {new Date(token.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevokeToken(token.id)}
                    disabled={isPending}
                    className="text-slate-400 hover:text-rose-400 p-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    title="Revoke Token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. SECTION 2: SUPPORT & EXEMPTION TICKETS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-amber-400" />
              Support & Exemption Requests
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Submit requests to administrators for additional tokens, tool access, or policy exemptions.
            </p>
          </div>

          <button
            onClick={() => {
              setTicketCategory("TOOL_ACCESS");
              setTicketRequestedItem("");
              setTicketJustification("");
              setShowTicketModal(true);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-slate-700"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            Raise Support Ticket
          </button>
        </div>

        {/* Tickets List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            My Submitted Tickets ({myRequests.length})
          </div>

          {myRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No support tickets submitted yet. Click &quot;Raise Support Ticket&quot; to request tool access or token quota increases.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {myRequests.map((req) => (
                <div key={req.id} className="p-4 space-y-2 hover:bg-slate-800/30 transition">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{req.id}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold">
                        {req.category.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                          req.priority === "CRITICAL"
                            ? "bg-rose-950 text-rose-300 border border-rose-800"
                            : req.priority === "HIGH"
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {req.priority}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {req.status === "PENDING" && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-mono">
                          <Clock className="h-3 w-3" /> PENDING REVIEW
                        </span>
                      )}
                      {req.status === "APPROVED" && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 font-mono">
                          <CheckCircle2 className="h-3 w-3" /> APPROVED
                        </span>
                      )}
                      {req.status === "DECLINED" && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 font-mono">
                          <XCircle className="h-3 w-3" /> DECLINED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-200">
                    <span className="text-slate-400">Request:</span> <span className="font-semibold">{req.requestedToolOrModel}</span> (Agent: <code className="text-slate-400">{req.agentId}</code>)
                  </div>
                  <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {req.justification}
                  </div>

                  {req.resolutionNote && (
                    <div className="text-xs text-emerald-300 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/50 flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                      <div>
                        <span className="font-semibold text-emerald-200">Admin Resolution:</span> {req.resolutionNote}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500">
                    Submitted: {new Date(req.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Quickstart Integration Guide */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          Agent Integration Quickstart
        </h3>
        <p className="text-xs text-slate-400">
          Use your generated X4G4T token as the Bearer credential to route your agent traffic through the firewall gateway:
        </p>

        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 space-y-2 overflow-x-auto">
          <div className="text-slate-500"># Python / OpenAI SDK Integration</div>
          <div><span className="text-indigo-400">from</span> openai <span className="text-indigo-400">import</span> OpenAI</div>
          <div>client = OpenAI(</div>
          <div className="pl-4">base_url=<span className="text-emerald-400">&quot;http://localhost:4000/v1&quot;</span>,  <span className="text-slate-500"># X4G4T Gateway</span></div>
          <div className="pl-4">api_key=<span className="text-emerald-400">&quot;sec_live_your_token_here&quot;</span></div>
          <div>)</div>
        </div>
      </div>

      {/* SUPPORT TICKET SUBMISSION MODAL */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-amber-400" />
                Raise Support / Exemption Request
              </h3>
              <button
                onClick={() => setShowTicketModal(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Request Category</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="TOKEN_QUOTA">Token Quota Increase (Request more than 5 tokens)</option>
                  <option value="TOOL_ACCESS">Tool Access (Request permission to execute a tool)</option>
                  <option value="POLICY_EXEMPTION">Policy Exemption (Temporary threshold waiver)</option>
                  <option value="NEW_LLM_PROVIDER">New LLM Provider / Model Access</option>
                  <option value="EMERGENCY_APPROVAL">Emergency Approval</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Agent ID</label>
                <input
                  type="text"
                  required
                  value={ticketAgentId}
                  onChange={(e) => setTicketAgentId(e.target.value)}
                  placeholder="e.g. data-migration-bot"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Requested Tool, Model, or Quota</label>
                <input
                  type="text"
                  required
                  value={ticketRequestedItem}
                  onChange={(e) => setTicketRequestedItem(e.target.value)}
                  placeholder="e.g. 5 Additional Tokens, execute_sql, gpt-4o"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Business Justification</label>
                <textarea
                  required
                  rows={3}
                  value={ticketJustification}
                  onChange={(e) => setTicketJustification(e.target.value)}
                  placeholder="Provide rationale for the administrator..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Priority</label>
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ticketSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {ticketSubmitting ? "Submitting..." : "Submit Ticket to Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

