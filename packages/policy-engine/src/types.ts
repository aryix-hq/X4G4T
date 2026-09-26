import { z } from "zod";

export const RuleOperatorSchema = z.enum([
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
  "CONTAINS",
  "REGEX",
  "IN"
]);
export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

export const PolicyActionSchema = z.enum([
  "ALLOW",
  "BLOCK",
  "REQUIRE_APPROVAL"
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const PolicyModeSchema = z.enum([
  "ACTIVE",
  "SHADOW_LEARN",
  "DISABLED"
]);
export type PolicyMode = z.infer<typeof PolicyModeSchema>;

export interface CompiledRule {
  id: string;
  fieldPath: string; // Dot-path, e.g. "transaction.total" or "amount"
  operator: RuleOperator;
  targetValue: string; // Serialized target representation
}

export interface CompiledPolicy {
  id: string;
  name: string;
  targetTool: string; // Tool name, e.g. "issue_refund" or "*"
  actionOnMatch: PolicyAction;
  mode?: PolicyMode;
  rules: CompiledRule[];
}

export interface IamContext {
  userId?: string;
  email?: string;
  groups?: string[];
  roles?: string[];
  provider?: string;
  [key: string]: unknown;
}

export interface EvaluationContext {
  toolName: string;
  arguments: Record<string, unknown>;
  iam?: IamContext;
}

export interface ShadowEvaluation {
  policyId: string;
  policyName: string;
  wouldVerdict: PolicyAction;
  reason?: string;
}

export interface EvaluationResult {
  verdict: PolicyAction;
  matchedPolicyId?: string;
  violatingRuleId?: string;
  reason?: string;
  latencyMs: number;
  shadowResults?: ShadowEvaluation[];
}

export interface LogRecordToHash {
  id: string;
  previousRecordHash: string | null;
  toolName: string;
  verdict: string;
  createdAt: string | Date;
}

