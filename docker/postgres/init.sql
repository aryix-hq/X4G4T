-- ============================================================================
-- X4G4T Enterprise PostgreSQL Auto-Bootstrap Schema DDL
-- ============================================================================

-- Create Enums if not exist
DO $$ BEGIN
    CREATE TYPE policy_action AS ENUM ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE rule_operator AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'REGEX', 'IN');
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

-- ============================================================================
-- Seed Default Organization, Keys, and Policies
-- ============================================================================

INSERT INTO organizations (id, name, slug)
VALUES ('org_default_x4g4t', 'X4G4T Defense Systems', 'x4g4t-defense')
ON CONFLICT (id) DO NOTHING;

-- Seed API Key: sec_live_dev_key_12345678901234567890
INSERT INTO api_keys (id, org_id, key_prefix, key_hash, environment)
VALUES ('key_seed_default', 'org_default_x4g4t', 'sec_live_dev_key', '6d9e592d6da6319ac750504c550a9c1543c1490aa2590c44df620a32f19f3d82', 'production')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 1: Block SQL Table Drops
INSERT INTO policies (id, org_id, name, target_tool, action_on_match)
VALUES ('pol_sql_guard', 'org_default_x4g4t', 'Catch Table Drops', 'run_sql_query', 'BLOCK')
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_sql_drop', 'pol_sql_guard', 'query', 'REGEX', '(?i)DROP\s+TABLE')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 2: Human Sign-Off for High Refunds
INSERT INTO policies (id, org_id, name, target_tool, action_on_match)
VALUES ('pol_refund_guard', 'org_default_x4g4t', 'High-Value Refund Sign-Off', 'issue_refund', 'REQUIRE_APPROVAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
VALUES ('rule_refund_amount', 'pol_refund_guard', 'amount', 'GREATER_THAN', '500')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 3: Rate Limiting
INSERT INTO rate_limit_policies (id, org_id, name, window_size_seconds, window_enum, max_requests, scope)
VALUES ('pol_rate_limit_default', 'org_default_x4g4t', 'Enterprise Sliding Window', 3600, '1_HOUR', 100, 'PER_USER')
ON CONFLICT (id) DO NOTHING;

-- Seed Policy 4: DLP
INSERT INTO dlp_policies (id, org_id, name, action, detect_secrets, detect_pii)
VALUES ('pol_dlp_default', 'org_default_x4g4t', 'Enterprise DLP Sanitization', 'REDACT', 'true', 'true')
ON CONFLICT (id) DO NOTHING;

