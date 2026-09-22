import { redirect } from "next/navigation";
import { getTenantContext, getDb } from "@/lib/tenant";
import { hitlRequests, executionLogs } from "@x4g4t/db";
import { eq, desc } from "drizzle-orm";
import { ApprovalsClient, HitlItem } from "./approvals-client";
import { inMemoryHitlRequests } from "@/lib/in-memory-keys";
import { getSupportRequestsAction } from "@/app/actions";
import { UserCheck } from "lucide-react";

export default async function ApprovalsPage() {
  const { orgId, role, userId } = await getTenantContext();
  if (role !== "admin") {
    redirect("/dashboard");
  }
  const db = getDb();
  const supportRequests = await getSupportRequestsAction();

  let items: HitlItem[] = [];

  try {
    const dbRecords = await db
      .select({
        id: hitlRequests.id,
        status: hitlRequests.status,
        reviewerId: hitlRequests.reviewerId,
        resolutionReason: hitlRequests.resolutionReason,
        createdAt: hitlRequests.createdAt,
        resolvedAt: hitlRequests.resolvedAt,
        agentId: executionLogs.agentId,
        toolName: executionLogs.toolName,
        arguments: executionLogs.arguments
      })
      .from(hitlRequests)
      .innerJoin(executionLogs, eq(hitlRequests.logId, executionLogs.id))
      .where(eq(executionLogs.orgId, orgId))
      .orderBy(desc(hitlRequests.createdAt));

    items = dbRecords.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      toolName: r.toolName,
      arguments: r.arguments as Record<string, unknown>,
      status: r.status as any,
      reviewerId: r.reviewerId,
      resolutionReason: r.resolutionReason,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null
    }));
  } catch (err) {
    // If DB is offline, fall back to in-memory items
    items = inMemoryHitlRequests.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      toolName: r.toolName,
      arguments: r.arguments,
      triggeredPolicyName: r.triggeredPolicyName,
      status: r.status,
      reviewerId: r.reviewerId,
      resolutionReason: r.resolutionReason,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt
    }));
  }

  // Merge in-memory pending items if not already in DB list
  for (const mem of inMemoryHitlRequests) {
    if (!items.some((i) => i.id === mem.id)) {
      items.unshift(mem);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-indigo-400" />
          Human-in-the-Loop (HITL) Approvals & Support Requests
        </h1>
        <p className="text-sm text-slate-400">
          Review, approve, or terminate high-impact autonomous agent operations suspended by security guardrails, and manage developer exemption tickets.
        </p>
      </div>

      <ApprovalsClient
        initialRequests={JSON.parse(JSON.stringify(items))}
        initialSupportRequests={JSON.parse(JSON.stringify(supportRequests))}
        userRole={role}
        userId={userId}
      />
    </div>
  );
}

