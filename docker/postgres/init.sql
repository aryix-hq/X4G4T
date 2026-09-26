-- ============================================================================
-- X4G4T Enterprise PostgreSQL Auto-Bootstrap Schema DDL
-- Author: ARYIX (OPC) Private Limited • https://www.aryix.co.in/
-- ============================================================================

-- Create Enums if not exist
DO $$ BEGIN
    CREATE TYPE policy_action AS ENUM ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE rule_operator AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'REGEX', 'IN', 'CIDR_MATCH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE rule_operator ADD VALUE IF NOT EXISTS 'CIDR_MATCH';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE log_verdict AS ENUM ('PASSED', 'BLOCKED', 'HELD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE hitl_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE rate_limit_scope AS ENUM ('PER_USER', 'PER_IP', 'PER_ORG');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE rate_limit_window AS ENUM ('1_HOUR', '5_HOURS', '24_HOURS', '1_WEEK', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dlp_action AS ENUM ('BLOCK', 'REDACT', 'ALERT_ONLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT,
    billing_status TEXT NOT NULL DEFAULT 'active',
    retention_days INTEGER NOT NULL DEFAULT 90,
    kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
    kill_switch_activated_at TIMESTAMP WITH TIME ZONE,
    kill_switch_reason TEXT,
    kill_switch_two_factor_secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 2. API Keys
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL DEFAULT 'production',
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS api_keys_org_id_idx ON api_keys(org_id);

-- 3. Policies
CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_tool TEXT NOT NULL,
    is_active TEXT NOT NULL DEFAULT 'true',
    mode TEXT NOT NULL DEFAULT 'ACTIVE',
    action_on_match policy_action NOT NULL DEFAULT 'BLOCK',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS policies_org_tool_idx ON policies(org_id, target_tool);

-- 4. Policy Rules
CREATE TABLE IF NOT EXISTS policy_rules (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    field_path TEXT NOT NULL,
    operator rule_operator NOT NULL,
    target_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS policy_rules_policy_id_idx ON policy_rules(policy_id);

-- 5. Execution Logs
CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments JSONB NOT NULL,
    verdict log_verdict NOT NULL,
    triggered_policy_id TEXT REFERENCES policies(id) ON DELETE SET NULL,
    latency_ms INTEGER NOT NULL,
    previous_record_hash TEXT,
    record_hash TEXT,
    is_pii_redacted TEXT NOT NULL DEFAULT 'true',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS exec_logs_org_created_idx ON execution_logs(org_id, created_at);

-- 6. HITL Requests
CREATE TABLE IF NOT EXISTS hitl_requests (
    id TEXT PRIMARY KEY,
    log_id TEXT NOT NULL REFERENCES execution_logs(id) ON DELETE CASCADE,
    status hitl_status NOT NULL DEFAULT 'PENDING',
    reviewer_id TEXT,
    resolution_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS hitl_requests_status_idx ON hitl_requests(status);

-- 7. Subject Encryption Keys
CREATE TABLE IF NOT EXISTS subject_encryption_keys (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    key_cipher TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    destroyed_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS subject_keys_org_subject_idx ON subject_encryption_keys(org_id, subject_id);

-- 8. Rate Limit Policies
CREATE TABLE IF NOT EXISTS rate_limit_policies (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    window_size_seconds INTEGER NOT NULL,
    window_enum rate_limit_window NOT NULL DEFAULT '1_HOUR',
    max_requests INTEGER NOT NULL,
    max_tokens INTEGER,
    scope rate_limit_scope NOT NULL DEFAULT 'PER_USER',
    is_active TEXT NOT NULL DEFAULT 'true',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS rate_limit_org_idx ON rate_limit_policies(org_id);

-- 9. DLP Policies
CREATE TABLE IF NOT EXISTS dlp_policies (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    action dlp_action NOT NULL DEFAULT 'REDACT',
    detect_secrets TEXT NOT NULL DEFAULT 'true',
    detect_pii TEXT NOT NULL DEFAULT 'true',
    custom_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active TEXT NOT NULL DEFAULT 'true',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS dlp_policies_org_idx ON dlp_policies(org_id);

-- 10. Upstream Custom & Local LLM Provider Endpoints
CREATE TABLE IF NOT EXISTS upstream_providers (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_token TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS providers_org_idx ON upstream_providers(org_id);

-- 11. Policy Recommendations (ML Log Mining)
CREATE TABLE IF NOT EXISTS policy_recommendations (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_tool TEXT NOT NULL,
    field_path TEXT NOT NULL,
    suggested_operator TEXT NOT NULL,
    suggested_target_value TEXT NOT NULL,
    confidence_score DOUBLE PRECISION NOT NULL,
    reasoning TEXT NOT NULL,
    sample_size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recommendations_org_status_idx ON policy_recommendations(org_id, status);

-- 12. Shadow Analytics Aggregates (Hourly rollups)
CREATE TABLE IF NOT EXISTS shadow_metrics (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    bucket_hour TIMESTAMP WITH TIME ZONE NOT NULL,
    total_evaluated INTEGER NOT NULL DEFAULT 0,
    would_have_blocked INTEGER NOT NULL DEFAULT 0,
    would_have_passed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shadow_metrics_policy_bucket_idx ON shadow_metrics(policy_id, bucket_hour);

-- ============================================================================
-- Seed Default Organization, Keys, and Policies
-- ============================================================================

INSERT INTO organizations (id, name, slug, kill_switch_active, kill_switch_two_factor_secret)
VALUES ('org_default_x4g4t', 'X4G4T Defense Systems', 'x4g4t-defense', FALSE, '774411')
ON CONFLICT (id) DO UPDATE SET 
  kill_switch_active = EXCLUDED.kill_switch_active,
  kill_switch_two_factor_secret = EXCLUDED.kill_switch_two_factor_secret;

-- Seed API Key: sec_live_dev_key_12345678901234567890
INSERT INTO api_keys (id, org_id, key_prefix, key_hash, environment)
VALUES ('key_seed_default', 'org_default_x4g4t', 'sec_live_dev_key', '6d9e592d6da6319ac750504c550a9c1543c1490aa2590c44df620a32f19f3d82', 'production')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 1 (ACTIVE): Block SQL Table Drops
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_sql_guard', 'org_default_x4g4t', 'Catch Table Drops', 'run_sql_query', 'true', 'ACTIVE', 'BLOCK')
ON CONFLICT (id) DO UPDATE SET mode = 'ACTIVE';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_sql_drop', 'pol_sql_guard', 'query', 'REGEX', '(?i)DROP\s+TABLE')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 2 (ACTIVE): Max Refund Ceiling ($250)
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_refund_ceiling', 'org_default_x4g4t', 'Enforce Max Refund Threshold ($250)', 'issue_refund', 'true', 'ACTIVE', 'BLOCK')
ON CONFLICT (id) DO UPDATE SET mode = 'ACTIVE';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_refund_ceiling', 'pol_refund_ceiling', 'amount', 'GREATER_THAN', '250')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 3 (ACTIVE): Human Sign-Off for High Refunds ($100+)
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_refund_guard', 'org_default_x4g4t', 'High-Value Refund Sign-Off ($100+)', 'issue_refund', 'true', 'ACTIVE', 'REQUIRE_APPROVAL')
ON CONFLICT (id) DO UPDATE SET mode = 'ACTIVE';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_refund_amount', 'pol_refund_guard', 'amount', 'GREATER_THAN', '100')
ON CONFLICT (id) DO UPDATE SET target_value = '100';

-- Seed Policy 3b (ACTIVE): Wire Transfer Human Sign-Off
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_wire_hitl', 'org_default_x4g4t', 'Wire Transfer Dual Authorization ($500+)', 'initiate_wire_transfer', 'true', 'ACTIVE', 'REQUIRE_APPROVAL')
ON CONFLICT (id) DO UPDATE SET mode = 'ACTIVE';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_wire_hitl', 'pol_wire_hitl', 'amount', 'GREATER_THAN', '500')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 4 (SHADOW_LEARN): Candidate Cloud GPU Instance Cap
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_shadow_cloud_cap', 'org_default_x4g4t', 'Candidate Cloud GPU Instance Cap', 'cloud_instance_provision', 'true', 'SHADOW_LEARN', 'BLOCK')
ON CONFLICT (id) DO UPDATE SET mode = 'SHADOW_LEARN';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_shadow_gpu', 'pol_shadow_cloud_cap', 'instance_type', 'EQUALS', 'p4de.24xlarge')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 5 (SHADOW_LEARN): Candidate High-Value Wire Gate ($10k)
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_shadow_wire_hold', 'org_default_x4g4t', 'Candidate Wire Transfer Gating', 'initiate_wire_transfer', 'true', 'SHADOW_LEARN', 'REQUIRE_APPROVAL')
ON CONFLICT (id) DO UPDATE SET mode = 'SHADOW_LEARN';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_shadow_wire', 'pol_shadow_wire_hold', 'amount', 'GREATER_THAN_OR_EQUAL', '10000')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 5b (SHADOW_LEARN): Candidate Cloud Node Cap (Threshold > 10)
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_shadow_node_cap', 'org_default_x4g4t', 'Candidate Cloud Node Provisioning Cap (Threshold > 10)', 'cloud_instance_provision', 'true', 'SHADOW_LEARN', 'BLOCK')
ON CONFLICT (id) DO UPDATE SET mode = 'SHADOW_LEARN';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_shadow_node_limit', 'pol_shadow_node_cap', 'nodes', 'GREATER_THAN', '10')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 5c (ACTIVE): Network CIDR Match Guardrail (pol_cidr_guard)
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_cidr_guard', 'org_default_x4g4t', 'Network Untrusted CIDR Perimeter Block', 'cidr_drill_tool', 'true', 'ACTIVE', 'BLOCK')
ON CONFLICT (id) DO UPDATE SET mode = 'ACTIVE';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_cidr_match', 'pol_cidr_guard', 'network.source_ip', 'CIDR_MATCH', '198.51.100.0/24')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 5d (ACTIVE): Advanced Multi-Rule Boolean Guardrail (pol_adv_multi_guard)
INSERT INTO policies (id, org_id, name, target_tool, is_active, mode, action_on_match)
VALUES ('pol_adv_multi_guard', 'org_default_x4g4t', 'Advanced Multi-Rule Financial Guard (USD > $200)', 'adv_refund_tool', 'true', 'ACTIVE', 'BLOCK')
ON CONFLICT (id) DO UPDATE SET mode = 'ACTIVE';

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES 
  ('rule_adv_multi_amount', 'pol_adv_multi_guard', 'amount', 'GREATER_THAN', '200'),
  ('rule_adv_multi_currency', 'pol_adv_multi_guard', 'currency', 'EQUALS', 'USD')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 6 (Rate Limit)
INSERT INTO rate_limit_policies (id, org_id, name, window_size_seconds, window_enum, max_requests, scope)
VALUES ('pol_rate_limit_default', 'org_default_x4g4t', 'Enterprise Sliding Window', 3600, '1_HOUR', 10000, 'PER_USER')
ON CONFLICT (id) DO UPDATE SET max_requests = 10000;

-- Seed Policy 7 (DLP)
INSERT INTO dlp_policies (id, org_id, name, action, detect_secrets, detect_pii)
VALUES ('pol_dlp_default', 'org_default_x4g4t', 'Enterprise DLP Sanitization', 'REDACT', 'true', 'true')
ON CONFLICT (id) DO NOTHING;

-- Seed Upstream Providers (Local & Sovereign LLMs)
INSERT INTO upstream_providers (id, org_id, name, provider_type, base_url, is_internal, is_active)
VALUES 
  ('prov_ollama_local', 'org_default_x4g4t', 'On-Premises Ollama Inference Cluster', 'OLLAMA', 'http://ollama:11434', TRUE, TRUE),
  ('prov_vllm_prod', 'org_default_x4g4t', 'vLLM High-Throughput Production Node', 'OPENAI_COMPATIBLE', 'http://vllm:8000', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed ML Recommendations (Mined from historical audit logs)
INSERT INTO policy_recommendations (id, org_id, target_tool, field_path, suggested_operator, suggested_target_value, confidence_score, reasoning, sample_size, status)
VALUES
  ('rec_seed_refund', 'org_default_x4g4t', 'issue_refund', 'amount', 'LESS_THAN_OR_EQUAL', '175', 0.98, '99.2% of observed executions for tool ''issue_refund'' have amount <= 150. Proposing ceiling of 175 (+15% safety buffer) to prevent accidental over-refund mutations.', 1420, 'PENDING'),
  ('rec_seed_export', 'org_default_x4g4t', 'export_customer_data', 'format', 'IN', 'csv,json', 0.95, '100% of executions query format in (csv, json). Suggesting whitelist rule to block unexpected binary or raw SQL dump formats.', 850, 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- Seed Shadow Metrics (Historical Rollups for drift charting)
INSERT INTO shadow_metrics (id, policy_id, org_id, bucket_hour, total_evaluated, would_have_blocked, would_have_passed)
VALUES
  ('sm_1', 'pol_shadow_cloud_cap', 'org_default_x4g4t', NOW() - INTERVAL '3 hour', 42, 2, 40),
  ('sm_2', 'pol_shadow_cloud_cap', 'org_default_x4g4t', NOW() - INTERVAL '2 hour', 58, 3, 55),
  ('sm_3', 'pol_shadow_cloud_cap', 'org_default_x4g4t', NOW() - INTERVAL '1 hour', 75, 4, 71)
ON CONFLICT (id) DO NOTHING;
