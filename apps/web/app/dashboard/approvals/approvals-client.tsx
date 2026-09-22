"use client";

import { useState } from "react";
import {
  resolveHitlRequestAction,
  createSupportRequestAction,
  resolveSupportRequestAction
} from "@/app/actions";
import {
  CheckCircle,
  XCircle,
  Clock,
  ShieldAlert,
  Check,
  UserCheck,
  HelpCircle,
  Send,
  Plus,
  X,
  Lock
} from "lucide-react";
import type { SupportRequest } from "@/lib/support-requests";

export interface HitlItem {
  id: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  triggeredPolicyName?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reviewerId?: string | null;
  resolutionReason?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

interface ApprovalsClientProps {
  initialRequests: HitlItem[];
  initialSupportRequests?: SupportRequest[];
  userRole?: "admin" | "developer";
  userId?: string;
}

export function ApprovalsClient({
  initialRequests,
  initialSupportRequests = [],
  userRole = "admin",
  userId = "usr_dev"
}: ApprovalsClientProps) {
  const [requests, setRequests] = useState<HitlItem[]>(initialRequests);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>(initialSupportRequests);
  const [activeTab, setActiveTab] = useState<"pending" | "resolved" | "support">("pending");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState<Record<string, string>>({});

  // Support Request modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<SupportRequest["category"]>("POLICY_EXEMPTION");
  const [modalAgentId, setModalAgentId] = useState("");
  const [modalToolOrModel, setModalToolOrModel] = useState("");
  const [modalJustification, setModalJustification] = useState("");
  const [modalPriority, setModalPriority] = useState<SupportRequest["priority"]>("HIGH");
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  // Admin resolution note for support requests
  const [supportResolutionNote, setSupportResolutionNote] = useState<Record<string, string>>({});
  const [resolvingSupportId, setResolvingSupportId] = useState<string | null>(null);

  const pendingList = requests.filter((r) => r.status === "PENDING");
  const resolvedList = requests.filter((r) => r.status !== "PENDING");
  const pendingSupportCount = supportRequests.filter((s) => s.status === "PENDING").length;

  const handleResolveHitl = async (holdId: string, decision: "APPROVED" | "REJECTED") => {
    if (userRole !== "admin") return;
    setResolvingId(holdId);
    try {
      const note = resolutionNote[holdId] || "";
      await resolveHitlRequestAction(holdId, decision, note);

      setRequests((prev) =>
        prev.map((r) =>
          r.id === holdId
            ? {
                ...r,
                status: decision,
                reviewerId: userId,
                resolutionReason: note || `Resolved as ${decision} via Admin Portal`,
                resolvedAt: new Date().toISOString()
              }
            : r
        )
      );
    } catch (err) {
      console.error("Failed to resolve approval:", err);
      alert(err instanceof Error ? err.message : "Failed to resolve approval hold.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleOpenModalForHold = (hold: HitlItem) => {
    setModalCategory("POLICY_EXEMPTION");
    setModalAgentId(hold.agentId);
    setModalToolOrModel(hold.toolName);
    setModalJustification(`Exemption requested for hold ${hold.id} triggered on tool ${hold.toolName}.`);
    setModalPriority("HIGH");
    setIsModalOpen(true);
  };

  const handleSubmitSupportRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAgentId || !modalToolOrModel || !modalJustification) {
      alert("Please fill in all required fields.");
      return;
    }

    setIsSubmittingSupport(true);
    try {
      const res = await createSupportRequestAction({
        category: modalCategory,
        agentId: modalAgentId,
        requestedToolOrModel: modalToolOrModel,
        justification: modalJustification,
        priority: modalPriority
      });

      const newReq: SupportRequest = {
        id: res.id,
        userId,
        category: modalCategory,
        agentId: modalAgentId,
        requestedToolOrModel: modalToolOrModel,
        justification: modalJustification,
        priority: modalPriority,
        status: "PENDING",
        createdAt: new Date().toISOString()
      };

      setSupportRequests((prev) => [newReq, ...prev]);
      setIsModalOpen(false);
      setModalAgentId("");
      setModalToolOrModel("");
      setModalJustification("");
      setActiveTab("support");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create support request.");
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleResolveSupportRequest = async (
    id: string,
    decision: "APPROVED" | "DECLINED"
  ) => {
    if (userRole !== "admin") return;
    setResolvingSupportId(id);
    try {
      const note = supportResolutionNote[id] || "";
      await resolveSupportRequestAction(id, decision, note);

      setSupportRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: decision,
                reviewerId: userId,
                resolutionNote: note || `Resolved as ${decision} by Admin`,
                resolvedAt: new Date().toISOString()
              }
            : r
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve support request.");
    } finally {
      setResolvingSupportId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Developer RBAC notice banner if not admin */}
      {userRole !== "admin" && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong className="text-white">Developer Read-Only View:</strong> Tool execution approval & rejection are restricted to SecOps Administrators. You can raise a support request to request an exemption or policy bypass.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Raise Exemption Request
          </button>
        </div>
      )}

      {/* Main Sub Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 gap-4 pb-2">
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab("pending")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === "pending"
                ? "border-amber-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="h-4 w-4 text-amber-400" />
            Pending Approvals
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono">
              {pendingList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("resolved")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === "resolved"
                ? "border-indigo-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            Resolved History
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {resolvedList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("support")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === "support"
                ? "border-cyan-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HelpCircle className="h-4 w-4 text-cyan-400" />
            Support & Exemption Requests
            {pendingSupportCount > 0 && (
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                {pendingSupportCount} pending
              </span>
            )}
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Raise Support Request
          </button>
        </div>
      </div>

      {/* 1. PENDING TAB */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {pendingList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
              <UserCheck className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-slate-300">No Pending Approvals</h3>
              <p className="text-xs text-slate-500 mt-1">
                When an agent attempts a tool execution governed by a <code className="text-indigo-400">REQUIRE_APPROVAL</code> policy, it will appear here for review.
              </p>
            </div>
          ) : (
            pendingList.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900 border border-amber-800/40 rounded-xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-400">
                      <ShieldAlert className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        Tool: <code className="text-indigo-300 font-mono">{item.toolName}</code>
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono font-normal">
                          HELD FOR REVIEW
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Agent: <span className="font-mono text-slate-300">{item.agentId}</span> • Triggered Policy: <span className="text-slate-300">{item.triggeredPolicyName || "High-Impact Operation Gate"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(item.createdAt).toLocaleTimeString()} ({new Date(item.createdAt).toLocaleDateString()})
                    </span>
                    <div className="text-[11px] text-slate-500 font-mono">Hold ID: {item.id}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                    Sanitized Payload Arguments:
                  </div>
                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto max-h-48">
                    {JSON.stringify(item.arguments, null, 2)}
                  </pre>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  {userRole === "admin" ? (
                    <>
                      <input
                        type="text"
                        placeholder="Optional reviewer notes / reason..."
                        value={resolutionNote[item.id] || ""}
                        onChange={(e) =>
                          setResolutionNote((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResolveHitl(item.id, "REJECTED")}
                          disabled={resolvingId === item.id}
                          className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject / Terminate
                        </button>

                        <button
                          onClick={() => handleResolveHitl(item.id, "APPROVED")}
                          disabled={resolvingId === item.id}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          {resolvingId === item.id ? "Resolving..." : "Approve Execution"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                        Approval authority restricted to SecOps Administrator.
                      </span>

                      <button
                        type="button"
                        onClick={() => handleOpenModalForHold(item)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Request Exemption for this Hold
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 2. RESOLVED HISTORY TAB */}
      {activeTab === "resolved" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Resolved Approval History</span>
            <span className="font-mono text-[11px] text-slate-500">{resolvedList.length} records</span>
          </div>

          <div className="divide-y divide-slate-800">
            {resolvedList.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No past approvals recorded.
              </div>
            ) : (
              resolvedList.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition">
                  <div className="flex items-center gap-3">
                    {item.status === "APPROVED" ? (
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-rose-400" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <code className="font-mono text-indigo-300">{item.toolName}</code>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-mono font-semibold ${
                            item.status === "APPROVED"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-rose-950 text-rose-300 border border-rose-800"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        Agent: <span className="font-mono text-slate-300">{item.agentId}</span> • Reviewer: <span className="text-slate-300">{item.reviewerId || "Admin"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-400">
                      {item.resolutionReason || "Resolved in portal"}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {item.resolvedAt ? new Date(item.resolvedAt).toLocaleTimeString() : new Date(item.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3. SUPPORT & EXEMPTION REQUESTS TAB */}
      {activeTab === "support" && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-cyan-400" />
                Developer Support & Exemption Requests
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Developers can raise requests for tool exemptions, model whitelisting, or policy exceptions. Admins review and grant temporary or permanent sign-offs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New Ticket
            </button>
          </div>

          {supportRequests.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
              <HelpCircle className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-slate-300">No Support Requests</h3>
              <p className="text-xs text-slate-500 mt-1">
                Need an exception for a policy rule or access to an LLM provider? Click "New Ticket" to submit a request to SecOps.
              </p>
            </div>
          ) : (
            supportRequests.map((req) => (
              <div
                key={req.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3.5 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                        req.priority === "CRITICAL"
                          ? "bg-rose-950 text-rose-300 border-rose-800"
                          : req.priority === "HIGH"
                          ? "bg-amber-950 text-amber-300 border-amber-800"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {req.priority}
                    </span>

                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800">
                      {req.category}
                    </span>

                    <span className="text-sm font-bold text-white">
                      Agent: <code className="text-cyan-300 font-mono">{req.agentId}</code>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded font-mono font-bold uppercase border ${
                        req.status === "APPROVED"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                          : req.status === "DECLINED"
                          ? "bg-rose-950 text-rose-300 border-rose-800"
                          : "bg-amber-950 text-amber-300 border-amber-800"
                      }`}
                    >
                      {req.status}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="text-slate-400">
                    Target Tool / Model: <strong className="text-white font-mono">{req.requestedToolOrModel}</strong> • Requester: <span className="text-slate-300 font-mono">{req.userId}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 leading-relaxed">
                    {req.justification}
                  </div>
                </div>

                {req.resolutionNote && (
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between text-slate-400">
                    <div>
                      Resolution: <span className="text-white">{req.resolutionNote}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      Reviewed by {req.reviewerId || "Admin"} • {req.resolvedAt ? new Date(req.resolvedAt).toLocaleTimeString() : ""}
                    </div>
                  </div>
                )}

                {/* Admin Actions for Pending Tickets */}
                {userRole === "admin" && req.status === "PENDING" && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                    <input
                      type="text"
                      placeholder="Admin feedback / resolution note..."
                      value={supportResolutionNote[req.id] || ""}
                      onChange={(e) =>
                        setSupportResolutionNote((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={resolvingSupportId === req.id}
                        onClick={() => handleResolveSupportRequest(req.id, "DECLINED")}
                        className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Decline
                      </button>

                      <button
                        type="button"
                        disabled={resolvingSupportId === req.id}
                        onClick={() => handleResolveSupportRequest(req.id, "APPROVED")}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve Exemption
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Raise Support / Exemption Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Raise Support / Exemption Request</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitSupportRequest} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Request Category</label>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value as any)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="POLICY_EXEMPTION">Policy Exemption / Rule Bypass</option>
                  <option value="TOOL_ACCESS">Tool Execution Access Whitelist</option>
                  <option value="NEW_LLM_PROVIDER">New LLM Provider Onboarding</option>
                  <option value="BUDGET_INCREASE">Rate Limit / Quota Increase</option>
                  <option value="EMERGENCY_APPROVAL">Emergency Incident Approval</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Target Agent ID</label>
                  <input
                    required
                    placeholder="e.g. agent-sales-01"
                    value={modalAgentId}
                    onChange={(e) => setModalAgentId(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Priority</label>
                  <select
                    value={modalPriority}
                    onChange={(e) => setModalPriority(e.target.value as any)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-medium">Requested Tool or Model Name</label>
                <input
                  required
                  placeholder="e.g. wire_transfer, execute_sql, or gpt-4o"
                  value={modalToolOrModel}
                  onChange={(e) => setModalToolOrModel(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium">Business Justification</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this exemption or access is required and any relevant ticket IDs..."
                  value={modalJustification}
                  onChange={(e) => setModalJustification(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSupport}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isSubmittingSupport ? "Submitting..." : "Submit Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
