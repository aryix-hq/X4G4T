import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  integer,
  boolean,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const policyActionEnum = pgEnum("policy_action", [
  "ALLOW",
  "BLOCK",
  "REQUIRE_APPROVAL"
]);

export const ruleOperatorEnum = pgEnum("rule_operator", [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
  "CONTAINS",
  "REGEX",
  "IN",
  "CIDR_MATCH"
]);

export const logVerdictEnum = pgEnum("log_verdict", [
  "PASSED",
  "BLOCKED",
  "HELD"
]);

export const hitlStatusEnum = pgEnum("hitl_status", [
  "PENDING",
  "APPROVED",
  "REJECTED"
]);

export const rateLimitScopeEnum = pgEnum("rate_limit_scope", [
  "PER_USER",
  "PER_IP",
  "PER_ORG"
]);

export const rateLimitWindowEnum = pgEnum("rate_limit_window", [
  "1_HOUR",
  "5_HOURS",
  "24_HOURS",
  "1_WEEK",
  "CUSTOM"
]);

export const dlpActionEnum = pgEnum("dlp_action", [
  "BLOCK",
  "REDACT",
  "ALERT_ONLY"
]);

// ============================================================================
// Tables
// ============================================================================

// 1. Organizations (Tenancy Root with Data Minimization Retention)
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  billingStatus: text("billing_status").default("active").notNull(),
  retentionDays: integer("retention_days").default(90).notNull(), // GDPR Art. 5(1)(e) & DPDP Sec. 8(7)
  killSwitchActive: boolean("kill_switch_active").default(false).notNull(),
  killSwitchActivatedAt: timestamp("kill_switch_activated_at", { withTimezone: true }),
  killSwitchReason: text("kill_switch_reason"),
  killSwitchTwoFactorSecret: text("kill_switch_two_factor_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
});

// 2. API Keys (Hashed Storage)
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  keyPrefix: text("key_prefix").notNull(), // e.g. sec_live_9a1b
  keyHash: text("key_hash").notNull().unique(), // SHA-256 hash of raw secret
  environment: text("environment").default("production").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (t) => [
  uniqueIndex("api_keys_hash_idx").on(t.keyHash),
  index("api_keys_org_id_idx").on(t.orgId)
]);

// 3. Policies (Tool-Level Rule Containers)
export const policies = pgTable("policies", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetTool: text("target_tool").notNull(), // e.g., "issue_refund" or "*"
  isActive: text("is_active").default("true").notNull(),
  mode: text("mode").default("ACTIVE").notNull(), // 'ACTIVE' | 'SHADOW_LEARN' | 'DISABLED'
  matchLogic: text("match_logic").default("AND").notNull(), // 'AND' (all rules must match) | 'OR' (any rule matches)
  actionOnMatch: policyActionEnum("action_on_match").default("BLOCK").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (t) => [
  index("policies_org_tool_idx").on(t.orgId, t.targetTool)
]);

// 4. Policy Rules (Field-Level Constraints)
export const policyRules = pgTable("policy_rules", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  policyId: text("policy_id")
    .notNull()
    .references(() => policies.id, { onDelete: "cascade" }),
  fieldPath: text("field_path").notNull(), // Dot-path: "amount" or "transaction.total"
  operator: ruleOperatorEnum("operator").notNull(),
  targetValue: text("target_value").notNull(), // Evaluated dynamically against actual value
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => [
  index("policy_rules_policy_id_idx").on(t.policyId)
]);

// 5. Execution Logs (Immutable Append-Only Audit Stream with ISO 27001 Cryptographic Hash Chain)
export const executionLogs = pgTable("execution_logs", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Traceability & Origin Fields
  agentId: text("agent_id").notNull(),
  userEmail: text("user_email"),
  userName: text("user_name"),
  clientIp: text("client_ip"),
  clientHostname: text("client_hostname"),
  sessionId: text("session_id"),

  // Execution Context
  toolName: text("tool_name").notNull(),
  arguments: jsonb("arguments").notNull(),
  verdict: logVerdictEnum("verdict").notNull(),
  triggeredPolicyId: text("triggered_policy_id").references(() => policies.id, { onDelete: "set null" }),

  // Streaming & Performance Telemetry
  isStreaming: boolean("is_streaming").default(false),
  timeToFirstTokenMs: integer("ttft_ms"),
  totalTokens: integer("total_tokens"),
  latencyMs: integer("latency_ms").notNull(),

  // Tamper-Evident Chaining & Compliance
  previousRecordHash: text("previous_record_hash"), // ISO 27001 A.8.15 Tamper-Evident Chaining
  recordHash: text("record_hash"),                 // SHA-256(id + prevHash + tool + verdict + ts)
  isPiiRedacted: text("is_pii_redacted").default("true").notNull(), // GDPR Art. 25 & DPDP Sec. 8
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => [
  index("exec_logs_org_created_idx").on(t.orgId, t.createdAt),
  index("exec_logs_user_email_idx").on(t.orgId, t.userEmail),
  index("exec_logs_client_ip_idx").on(t.clientIp)
]);

// 6. HITL Requests (Human Intervention Holds)
export const hitlRequests = pgTable("hitl_requests", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  logId: text("log_id")
    .notNull()
    .references(() => executionLogs.id, { onDelete: "cascade" }),
  status: hitlStatusEnum("status").default("PENDING").notNull(),
  reviewerId: text("reviewer_id"),
  resolutionReason: text("resolution_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, (t) => [
  index("hitl_requests_status_idx").on(t.status)
]);

// 7. Subject Encryption Keys (GDPR Art. 17 & India DPDP Sec. 12 Crypto-Shredding Registry)
export const subjectEncryptionKeys = pgTable("subject_encryption_keys", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  subjectId: text("subject_id").notNull(), // Data principal identity identifier or hash
  keyCipher: text("key_cipher").notNull(), // Master-key / KMS encrypted AES-256 key
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  destroyedAt: timestamp("destroyed_at", { withTimezone: true }) // Set upon Right to Erasure request
}, (t) => [
  uniqueIndex("subject_keys_org_subject_idx").on(t.orgId, t.subjectId)
]);

// 8. Rate Limit Policies (Sliding / Fixed Window Request & Token Quotas)
export const rateLimitPolicies = pgTable("rate_limit_policies", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  windowSizeSeconds: integer("window_size_seconds").notNull(), // 3600, 18000, 86400, 604800, or custom seconds
  windowEnum: rateLimitWindowEnum("window_enum").default("1_HOUR").notNull(),
  maxRequests: integer("max_requests").notNull(), // e.g. 50 requests
  maxTokens: integer("max_tokens"), // optional token limit
  scope: rateLimitScopeEnum("scope").default("PER_USER").notNull(),
  isActive: text("is_active").default("true").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (t) => [
  index("rate_limit_org_idx").on(t.orgId)
]);

// 9. DLP Policies (Enterprise Data Leakage Prevention & Sanitization)
export const dlpPolicies = pgTable("dlp_policies", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  action: dlpActionEnum("action").default("REDACT").notNull(),
  detectSecrets: text("detect_secrets").default("true").notNull(),
  detectPii: text("detect_pii").default("true").notNull(),
  customKeywords: jsonb("custom_keywords").$type<string[]>().default([]).notNull(),
  isActive: text("is_active").default("true").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (t) => [
  index("dlp_policies_org_idx").on(t.orgId)
]);

// 10. Custom & In-House LLM Provider Endpoints (Ollama, vLLM, LocalAI, TGI)
export const upstreamProviders = pgTable("upstream_providers", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "On-Prem Ollama Cluster", "vLLM Production"
  providerType: text("provider_type").notNull(), // "OLLAMA" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "CUSTOM"
  baseUrl: text("base_url").notNull(), // e.g. "http://10.0.0.50:11434" or "http://vllm.internal:8000"
  authToken: text("auth_token"), // Optional encrypted key/bearer
  isInternal: boolean("is_internal").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => [
  index("providers_org_idx").on(t.orgId)
]);

// 11. ML Policy Recommendations (Discovered guardrails from execution history)
export const policyRecommendations = pgTable("policy_recommendations", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  targetTool: text("target_tool").notNull(),
  fieldPath: text("field_path").notNull(),
  suggestedOperator: text("suggested_operator").notNull(),
  suggestedTargetValue: text("suggested_target_value").notNull(),
  confidenceScore: doublePrecision("confidence_score").notNull(), // e.g. 0.98
  reasoning: text("reasoning").notNull(),
  sampleSize: integer("sample_size").notNull(),
  status: text("status").default("PENDING").notNull(), // "PENDING" | "ACCEPTED" | "DISMISSED"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => [
  index("recommendations_org_status_idx").on(t.orgId, t.status)
]);

// 12. Shadow Analytics Aggregates (Hourly rollups for fast charting)
export const shadowMetrics = pgTable("shadow_metrics", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  policyId: text("policy_id").notNull(),
  orgId: text("org_id").notNull(),
  bucketHour: timestamp("bucket_hour", { withTimezone: true }).notNull(),
  totalEvaluated: integer("total_evaluated").default(0).notNull(),
  wouldHaveBlocked: integer("would_have_blocked").default(0).notNull(),
  wouldHavePassed: integer("would_have_passed").default(0).notNull()
}, (t) => [
  index("shadow_metrics_policy_bucket_idx").on(t.policyId, t.bucketHour)
]);

// ============================================================================
// Relations
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  apiKeys: many(apiKeys),
  policies: many(policies),
  executionLogs: many(executionLogs),
  subjectEncryptionKeys: many(subjectEncryptionKeys),
  rateLimitPolicies: many(rateLimitPolicies),
  dlpPolicies: many(dlpPolicies),
  upstreamProviders: many(upstreamProviders),
  policyRecommendations: many(policyRecommendations),
  shadowMetrics: many(shadowMetrics)
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id]
  })
}));

export const policiesRelations = relations(policies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [policies.orgId],
    references: [organizations.id]
  }),
  rules: many(policyRules),
  executionLogs: many(executionLogs)
}));

export const policyRulesRelations = relations(policyRules, ({ one }) => ({
  policy: one(policies, {
    fields: [policyRules.policyId],
    references: [policies.id]
  })
}));

export const executionLogsRelations = relations(executionLogs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [executionLogs.orgId],
    references: [organizations.id]
  }),
  policy: one(policies, {
    fields: [executionLogs.triggeredPolicyId],
    references: [policies.id]
  }),
  hitlRequests: many(hitlRequests)
}));

export const hitlRequestsRelations = relations(hitlRequests, ({ one }) => ({
  executionLog: one(executionLogs, {
    fields: [hitlRequests.logId],
    references: [executionLogs.id]
  })
}));

export const subjectEncryptionKeysRelations = relations(subjectEncryptionKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [subjectEncryptionKeys.orgId],
    references: [organizations.id]
  })
}));

export const rateLimitPoliciesRelations = relations(rateLimitPolicies, ({ one }) => ({
  organization: one(organizations, {
    fields: [rateLimitPolicies.orgId],
    references: [organizations.id]
  })
}));

export const dlpPoliciesRelations = relations(dlpPolicies, ({ one }) => ({
  organization: one(organizations, {
    fields: [dlpPolicies.orgId],
    references: [organizations.id]
  })
}));

export const upstreamProvidersRelations = relations(upstreamProviders, ({ one }) => ({
  organization: one(organizations, {
    fields: [upstreamProviders.orgId],
    references: [organizations.id]
  })
}));

export const policyRecommendationsRelations = relations(policyRecommendations, ({ one }) => ({
  organization: one(organizations, {
    fields: [policyRecommendations.orgId],
    references: [organizations.id]
  })
}));

export const shadowMetricsRelations = relations(shadowMetrics, ({ one }) => ({
  organization: one(organizations, {
    fields: [shadowMetrics.orgId],
    references: [organizations.id]
  })
}));
