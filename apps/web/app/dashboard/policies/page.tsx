import { getTenantContext, getDb } from "@/lib/tenant";
import { policies, policyRules } from "@x4g4t/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { PoliciesTabs, PolicyItem } from "./policies-tabs";
import { PREDEFINED_POLICY_LIBRARY, getPolicyFreezeDetails } from "@x4g4t/policy-engine";
import { LockdownControl } from "./lockdown-control";
import { getEmergencyKillSwitchAction } from "@/app/actions";

export default async function PoliciesPage() {
  const { orgId, role } = await getTenantContext();
  const isAdmin = role === "admin";
  const killSwitch = await getEmergencyKillSwitchAction();
  const policyFreeze = getPolicyFreezeDetails();

  // Admin View: Fetch policies and render full management console
  const db = getDb();
  let policyList: PolicyItem[] = [];

  try {
    const rawList = await db
      .select({
        id: policies.id,
        name: policies.name,
        targetTool: policies.targetTool,
        actionOnMatch: policies.actionOnMatch,
        mode: policies.mode,
        matchLogic: policies.matchLogic,
        isActive: policies.isActive,
        ruleField: policyRules.fieldPath,
        ruleOperator: policyRules.operator,
        ruleTarget: policyRules.targetValue
      })
      .from(policies)
      .leftJoin(policyRules, eq(policies.id, policyRules.policyId))
      .where(and(eq(policies.orgId, orgId), isNull(policies.deletedAt)))
      .orderBy(desc(policies.createdAt));

    policyList = rawList.map((p) => ({
      ...p,
      mode: (p.mode as "ACTIVE" | "SHADOW_LEARN" | "DISABLED") || "ACTIVE",
      matchLogic: (p.matchLogic as "AND" | "OR") || "AND"
    }));
  } catch (err) {
    policyList = [];
  }

  if (policyList.length === 0) {
    policyList = [
      {
        id: "pol_sql_guard",
        name: "Catch Table Drops",
        targetTool: "run_sql_query",
        actionOnMatch: "BLOCK",
        mode: "ACTIVE",
        isActive: "true",
        ruleField: "query",
        ruleOperator: "REGEX",
        ruleTarget: "(?i)DROP\\s+TABLE"
      },
      {
        id: "pol_refund_ceiling",
        name: "Enforce Max Refund Threshold ($250)",
        targetTool: "issue_refund",
        actionOnMatch: "BLOCK",
        mode: "ACTIVE",
        isActive: "true",
        ruleField: "amount",
        ruleOperator: "GREATER_THAN",
        ruleTarget: "250"
      },
      {
        id: "pol_refund_guard",
        name: "High-Value Refund Sign-Off",
        targetTool: "issue_refund",
        actionOnMatch: "REQUIRE_APPROVAL",
        mode: "ACTIVE",
        isActive: "true",
        ruleField: "amount",
        ruleOperator: "GREATER_THAN",
        ruleTarget: "500"
      },
      {
        id: "pol_shadow_cloud_cap",
        name: "Candidate Cloud GPU Instance Cap",
        targetTool: "cloud_instance_provision",
        actionOnMatch: "BLOCK",
        mode: "SHADOW_LEARN",
        isActive: "true",
        ruleField: "instance_type",
        ruleOperator: "EQUALS",
        ruleTarget: "p4de.24xlarge"
      },
      {
        id: "pol_shadow_wire_hold",
        name: "Candidate Wire Transfer Gating",
        targetTool: "initiate_wire_transfer",
        actionOnMatch: "REQUIRE_APPROVAL",
        mode: "SHADOW_LEARN",
        isActive: "true",
        ruleField: "amount",
        ruleOperator: "GREATER_THAN_OR_EQUAL",
        ruleTarget: "10000"
      }
    ];
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
        initialActive={killSwitch.active}
        initialReason={killSwitch.reason}
        updatedAt={killSwitch.activatedAt}
        updatedBy={killSwitch.updatedBy || "SecOps Administrator"}
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
        isPolicyFrozen={policyFreeze.active || !isAdmin}
        freezeReason={!isAdmin ? "Viewing in read-only developer mode (Administrator credentials required to modify)" : policyFreeze.reason}
        isLockdownActive={killSwitch.active}
        lockdownReason={killSwitch.reason}
      />
    </div>
  );
}
