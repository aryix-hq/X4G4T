# X4G4T Policy Template Catalog

> **Enterprise Guardrail Library for Autonomous AI Agents & MCP Gateways**  
> *Pre-configured, battle-tested policy templates for real-time (<15ms) deterministic runtime enforcement.*

---

## Table of Contents

1. [Overview & Policy Architecture](#1-overview--policy-architecture)
2. [Quick Reference Matrix](#2-quick-reference-matrix)
3. [Financial & Payment Safeguards](#3-financial--payment-safeguards)
   - [3.1 Refund Cap ($250)](#31-refund-cap-250)
   - [3.2 High-Value Wire Transfer Sign-Off ($10,000)](#32-high-value-wire-transfer-sign-off-10000)
   - [3.3 Currency Whitelist Enforcement](#33-currency-whitelist-enforcement)
4. [Database & Data Loss Prevention (DLP)](#4-database--data-loss-prevention-dlp)
   - [4.1 Destructive SQL Guard (DROP / TRUNCATE / ALTER)](#41-destructive-sql-guard-drop--truncate--alter)
   - [4.2 Unbounded Database Query Limiter](#42-unbounded-database-query-limiter)
   - [4.3 PII Social Security Number (SSN) Blocker](#43-pii-social-security-number-ssn-blocker)
5. [Cloud, DevOps & Infrastructure Safety](#5-cloud-devops--infrastructure-safety)
   - [5.1 Block Public S3 Storage Bucket](#51-block-public-s3-storage-bucket)
   - [5.2 Protect Kubernetes Production Namespace](#52-protect-kubernetes-production-namespace)
   - [5.3 Production Compute Termination Gate](#53-production-compute-termination-gate)
6. [CRM & Customer Communications](#6-crm--customer-communications)
   - [6.1 Bulk Email Blast Gate (>50 Recipients)](#61-bulk-email-blast-gate-50-recipients)
   - [6.2 VIP / Enterprise Customer Modification Gate](#62-vip--enterprise-customer-modification-gate)
   - [6.3 Mass User Deletion Limit](#63-mass-user-deletion-limit)
7. [How to Apply Templates](#7-how-to-apply-templates)
   - [Option A: 1-Click UI Selection (X4G4T Dashboard)](#option-a-1-click-ui-selection-x4g4t-dashboard)
   - [Option B: Programmatic Database Seeding](#option-b-programmatic-database-seeding)
   - [Option C: REST API / Gateway Ingestion](#option-c-rest-api--gateway-ingestion)

---

## 1. Overview & Policy Architecture

X4G4T operates as an inline, fail-closed firewall situated between autonomous AI agents (e.g. Claude Code, Cursor, LangChain, AutoGPT) and internal tools or MCP (Model Context Protocol) servers. 

Every tool call payload is evaluated against an Abstract Syntax Tree (AST) compiled from policy rules:
- **Evaluation Latency**: $<0.00012\,\text{ms}$ ($0.12\,\mu\text{s}$) pure in-memory AST traversal.
- **Fail-Closed Guarantee**: Any malformed payload, missing critical argument, or syntax anomaly fails closed (`BLOCK`).
- **Enforcement Actions**:
  - `ALLOW`: The tool invocation proceeds immediately to upstream execution.
  - `BLOCK`: Execution is halted synchronously; an audit violation log is committed.
  - `REQUIRE_APPROVAL`: Execution is placed into a pending state (`HOLD`), triggering a Slack / Teams Human-in-the-Loop (HITL) notification with signed HMAC-SHA256 action buttons.

---

## 2. Quick Reference Matrix

| Template Name | Category | Target Tool | Operator | Action | Business Objective |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OpenAI Authorized Models** | AI Providers | `openai_chat_completion` | `NOT_IN` | `BLOCK` | Restrict agents to approved OpenAI models (`gpt-4o`, `gpt-4o-mini`). |
| **Gemini Grounding Guard** | AI Providers | `gemini_generate_content` | `NOT_EQUALS` | `BLOCK` | Enforce factual grounding on enterprise Gemini agents. |
| **Claude Production Sign-off** | AI Providers | `anthropic_messages` | `EQUALS` | `REQUIRE_APPROVAL` | Require human review before deploying Claude Sonnet 3.5 in prod. |
| **Ollama Local Air-Gap** | AI Providers | `ollama_generate` | `NOT_CONTAINS` | `BLOCK` | Prevent air-gapped agents from querying remote endpoints. |
| **Max Token Budget Cap** | Spend Control | `*` (All LLM Tools) | `GREATER_THAN` | `BLOCK` | Prevent runaway recursion from consuming $>8,000$ tokens. |
| **Estimated Cost Gate ($1.50)** | Spend Control | `*` (All Tools) | `GREATER_THAN` | `REQUIRE_APPROVAL` | Human sign-off on expensive operations exceeding $1.50. |
| **Agent Monthly Quota Alert** | Spend Control | `*` (All Tools) | `GREATER_THAN` | `REQUIRE_APPROVAL` | Alert and hold when agent monthly spend crosses budget cap. |
| **Engineering Role Deployments**| IAM & Access | `deploy_service` | `NOT_CONTAINS` | `BLOCK` | Enforce that only `engineering` IAM role can trigger deployments. |
| **Finance Group Wire Transfers** | IAM & Access | `wire_transfer` | `NOT_CONTAINS` | `BLOCK` | Restrict financial mutations to members of `finance-team` IAM group. |
| **Refund Cap ($250)** | Fintech | `issue_refund` | `GREATER_THAN` | `BLOCK` | Prevent agent hallucination from issuing unauthorized large refunds. |
| **Large Wire Gate ($10k)** | Fintech | `wire_transfer` | `GREATER_THAN_OR_EQUAL` | `REQUIRE_APPROVAL` | Enforce human dual-control on significant financial movements. |
| **Currency Whitelist** | Fintech | `create_payment` | `NOT_EQUALS` | `BLOCK` | Prevent accidental forex or unsupported currency exposure. |
| **Destructive SQL Guard** | Security | `execute_sql` | `REGEX` | `BLOCK` | Block schema deletions, table truncations, or drop statements. |
| **Mass User Deletion Gate** | Security | `delete_users` | `GREATER_THAN` | `REQUIRE_APPROVAL` | Require executive review before bulk-deleting accounts. |
| **Block Public S3 Bucket** | DevOps | `create_s3_bucket` | `EQUALS` | `BLOCK` | Enforce cloud security posture against accidental data leaks. |
| **Protect K8s Production** | DevOps | `kubectl_delete` | `EQUALS` | `REQUIRE_APPROVAL` | Prevent agents from deleting pods/deployments in production. |
| **Bulk Email Gate (>50)** | CRM | `send_email_campaign`| `GREATER_THAN` | `REQUIRE_APPROVAL` | Prevent unsolicited spam or mass marketing communication blasts. |
| **VIP Customer Gate** | CRM | `modify_customer` | `EQUALS` | `REQUIRE_APPROVAL` | Safeguard Tier-1 enterprise customer records from automated alteration. |
| **PII SSN Pattern Block** | Compliance | `*` (All Tools) | `REGEX` | `BLOCK` | Block inadvertent transmission of US Social Security Numbers. |

---

## 3. Financial & Payment Safeguards

### 3.1 Refund Cap ($250)
* **Goal**: Prevent autonomous customer support agents from refunding orders greater than standard tier allowances without human supervisor sign-off.
* **Target Tool**: `issue_refund`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "amount",
  "operator": "GREATER_THAN",
  "value": 250
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "issue_refund",
  "arguments": {
    "order_id": "ord_99812",
    "amount": 350.00,
    "reason": "Customer reported damaged packaging"
  }
}
```
* **Result**: `BLOCK` — Agent receives `403 Forbidden: Policy violation [Enforce Max Refund Threshold ($250)]`.

---

### 3.2 High-Value Wire Transfer Sign-Off ($10,000)
* **Goal**: Require a human finance officer to approve all wire transfers at or above $10,000 via Slack interactive buttons before funds leave corporate accounts.
* **Target Tool**: `wire_transfer`
* **Action**: `REQUIRE_APPROVAL`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "amount",
  "operator": "GREATER_THAN_OR_EQUAL",
  "value": 10000
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "wire_transfer",
  "arguments": {
    "beneficiary": "Acme Global Logistics LLC",
    "routing_number": "021000021",
    "account_number": "9876543210",
    "amount": 15000.00,
    "memo": "Quarterly vendor milestone disbursement"
  }
}
```
* **Result**: `REQUIRE_APPROVAL` — Fastify/Vercel proxy responds with status `PENDING_APPROVAL`, fires a Slack webhook to `#ops-approvals`, and awaits HMAC-signed supervisor sign-off.

---

### 3.3 Currency Whitelist Enforcement
* **Goal**: Prevent agents operating in domestic markets from disbursing transactions in foreign or non-standard currencies.
* **Target Tool**: `create_payment`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "currency",
  "operator": "NOT_EQUALS",
  "value": "USD"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "create_payment",
  "arguments": {
    "vendor": "EuroTech Solutions",
    "amount": 450,
    "currency": "EUR"
  }
}
```
* **Result**: `BLOCK` — Disallowed currency detected.

---

## 4. Database & Data Loss Prevention (DLP)

### 4.1 Destructive SQL Guard (DROP / TRUNCATE / ALTER)
* **Goal**: Prevent database management agents or text-to-SQL agents from dropping tables, modifying schema definitions, or wiping production datasets.
* **Target Tool**: `execute_sql`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "query",
  "operator": "REGEX",
  "value": "(?i)(DROP|TRUNCATE|ALTER)\\s+TABLE"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "execute_sql",
  "arguments": {
    "database": "production_analytics",
    "query": "DROP TABLE temp_customer_leads;"
  }
}
```
* **Result**: `BLOCK` — Catastrophic DDL query intercepted and blocked.

---

### 4.2 Unbounded Database Query Limiter
* **Goal**: Prevent agents from executing unbounded `SELECT` statements that could exhaust database connection pools or exfiltrate millions of rows.
* **Target Tool**: `execute_sql`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "query",
  "operator": "REGEX",
  "value": "(?i)SELECT\\s+.*\\s+FROM\\s+(?!.*LIMIT\\s+\\d+).*"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "execute_sql",
  "arguments": {
    "database": "core_users",
    "query": "SELECT * FROM users"
  }
}
```
* **Result**: `BLOCK` — Queries without explicit `LIMIT` clauses are rejected.

---

### 4.3 PII Social Security Number (SSN) Blocker
* **Goal**: Scan all tool calls regardless of tool name (`*`) for unencrypted US Social Security Number patterns in input arguments.
* **Target Tool**: `*`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "payload.text",
  "operator": "REGEX",
  "value": "\\b\\d{3}-\\d{2}-\\d{4}\\b"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "generate_report",
  "arguments": {
    "notes": "Customer requested verification with SSN: 000-12-3456"
  }
}
```
* **Result**: `BLOCK` — PII pattern detected in arguments.

---

## 5. Cloud, DevOps & Infrastructure Safety

### 5.1 Block Public S3 Storage Bucket
* **Goal**: Ensure no autonomous infrastructure provisioning agent can create an AWS S3 bucket with public access enabled.
* **Target Tool**: `create_s3_bucket`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "is_public",
  "operator": "EQUALS",
  "value": "true"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "create_s3_bucket",
  "arguments": {
    "bucket_name": "company-assets-staging-9921",
    "region": "us-east-1",
    "is_public": true
  }
}
```
* **Result**: `BLOCK` — Insecure cloud storage policy violated.

---

### 5.2 Protect Kubernetes Production Namespace
* **Goal**: Require DevOps engineering leads to approve any `kubectl delete` command executed against the `production` namespace.
* **Target Tool**: `kubectl_delete`
* **Action**: `REQUIRE_APPROVAL`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "namespace",
  "operator": "EQUALS",
  "value": "production"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "kubectl_delete",
  "arguments": {
    "resource": "deployment",
    "name": "payment-service",
    "namespace": "production"
  }
}
```
* **Result**: `REQUIRE_APPROVAL` — Execution paused; approval request dispatched to `#devops-approvals`.

---

### 5.3 Production Compute Termination Gate
* **Goal**: Prevent autonomous cost-optimization agents from shutting down instances marked with `environment: production`.
* **Target Tool**: `terminate_instance`
* **Action**: `BLOCK`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "tags.environment",
  "operator": "EQUALS",
  "value": "production"
}
```

---

## 6. CRM & Customer Communications

### 6.1 Bulk Email Blast Gate (>50 Recipients)
* **Goal**: Prevent outreach or support agents from sending bulk emails exceeding 50 recipients without marketing compliance approval.
* **Target Tool**: `send_email_campaign`
* **Action**: `REQUIRE_APPROVAL`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "recipient_count",
  "operator": "GREATER_THAN",
  "value": 50
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "send_email_campaign",
  "arguments": {
    "campaign_id": "spring_promotion_2026",
    "recipient_count": 250,
    "subject": "Exclusive 20% discount on all cloud services"
  }
}
```
* **Result**: `REQUIRE_APPROVAL` — Outreach held for review.

---

### 6.2 VIP / Enterprise Customer Modification Gate
* **Goal**: Prevent automated agents from altering contracts, discounts, or account details for Enterprise/VIP accounts.
* **Target Tool**: `modify_customer`
* **Action**: `REQUIRE_APPROVAL`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "customer.tier",
  "operator": "EQUALS",
  "value": "enterprise"
}
```
* **Sample Trigger Payload**:
```json
{
  "tool": "modify_customer",
  "arguments": {
    "customer": {
      "id": "cust_enterprise_019",
      "tier": "enterprise"
    },
    "updates": {
      "discount_percentage": 30
    }
  }
}
```
* **Result**: `REQUIRE_APPROVAL` — Enterprise account modifications require human sign-off.

---

### 6.3 Mass User Deletion Limit
* **Goal**: Prevent automated scripts or support bots from bulk-deleting multiple customer accounts in a single call.
* **Target Tool**: `delete_users`
* **Action**: `REQUIRE_APPROVAL`
* **AST Rule Definition**:
```json
{
  "type": "COMPARISON",
  "field": "user_ids_count",
  "operator": "GREATER_THAN",
  "value": 1
}
```

---

## 7. How to Apply Templates

## 7. How to Apply Templates

### Option A: 1-Click UI Selection & Customization (X4G4T Dashboard)

1. Open your browser and navigate to **`http://localhost:3000/dashboard/policies`** (or your production deployment URL).
2. The Policy Management console features three dedicated views:
   - **Active Guardrails Tab**: Manage live policies, toggle rules on/off in real time, and edit existing policies in-place via the **Edit Policy Modal**.
   - **Predefined Policy Library Tab**: Browse 33+ battle-tested guardrails across 10 categories (AI Providers, Spend Control, IAM & Access, Fintech, Security, DevOps, CRM, Healthcare, Cybersecurity, HR). Click **"Customize & Deploy"** on any policy to inspect or customize rule thresholds before deploying.
   - **Gateway Integration (Agent Connect) Tab**: Copy-paste integration snippets for OpenAI ChatGPT, Google Gemini, Anthropic Claude, Cursor/MCP, Python, and cURL with full Zero-Trust Credential Vaulting.
3. Click **Deploy Policy** to compile the AST and persist it in PostgreSQL with immediate sub-millisecond propagation to the Centralized Gateway.

---

### Option B: Programmatic Database Seeding

You can seed your database with these policies in automated CI/CD pipelines or staging environments:

```bash
# Run database migrations and bootstrap script
pnpm db:bootstrap
```

The bootstrap script (`packages/db/src/bootstrap.ts`) automatically seeds:
- System organization (`X4G4T Demo Org`)
- Service API key (`sec_live_x4g4t_demo_key`)
- Pre-configured guardrail policies (Refund Cap, Destructive SQL, Large Wire Sign-Off).

---

### Option C: REST API / Gateway Ingestion

To test an applied template via `curl` against the Fastify proxy or Vercel route handler:

```bash
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_x4g4t_demo_key" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "issue_refund",
    "arguments": {
      "amount": 500,
      "order_id": "ord_12345"
    }
  }'
```

**Expected Response**:
```json
{
  "status": "BLOCKED",
  "violation": {
    "policyName": "Enforce Max Refund Threshold ($250)",
    "field": "amount",
    "operator": "GREATER_THAN",
    "actualValue": 500,
    "targetValue": 250
  },
  "latencyMs": 0.23
}
```

