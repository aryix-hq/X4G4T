"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantContext, getDb } from "@/lib/tenant";
import { apiKeys, policies, policyRules, hitlRequests } from "@x4g4t/db";
import { eq, and, count, isNull } from "drizzle-orm";
import {
  inMemoryApiKeys,
  inMemoryLlmConfigs,
  inMemoryHitlRequests,
  LlmProviderConfig
} from "@/lib/in-memory-keys";
import { PolicyFormSchema } from "@/lib/schemas";
import {
  getPredefinedPolicy,
  setGlobalAiLockdown,
  getGlobalAiLockdownDetails,
  isPolicyFreezeActive,
  setPolicyFreeze,
  getPolicyFreezeDetails
} from "@x4g4t/policy-engine";
import { inMemorySupportRequests, SupportRequest } from "@/lib/support-requests";
import { cookies } from "next/headers";

// ============================================================================
// RBAC Enforcement Helper
// ============================================================================

export async function assertAdminRole(): Promise<void> {
  const { role } = await getTenantContext();
  if (role !== "admin") {
    throw new Error("403 Forbidden: Only organization administrators (SecOps) have permission for this action.");
  }
}

export async function switchRoleAction(newRole: "admin" | "developer") {
  const cookieStore = await cookies();
  cookieStore.set("x4g4t_role", newRole, { path: "/" });
  try {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/policies");
    revalidatePath("/dashboard/keys");
    revalidatePath("/dashboard/approvals");
  } catch {}
}

export async function toggleGlobalAiLockdownAction(active: boolean, reason?: string) {
  await assertAdminRole();
  const { userId } = await getTenantContext();
  setGlobalAiLockdown(active, reason, userId);
  try {
    revalidatePath("/dashboard/policies");
    revalidatePath("/dashboard");
  } catch {}
  return { active, details: getGlobalAiLockdownDetails() };
}

export async function getGlobalAiLockdownAction() {
  return getGlobalAiLockdownDetails();
}

export async function togglePolicyFreezeAction(active: boolean, reason?: string) {
  await assertAdminRole();
  const { userId } = await getTenantContext();
  setPolicyFreeze(active, reason, userId);
  try {
    revalidatePath("/dashboard/policies");
  } catch {}
  return { active, details: getPolicyFreezeDetails() };
}

export async function getPolicyFreezeAction() {
  return getPolicyFreezeDetails();
}

// ============================================================================
// Support & Approval Exemption Requests
// ============================================================================

export async function createSupportRequestAction(data: {
  category: SupportRequest["category"];
  agentId: string;
  requestedToolOrModel: string;
  justification: string;
  priority: SupportRequest["priority"];
}): Promise<{ success: boolean; id: string }> {
  const { userId } = await getTenantContext();
  const newReq: SupportRequest = {
    id: `req_supp_${randomBytes(6).toString("hex")}`,
    userId,
    category: data.category,
    agentId: data.agentId,
    requestedToolOrModel: data.requestedToolOrModel,
    justification: data.justification,
    priority: data.priority,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };
  inMemorySupportRequests.unshift(newReq);
  try {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/policies");
  } catch {}
  return { success: true, id: newReq.id };
}

export async function resolveSupportRequestAction(
  requestId: string,
  decision: "APPROVED" | "DECLINED",
  note?: string
): Promise<{ success: boolean }> {
  await assertAdminRole();
  const { userId } = await getTenantContext();
  const req = inMemorySupportRequests.find((r) => r.id === requestId);
  if (req) {
    req.status = decision;
    req.reviewerId = userId;
    req.resolutionNote = note || `Resolved as ${decision} by Admin`;
    req.resolvedAt = new Date().toISOString();
  }
  try {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/policies");
  } catch {}
  return { success: true };
}

export async function getSupportRequestsAction(): Promise<SupportRequest[]> {
  return inMemorySupportRequests;
}

let dbOffline = process.env.NODE_ENV === "test" && !process.env.DATABASE_URL;

export async function getDeveloperQuotaAction(): Promise<{
  activeCount: number;
  allowedLimit: number;
  canGenerate: boolean;
  approvedIncreases: number;
}> {
  const { orgId, role, userId } = await getTenantContext();
  const db = getDb();

  let activeCount = 0;
  if (!dbOffline) {
    try {
      const [res] = await db
        .select({ val: count() })
        .from(apiKeys)
        .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.deletedAt)));
      activeCount = res?.val ?? 0;
    } catch {
      dbOffline = true;
      activeCount = inMemoryApiKeys.length;
    }
  } else {
    activeCount = inMemoryApiKeys.length;
  }

  if (role === "admin") {
    return {
      activeCount,
      allowedLimit: 9999,
      canGenerate: true,
      approvedIncreases: 0
    };
  }

  const approvedTickets = inMemorySupportRequests.filter(
    (r) =>
      r.userId === userId &&
      (r.category === "BUDGET_INCREASE" || r.category === "TOKEN_QUOTA" || r.requestedToolOrModel.toLowerCase().includes("token")) &&
      r.status === "APPROVED"
  );

  const allowedLimit = 5 + approvedTickets.length * 5;
  return {
    activeCount,
    allowedLimit,
    canGenerate: activeCount < allowedLimit,
    approvedIncreases: approvedTickets.length
  };
}

// ============================================================================
// 1. API Key Actions (with developer quota enforcement & offline tolerance)
// ============================================================================

export async function createApiKeyAction() {
  const { orgId, role } = await getTenantContext();
  const db = getDb();

  // Developer quota check: maximum 5 tokens unless admin approved quota increase
  if (role === "developer") {
    const quota = await getDeveloperQuotaAction();
    if (!quota.canGenerate) {
      throw new Error(
        `403 Forbidden: Developer token limit reached (${quota.activeCount}/${quota.allowedLimit} tokens active). Please raise a Support Request to obtain approval for additional tokens.`
      );
    }
  }

  // Generate 24 bytes hex secret (total 48 chars secret)
  const secretPart = randomBytes(24).toString("hex");
  const prefix = `sec_live_${secretPart.slice(0, 6)}`;
  const rawKey = `${prefix}_${secretPart.slice(6)}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyId = randomUUID();

  if (!dbOffline) {
    try {
      await db.insert(apiKeys).values({
        id: keyId,
        orgId,
        keyPrefix: prefix,
        keyHash,
        environment: "production"
      });
    } catch (err) {
      dbOffline = true;
      console.warn("[X4G4T DB Offline] Storing API key in in-memory session:", err);
      inMemoryApiKeys.unshift({
        id: keyId,
        keyPrefix: prefix,
        environment: "production",
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        keyHash
      });
    }
  } else {
    inMemoryApiKeys.unshift({
      id: keyId,
      keyPrefix: prefix,
      environment: "production",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      keyHash
    });
  }

  try {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/keys");
  } catch {
    // revalidatePath is a no-op in non-Next runtime/test environments
  }

  return { rawKey, prefix };
}

export async function revokeApiKeyAction(keyId: string) {
  const { orgId } = await getTenantContext();
  const db = getDb();

  try {
    await db
      .update(apiKeys)
      .set({ deletedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)));
  } catch (err) {
    console.warn("[X4G4T DB Offline] Revoking key in in-memory store:", err);
    const idx = inMemoryApiKeys.findIndex((k) => k.id === keyId);
    if (idx !== -1) {
      inMemoryApiKeys.splice(idx, 1);
    }
  }

  try {
    revalidatePath("/dashboard/keys");
  } catch {
    // revalidatePath no-op in tests
  }
}

// ============================================================================
// 2. LLM Provider Config & Vault Actions
// ============================================================================

export async function saveLlmConfigAction(
  provider: "openai" | "gemini" | "claude" | "ollama" | "antigravity",
  model: string,
  apiKey?: string,
  baseUrl?: string
): Promise<{ success: boolean; message: string }> {
  await assertAdminRole();

  const existing = inMemoryLlmConfigs[provider];
  // If a new raw key is provided (not a masked key), use it; otherwise retain existing raw key
  const effectiveRawKey = apiKey && !apiKey.includes("...") ? apiKey : existing?.rawApiKey;

  inMemoryLlmConfigs[provider] = {
    provider,
    model,
    apiKey: effectiveRawKey ? `${effectiveRawKey.slice(0, 4)}...${effectiveRawKey.slice(-4)}` : undefined,
    rawApiKey: effectiveRawKey,
    baseUrl,
    isConfigured: Boolean(effectiveRawKey || provider === "ollama" || provider === "antigravity"),
    updatedAt: new Date().toISOString()
  };

  try {
    revalidatePath("/dashboard/keys");
  } catch {}

  return {
    success: true,
    message: `${provider.toUpperCase()} provider configuration saved successfully.`
  };
}

export async function getLlmConfigsAction(): Promise<Record<string, LlmProviderConfig>> {
  // Strip rawApiKey before returning to client/UI
  const sanitized: Record<string, LlmProviderConfig> = {};
  for (const [k, v] of Object.entries(inMemoryLlmConfigs)) {
    sanitized[k] = { ...v, rawApiKey: undefined };
  }
  return sanitized;
}

// ============================================================================
// 3. Human-in-the-Loop (HITL) Admin Approval Actions
// ============================================================================

export async function resolveHitlRequestAction(
  holdId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string
): Promise<{ success: boolean; status: string }> {
  await assertAdminRole();
  const { userId } = await getTenantContext();
  const db = getDb();
  const now = new Date();

  try {
    await db
      .update(hitlRequests)
      .set({
        status: decision,
        reviewerId: userId,
        resolutionReason: note || `Resolved as ${decision} via X4G4T Admin Portal`,
        resolvedAt: now
      })
      .where(eq(hitlRequests.id, holdId));
  } catch (err) {
    console.warn("[X4G4T DB Offline] Updating in-memory HITL request:", err);
  }

  // Also update in-memory record if present
  const inMem = inMemoryHitlRequests.find((r) => r.id === holdId);
  if (inMem) {
    inMem.status = decision;
    inMem.reviewerId = userId;
    inMem.resolutionReason = note || `Resolved as ${decision} via X4G4T Admin Portal`;
    inMem.resolvedAt = now.toISOString();

    // On admin approval, forward the tool execution to the downstream service
    if (decision === "APPROVED" && inMem.downstreamUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(inMem.downstreamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(inMem.downstreamHeaders || {}) },
          body: JSON.stringify(inMem.arguments),
          signal: controller.signal
        });
        clearTimeout(timeout);
        const text = await res.text();
        try {
          inMem.executionResponse = JSON.parse(text);
        } catch {
          inMem.executionResponse = text;
        }
      } catch (err: any) {
        inMem.executionResponse = { error: { code: "DOWNSTREAM_ERROR", message: err?.message || "Downstream execution failed" } };
      }
    }
  }

  try {
    revalidatePath("/dashboard/approvals");
    revalidatePath("/dashboard/logs");
  } catch {}

  return { success: true, status: decision };
}

// ============================================================================
// 4. Policy Actions (Admin Enforced via RBAC & Policy Freeze)
// ============================================================================

export async function createPolicyAction(formData: FormData) {
  await assertAdminRole();
  if (isPolicyFreezeActive()) {
    throw new Error("423 Locked: Policy editing is currently frozen by SecOps. Unlock policy editing before modifying guardrails.");
  }
  const { orgId } = await getTenantContext();
  const db = getDb();

  const parsed = PolicyFormSchema.parse({
    name: formData.get("name"),
    targetTool: formData.get("targetTool"),
    actionOnMatch: formData.get("actionOnMatch"),
    fieldPath: formData.get("fieldPath"),
    operator: formData.get("operator"),
    targetValue: formData.get("targetValue")
  });

  try {
    // 1. Insert parent policy header
    const [newPolicy] = await db
      .insert(policies)
      .values({
        orgId,
        name: parsed.name,
        targetTool: parsed.targetTool,
        actionOnMatch: parsed.actionOnMatch,
        isActive: "true"
      })
      .returning();

    // 2. Insert associated rule constraint
    await db.insert(policyRules).values({
      policyId: newPolicy!.id,
      fieldPath: parsed.fieldPath,
      operator: parsed.operator,
      targetValue: parsed.targetValue
    });
  } catch (err) {
    console.warn("[X4G4T DB Offline] Policy create failed, DB not available:", err);
  }

  try {
    revalidatePath("/dashboard/policies");
  } catch {}
}

export async function deployLibraryPolicyAction(templateId: string) {
  await assertAdminRole();
  if (isPolicyFreezeActive()) {
    throw new Error("423 Locked: Policy editing is currently frozen by SecOps. Unlock policy editing before modifying guardrails.");
  }
  const { orgId } = await getTenantContext();
  const db = getDb();
  const template = getPredefinedPolicy(templateId);
  if (!template) {
    throw new Error(`Policy template '${templateId}' not found.`);
  }

  try {
    const [newPolicy] = await db
      .insert(policies)
      .values({
        orgId,
        name: template.name,
        targetTool: template.targetTool,
        actionOnMatch: template.actionOnMatch,
        isActive: "true"
      })
      .returning();

    await db.insert(policyRules).values({
      policyId: newPolicy!.id,
      fieldPath: template.rule.fieldPath,
      operator: template.rule.operator,
      targetValue: template.rule.targetValue
    });
  } catch (err) {
    console.warn("[X4G4T DB Offline] Library deploy failed, DB not available:", err);
  }

  try {
    revalidatePath("/dashboard/policies");
  } catch {}
}

export async function updatePolicyAction(policyId: string, formData: FormData) {
  await assertAdminRole();
  if (isPolicyFreezeActive()) {
    throw new Error("423 Locked: Policy editing is currently frozen by SecOps. Unlock policy editing before modifying guardrails.");
  }
  const { orgId } = await getTenantContext();
  const db = getDb();

  const parsed = PolicyFormSchema.parse({
    name: formData.get("name"),
    targetTool: formData.get("targetTool"),
    actionOnMatch: formData.get("actionOnMatch"),
    fieldPath: formData.get("fieldPath"),
    operator: formData.get("operator"),
    targetValue: formData.get("targetValue")
  });

  try {
    await db
      .update(policies)
      .set({
        name: parsed.name,
        targetTool: parsed.targetTool,
        actionOnMatch: parsed.actionOnMatch,
        updatedAt: new Date()
      })
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)));

    await db
      .update(policyRules)
      .set({
        fieldPath: parsed.fieldPath,
        operator: parsed.operator,
        targetValue: parsed.targetValue
      })
      .where(eq(policyRules.policyId, policyId));
  } catch (err) {
    console.warn("[X4G4T DB Offline] Update policy failed:", err);
  }

  try {
    revalidatePath("/dashboard/policies");
  } catch {}
}

export async function togglePolicyAction(policyId: string, currentStatus: string): Promise<void> {
  await assertAdminRole();
  if (isPolicyFreezeActive()) {
    throw new Error("423 Locked: Policy editing is currently frozen by SecOps. Unlock policy editing before modifying guardrails.");
  }
  const { orgId } = await getTenantContext();
  const db = getDb();

  const nextStatus = currentStatus === "true" ? "false" : "true";

  try {
    await db
      .update(policies)
      .set({ isActive: nextStatus, updatedAt: new Date() })
      .where(and(eq(policies.id, policyId), eq(policies.orgId, orgId)));
  } catch (err) {
    console.warn("[X4G4T DB Offline] Toggle policy failed:", err);
  }

  try {
    revalidatePath("/dashboard/policies");
  } catch {}
}
