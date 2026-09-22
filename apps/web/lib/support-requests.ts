export interface SupportRequest {
  id: string;
  userId: string;
  category: "POLICY_EXEMPTION" | "TOOL_ACCESS" | "BUDGET_INCREASE" | "TOKEN_QUOTA" | "EMERGENCY_APPROVAL" | "NEW_LLM_PROVIDER";
  agentId: string;
  requestedToolOrModel: string;
  justification: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "PENDING" | "APPROVED" | "DECLINED";
  reviewerId?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export const inMemorySupportRequests: SupportRequest[] = [
  {
    id: "req_supp_demo_01",
    userId: "usr_dev_482",
    category: "POLICY_EXEMPTION",
    agentId: "data-migration-agent",
    requestedToolOrModel: "execute_sql",
    justification: "Need temporary exemption to run partition pruning schema migration for Q3 compliance.",
    priority: "HIGH",
    status: "PENDING",
    createdAt: new Date(Date.now() - 3600000).toISOString()
  }
];

