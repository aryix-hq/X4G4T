import postgres from "postgres";
import { createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * ============================================================================
 * X4G4T Database Bootstrap & Seeding Script
 * ============================================================================
 * 1. Verifies connectivity to PostgreSQL (Neon, Supabase, RDS, or local).
 * 2. Idempotently initializes custom ENUM types, tables, and indexes.
 * 3. Seeds default demo organization, API key, and baseline guardrail policies.
 * 4. Outputs one-time secret API key for agent integration.
 * ============================================================================
 */

async function bootstrap() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("\n❌ ERROR: DATABASE_URL environment variable is not defined.");
    console.error("Please set DATABASE_URL in your .env or shell environment:\n");
    console.error('  export DATABASE_URL="postgres://user:pass@host:5432/x4g4t?sslmode=require"\n');
    process.exit(1);
  }

  console.log("\n🛡️  [X4G4T] Starting Database Bootstrap...");
  console.log(`Connecting to: ${connectionString.split("@")[1] || "PostgreSQL"}`);

  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. Verify connection
    const rows = await sql<{ now: Date }[]>`SELECT NOW() as now;`;
    const serverTime = rows[0]?.now ? rows[0].now.toISOString() : new Date().toISOString();
    console.log(`✅ Connected successfully to PostgreSQL engine (Server time: ${serverTime})`);

    // 2. Create Enums
    console.log("\n📦 Initializing Enums & Types...");
    await sql`
      DO $$ BEGIN
        CREATE TYPE policy_action AS ENUM ('ALLOW', 'BLOCK', 'REQUIRE_APPROVAL');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `;
    await sql`
      DO $$ BEGIN
        CREATE TYPE rule_operator AS ENUM (
          'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN',
          'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'REGEX', 'IN'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `;
    await sql`
      DO $$ BEGIN
        CREATE TYPE log_verdict AS ENUM ('PASSED', 'BLOCKED', 'HELD');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `;
    await sql`
      DO $$ BEGIN
        CREATE TYPE hitl_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `;
    console.log("✅ Custom Enums verified.");

    // 3. Create Tables
    console.log("\n📦 Initializing Relational Tables & Indexes...");

    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        stripe_customer_id TEXT,
        billing_status TEXT NOT NULL DEFAULT 'active',
        retention_days INTEGER NOT NULL DEFAULT 90,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        environment TEXT NOT NULL DEFAULT 'production',
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS api_keys_org_id_idx ON api_keys(org_id);
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_tool TEXT NOT NULL,
        is_active TEXT NOT NULL DEFAULT 'true',
        action_on_match policy_action NOT NULL DEFAULT 'BLOCK',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS policies_org_tool_idx ON policies(org_id, target_tool);
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS policy_rules (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        field_path TEXT NOT NULL,
        operator rule_operator NOT NULL,
        target_value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS policy_rules_policy_id_idx ON policy_rules(policy_id);
    `;

    await sql`
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS exec_logs_org_created_idx ON execution_logs(org_id, created_at DESC);
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS hitl_requests (
        id TEXT PRIMARY KEY,
        log_id TEXT NOT NULL REFERENCES execution_logs(id) ON DELETE CASCADE,
        status hitl_status NOT NULL DEFAULT 'PENDING',
        reviewer_id TEXT,
        resolution_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS hitl_requests_status_idx ON hitl_requests(status);
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS subject_encryption_keys (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        subject_id TEXT NOT NULL,
        key_cipher TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        destroyed_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS subject_keys_org_subject_idx ON subject_encryption_keys(org_id, subject_id);
    `;
    console.log("✅ All 7 tables and strategic indexes verified.");

    // 4. Seed Default Organization
    console.log("\n🌱 Seeding Default Organization & Baseline Guardrails...");
    const orgId = "org_demo_default";
    const orgSlug = "acme-corp-demo";

    const [existingOrg] = await sql`
      SELECT id FROM organizations WHERE slug = ${orgSlug} LIMIT 1;
    `;

    if (!existingOrg) {
      await sql`
        INSERT INTO organizations (id, name, slug, billing_status, retention_days)
        VALUES (${orgId}, 'Acme Corp (Demo)', ${orgSlug}, 'active', 90);
      `;
      console.log(`✅ Created default demo organization: 'Acme Corp (Demo)' [${orgId}]`);
    } else {
      console.log(`ℹ️  Default organization already exists [${existingOrg.id}]`);
    }

    // 5. Seed Initial API Key
    const rawSecret = randomBytes(24).toString("hex");
    const prefix = `sec_live_${rawSecret.slice(0, 6)}`;
    const fullKey = `${prefix}_${rawSecret.slice(6)}`;
    const keyHash = createHash("sha256").update(fullKey).digest("hex");
    const keyId = `key_${randomUUID().slice(0, 8)}`;

    const [existingKeys] = await sql`
      SELECT id FROM api_keys WHERE org_id = ${orgId} AND deleted_at IS NULL LIMIT 1;
    `;

    let generatedKeyToDisplay = fullKey;

    if (!existingKeys) {
      await sql`
        INSERT INTO api_keys (id, org_id, key_prefix, key_hash, environment)
        VALUES (${keyId}, ${orgId}, ${prefix}, ${keyHash}, 'production');
      `;
      console.log(`✅ Provisioned initial production API key: [${prefix}...]`);
    } else {
      generatedKeyToDisplay = "(Existing keys already active in database)";
      console.log("ℹ️  Active API key already present for demo organization.");
    }

    // 6. Seed Default Policies
    const polRefundId = "pol_refund_cap_demo";
    const [existingRefundPol] = await sql`SELECT id FROM policies WHERE id = ${polRefundId} LIMIT 1;`;
    if (!existingRefundPol) {
      await sql`
        INSERT INTO policies (id, org_id, name, target_tool, is_active, action_on_match)
        VALUES (${polRefundId}, ${orgId}, 'Enforce Max Refund Threshold ($250)', 'issue_refund', 'true', 'BLOCK');
      `;
      await sql`
        INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
        VALUES ('rule_refund_250', ${polRefundId}, 'amount', 'GREATER_THAN', '250');
      `;
      console.log("✅ Seeded Policy: 'Enforce Max Refund Threshold ($250)' -> BLOCK");
    }

    const polWireId = "pol_wire_approval_demo";
    const [existingWirePol] = await sql`SELECT id FROM policies WHERE id = ${polWireId} LIMIT 1;`;
    if (!existingWirePol) {
      await sql`
        INSERT INTO policies (id, org_id, name, target_tool, is_active, action_on_match)
        VALUES (${polWireId}, ${orgId}, 'High-Value Wire Transfer Sign-Off', 'wire_transfer', 'true', 'REQUIRE_APPROVAL');
      `;
      await sql`
        INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
        VALUES ('rule_wire_10k', ${polWireId}, 'amount', 'GREATER_THAN_OR_EQUAL', '10000');
      `;
      console.log("✅ Seeded Policy: 'High-Value Wire Transfer Sign-Off' -> REQUIRE_APPROVAL");
    }

    const polSqlId = "pol_sql_guard_demo";
    const [existingSqlPol] = await sql`SELECT id FROM policies WHERE id = ${polSqlId} LIMIT 1;`;
    if (!existingSqlPol) {
      await sql`
        INSERT INTO policies (id, org_id, name, target_tool, is_active, action_on_match)
        VALUES (${polSqlId}, ${orgId}, 'Block Destructive SQL Commands', 'execute_sql', 'true', 'BLOCK');
      `;
      await sql`
        INSERT INTO policy_rules (id, policy_id, field_path, operator, target_value)
        VALUES ('rule_sql_drop', ${polSqlId}, 'query', 'REGEX', '(?i)(DROP|TRUNCATE)\\s+TABLE');
      `;
      console.log("✅ Seeded Policy: 'Block Destructive SQL Commands' -> BLOCK");
    }

    console.log("\n==================================================================");
    console.log("🎉 [X4G4T] Database Bootstrap Completed Successfully!");
    console.log("==================================================================");
    console.log(`Tenant Org ID:   ${orgId}`);
    console.log(`Tenant Slug:     ${orgSlug}`);
    if (generatedKeyToDisplay.startsWith("sec_live_")) {
      console.log(`\n🔑 Initial API Key (Copy Now - Shown Once):\n`);
      console.log(`   ${generatedKeyToDisplay}\n`);
    } else {
      console.log(`API Key Status:  ${generatedKeyToDisplay}`);
    }
    console.log("Next Steps:");
    console.log("  1. Start the proxy:   pnpm --filter @x4g4t/proxy dev");
    console.log("  2. Start the web app: pnpm --filter @x4g4t/web dev");
    console.log("  3. Invoke gateway:    curl -H 'Authorization: Bearer <KEY>' http://localhost:4000/v1/gateway/execute");
    console.log("==================================================================\n");
  } catch (error) {
    console.error("\n❌ Database Bootstrap Failed with Error:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

bootstrap();

