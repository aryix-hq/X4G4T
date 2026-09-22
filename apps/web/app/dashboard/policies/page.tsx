import { redirect } from "next/navigation";
import { getTenantContext, getDb } from "@/lib/tenant";
import { policies, policyRules } from "@x4g4t/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { PoliciesTabs, PolicyItem } from "./policies-tabs";
import { PREDEFINED_POLICY_LIBRARY, getGlobalAiLockdownDetails, getPolicyFreezeDetails } from "@x4g4t/policy-engine";
import { LockdownControl } from "./lockdown-control";

export default async function PoliciesPage() {
  const { orgId, role } = await getTenantContext();
  if (role !== "admin") {
    redirect("/dashboard");
  }
  const lockdown = getGlobalAiLockdownDetails();
  const policyFreeze = getPolicyFreezeDetails();

  // Admin View: Fetch policies and render full management console
  const db = getDb();
  let policyList: PolicyItem[] = [];

  try {
    policyList = await db
      .select({
        id: policies.id,
        name: policies.name,
        targetTool: policies.targetTool,
        actionOnMatch: policies.actionOnMatch,
        isActive: policies.isActive,
        ruleField: policyRules.fieldPath,
        ruleOperator: policyRules.operator,
        ruleTarget: policyRules.targetValue
      })
      .from(policies)
      .leftJoin(policyRules, eq(policies.id, policyRules.policyId))
      .where(and(eq(policies.orgId, orgId), isNull(policies.deletedAt)))
      .orderBy(desc(policies.createdAt));
  } catch (err) {
    policyList = [];
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-indigo-400" />
          Guardrail Policies
        </h1>
        <p className="text-sm text-slate-400">
          Deterministic security rules evaluated in &lt;1ms on every incoming autonomous agent tool execution.
        </p>
      </div>

      {/* Emergency Global AI Lockdown, Policy Freeze & RBAC Control */}
      <LockdownControl
        initialActive={lockdown.active}
        initialReason={lockdown.reason}
        updatedAt={lockdown.updatedAt}
        updatedBy={lockdown.updatedBy}
        initialFreezeActive={policyFreeze.active}
        initialFreezeReason={policyFreeze.reason}
        freezeUpdatedAt={policyFreeze.updatedAt}
        freezeUpdatedBy={policyFreeze.updatedBy}
        currentRole={role}
      />

      {/* Active Policies & Predefined Library */}
      <PoliciesTabs
        policyList={JSON.parse(JSON.stringify(policyList))}
        library={JSON.parse(JSON.stringify(PREDEFINED_POLICY_LIBRARY))}
        isPolicyFrozen={policyFreeze.active}
        freezeReason={policyFreeze.reason}
      />
    </div>
  );
}
