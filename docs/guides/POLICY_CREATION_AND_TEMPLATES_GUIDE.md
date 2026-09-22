# X4G4T Policy Creation & Predefined Library Guide

> **Authoritative Developer & Operator Guide for Designing, Deploying, and Testing Deterministic Guardrail Policies.**  
> *Ultra-low-latency (<15ms) inline firewall for autonomous AI agent tool calls and Model Context Protocol (MCP) servers.*

---

## Table of Contents

1. [Policy Engine Architecture & AST Evaluation](#1-policy-engine-architecture--ast-evaluation)
2. [Rule Syntax, Dot-Paths & Operators](#2-rule-syntax-dot-paths--operators)
   - [2.1 Field Dot-Path Notation](#21-field-dot-path-notation)
   - [2.2 Supported Operators Matrix](#22-supported-operators-matrix)
   - [2.3 Enforcement Actions: ALLOW, BLOCK, REQUIRE_APPROVAL](#23-enforcement-actions-allow-block-require_approval)
3. [How to Create Policies (4 Methods)](#3-how-to-create-policies-4-methods)
   - [Method 1: Interactive Web Dashboard (Custom Builder + Quick Presets)](#method-1-interactive-web-dashboard-custom-builder--quick-presets)
   - [Method 2: 1-Click Deployment from the Predefined Policy Library](#method-2-1-click-deployment-from-the-predefined-policy-library)
   - [Method 3: REST API & Server Actions](#method-3-rest-api--server-actions)
   - [Method 4: Programmatic Database Seeding (Drizzle ORM / Bootstrap)](#method-4-programmatic-database-seeding-drizzle-orm--bootstrap)
4. [Predefined Policy Library Catalog (10 Enterprise Domains)](#4-predefined-policy-library-catalog-10-enterprise-domains)
   - [4.1 Fintech & Payments](#41-fintech--payments)
   - [4.2 Database & Application Security (AppSec)](#42-database--application-security-appsec)
   - [4.3 DevOps & Cloud Infrastructure](#43-devops--cloud-infrastructure)
   - [4.4 CRM & Sales Operations](#44-crm--sales-operations)
   - [4.5 Healthcare & Life Sciences (HIPAA / PHI)](#45-healthcare--life-sciences-hipaa--phi)
   - [4.6 Cybersecurity & LLM Prompt Guardrails](#46-cybersecurity--llm-prompt-guardrails)
   - [4.7 Human Resources & People Ops](#47-human-resources--people-ops)
   - [4.8 AI Service Providers (ChatGPT, Gemini, Antigravity, Claude, Ollama, Bedrock, Azure)](#48-ai-service-providers-openai-anthropic-gemini-bedrock-azure-perplexity)
   - [4.9 IAM Groups & User-Based Access Policies](#49-iam-groups--user-based-access-policies)
   - [4.10 Spend Control & Agent Budget Alerts](#410-spend-control--agent-budget-alerts)
5. [Testing & Verifying Guardrail Policies](#5-testing--verifying-guardrail-policies)
   - [5.1 REST Gateway Ingestion (`POST /v1/gateway/execute`)](#51-rest-gateway-ingestion-post-v1gatewayexecute)
   - [5.2 Model Context Protocol (MCP) Router (`tools/call`)](#52-model-context-protocol-mcp-router-toolscall)
   - [5.3 Slack Human-in-the-Loop (HITL) Workflow Verification](#53-slack-human-in-the-loop-hitl-workflow-verification)

---

## 1. Policy Engine Architecture & AST Evaluation

X4G4T acts as a **Centralized Inline Gateway & Firewall** sitting directly in the execution path between polyglot AI agent runtimes (OpenAI ChatGPT, Google Gemini, Anthropic Claude, LangChain, Cursor, Claude Desktop) and enterprise backend tools (Stripe, Postgres, Salesforce, Kubernetes, AWS).

```
                      ┌────────────────────────────────────────────────────────┐
                      │          X4G4T CENTRALIZED GATEWAY (:4000)          │
  Polyglot AI Agents  │                                                        │       Downstream Targets
┌───────────────────┐ │  ┌──────────────────────────────────────────────────┐  │     ┌───────────────────┐
│ ChatGPT / OpenAI  │ │  │ 1. Dual-Mode Auth: Static Keys & IAM JWTs        │  │ ──► │ Stripe / Payments │
└─────────┬─────────┘ │  │    (Clerk, WorkOS, Okta, Cognito, Azure AD)      │  │     └───────────────────┘
          │           │  ├──────────────────────────────────────────────────┤  │
┌─────────┴─────────┐ │  │ 2. In-Memory AST Evaluator (<0.15µs per call)   │  │     ┌───────────────────┐
│ Google Gemini     │ ┼─►│    - Tool matching & dot-path extraction         │  │ ──► │ PostgreSQL / SQL  │
└─────────┬─────────┘ │  │    - Numerical bounds, regex, enum operators     │  │     └───────────────────┘
          │           │  │    - IAM role/group permissions enforcement      │  │
┌─────────┴─────────┐ │  ├──────────────────────────────────────────────────┤  │     ┌───────────────────┐
│ Anthropic Claude  │ │  │ 3. Zero-Trust Credential Vaulting                │  │ ──► │ AWS / Kubernetes  │
└─────────┬─────────┘ │  │    - Injects downstream secrets upon ALLOW       │  │     └───────────────────┘
          │           │  │    - LLMs never see production credentials       │  │
┌─────────┴─────────┐ │  ├──────────────────────────────────────────────────┤  │
│ Cursor / MCP      │ │  │ 4. GDPR / DPDP PII Sanitization & ISO 27001 Log  │  │
│ (tools/call)      │ │  │    - Tamper-evident SHA-256 hash chaining        │  │
└───────────────────┘ │  └────────────────────────┬─────────────────────────┘  │
                      └───────────────────────────┼────────────────────────────┘
                                                  │
                                                  ▼ (On REQUIRE_APPROVAL)
                                         ┌─────────────────┐
                                         │ Slack / Teams   │
                                         │ HITL Sign-off   │
                                         └─────────────────┘
```

### Core Engine Guarantees
- **Ultra-Low Latency**: Pure in-memory AST traversal evaluates in **$0.15\,\mu\text{s}$ ($0.00015\,\text{ms}$)**, supporting over **6.6 Million evaluations per second per core**.
- **Fail-Closed Security**: If a tool call contains malformed JSON, missing mandatory fields, or an unparseable payload, X4G4T defaults to `BLOCK` (`422 Unprocessable Entity` or JSON-RPC `-32001`).
- **Zero Hallucination Tolerance**: Policy rules are purely deterministic. No secondary LLM is invoked during rule evaluation.

---

## 2. Rule Syntax, Dot-Paths & Operators

Every X4G4T policy consists of:
1. **Target Tool**: The exact tool name (e.g. `issue_refund`, `execute_sql`) or `*` to match all tools.
2. **Action on Match**: The verdict when the rule matches: `BLOCK`, `REQUIRE_APPROVAL`, or `ALLOW`.
3. **Rule Constraints**: One or more field-level conditions evaluated with `AND` semantics.

### 2.1 Field Dot-Path Notation

Field paths navigate nested JSON argument structures using standard dot-notation:

| Payload Structure | Field Dot-Path | Extracted Value |
| :--- | :--- | :--- |
| `{"amount": 250}` | `amount` | `250` (Number) |
| `{"customer": {"tier": "enterprise"}}` | `customer.tier` | `"enterprise"` (String) |
| `{"transaction": {"meta": {"risk": 85}}}` | `transaction.meta.risk` | `85` (Number) |
| `{"items": [{"price": 10}, {"price": 20}]}`| `items[0].price` | `10` (Number) |
| `{"payload": {"text": "SSN: 000-00-0000"}}` | `payload.text` | `"SSN: 000-00-0000"` |

---

### 2.2 Supported Operators Matrix

X4G4T provides 9 type-aware comparison operators:

| Operator | Syntax | Description | Example |
| :--- | :--- | :--- | :--- |
| `EQUALS` | `==` | Exact equality (string, number, boolean) | `is_public == "true"` |
| `NOT_EQUALS` | `!=` | Inequality | `currency != "USD"` |
| `GREATER_THAN` | `>` | Numerical strictly greater than | `amount > 250` |
| `LESS_THAN` | `<` | Numerical strictly less than | `balance < 0` |
| `GREATER_THAN_OR_EQUAL`| `>=` | Numerical greater than or equal | `amount >= 10000` |
| `LESS_THAN_OR_EQUAL` | `<=` | Numerical less than or equal | `reputation_score <= 20` |
| `CONTAINS` | Substring | Checks if string or array contains target | `tags CONTAINS "restricted"` |
| `REGEX` | Pattern | Regular expression match (supports `(?i)` case-insensitivity) | `query REGEX "(?i)(DROP\|TRUNCATE)\s+TABLE"` |
| `IN` | Set | Comma-delimited set membership | `country IN "US,CA,GB,DE"` |

---

### 2.3 Enforcement Actions: ALLOW, BLOCK, REQUIRE_APPROVAL

1. **`ALLOW`**:
   - The tool invocation satisfies policy boundaries.
   - The proxy immediately forwards the request downstream to the upstream service.
   - HTTP response: `200 OK` with the upstream payload.

2. **`BLOCK`**:
   - The tool invocation violated a security boundary.
   - Execution is halted synchronously.
   - An ISO 27001 tamper-evident violation record is logged.
   - HTTP response: `422 Unprocessable Entity` with a structured `violation` object:
     ```json
     {
       "error": {
         "code": "POLICY_VIOLATION",
         "message": "Tool execution blocked by policy 'Enforce Max Refund Threshold ($250)'."
       },
       "violation": {
         "policyName": "Enforce Max Refund Threshold ($250)",
         "field": "amount",
         "operator": "GREATER_THAN",
         "actualValue": 350,
         "targetValue": "250"
       }
     }
     ```

3. **`REQUIRE_APPROVAL` (Human-in-the-Loop)**:
   - High-impact operations (e.g. wire transfers, bulk emails, production namespace changes).
   - Execution is suspended into a `PENDING` state with a unique `holdId`.
   - An interactive Slack / Teams Block Kit card is dispatched to the designated channel.
   - HTTP response: `202 Accepted`:
     ```json
     {
       "status": "HELD",
       "holdId": "hold_a1b2c3d4",
       "message": "Tool call suspended pending human supervisor approval."
     }
     ```

---

## 3. How to Create Policies (4 Methods)

### Method 1: Interactive Web Dashboard (Custom Builder + Quick Presets)

1. Navigate to **`http://localhost:3000/dashboard/policies`** (or your Vercel deployment URL).
2. On the **Active Guardrails** tab, click any of the **Quick Policy Templates** buttons (e.g. `[Fintech] Refund Cap ($250)` or `[Security] Destructive SQL Guard`) to auto-fill the form.
3. Customize any fields (Policy Name, Target Tool, Action on Match, Field Dot-Path, Operator, Target Value).
4. Click **Create Policy**. The policy is immediately compiled and active in your organization.

---

### Method 2: 1-Click Deployment & In-Place Customization from Policy Library

1. In `/dashboard/policies`, click the **Predefined Policy Library** tab.
2. Filter policies by category (`AI Providers`, `Fintech`, `Security`, `DevOps`, `CRM`, `Healthcare`, `Cybersecurity`, `HR`) or search for keywords (e.g. `OpenAI`, `Anthropic`, `SQL`, `S3`).
3. Click **View Sample Test Payload** to inspect the triggering JSON structure.
4. Choose an action:
   - **1-Click Deploy**: Immediately activates the policy with default enterprise parameters.
   - **Customize & Deploy**: Opens an interactive modal to modify the policy name, numerical thresholds, dot-path fields, or target tools before deploying to your organization.

### Method 3: Editing Active Guardrail Policies

1. On the **Active Guardrails** tab, locate the policy rule you wish to modify.
2. Click the **Edit** button next to the rule.
3. In the **Edit Active Policy** modal, adjust any parameters (Policy Name, Target Tool, Action on Match, Field Dot-Path, Operator, Target Value).
4. Click **Save Changes**. The policy rule is atomically updated in PostgreSQL and active in the AST engine immediately.

---

### Method 4: REST API & Server Actions

You can programmatically create policies by calling the Server Action or posting to the internal API:

```typescript
import { createPolicyAction } from "@/app/actions";

const formData = new FormData();
formData.append("name", "Cap Wire Transfers ($5000)");
formData.append("targetTool", "wire_transfer");
formData.append("actionOnMatch", "REQUIRE_APPROVAL");
formData.append("fieldPath", "amount");
formData.append("operator", "GREATER_THAN");
formData.append("targetValue", "5000");

await createPolicyAction(formData);
```

---

### Method 4: Programmatic Database Seeding (Drizzle ORM / Bootstrap)

In automated CI/CD pipelines, seed policies using Drizzle ORM:

```typescript
import { policies, policyRules } from "@x4g4t/db";

const [policy] = await db.insert(policies).values({
  orgId: "org_demo_1",
  name: "Block Destructive SQL",
  targetTool: "execute_sql",
  actionOnMatch: "BLOCK",
  isActive: "true"
}).returning();

await db.insert(policyRules).values({
  policyId: policy.id,
  fieldPath: "query",
  operator: "REGEX",
  targetValue: "(?i)(DROP|TRUNCATE|ALTER)\\s+TABLE"
});
```

---

## 4. Predefined Policy Library Catalog (7 Enterprise Use Cases)

X4G4T includes 18+ battle-tested policies ready to deploy across 7 enterprise domains:

### 4.1 Fintech & Payments

#### 1. Enforce Max Refund Threshold ($250)
* **ID**: `fintech-refund-cap-250`
* **Target Tool**: `issue_refund` | **Action**: `BLOCK`
* **Rule**: `amount GREATER_THAN 250`
* **Threat Mitigated**: Hallucinating customer support agent granting unauthorized refunds.

#### 2. High-Value Wire Transfer Sign-Off ($10,000)
* **ID**: `fintech-large-wire-gate`
* **Target Tool**: `wire_transfer` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `amount GREATER_THAN_OR_EQUAL 10000`
* **Threat Mitigated**: Irreversible high-value wire transfers executing without human dual-control.

#### 3. Restrict Payments to Approved Currencies (USD)
* **ID**: `fintech-currency-whitelist`
* **Target Tool**: `create_payment` | **Action**: `BLOCK`
* **Rule**: `currency NOT_EQUALS USD`
* **Threat Mitigated**: Unintended foreign exchange exposure or sanctioned currency disbursements.

#### 4. Transaction Surcharge Ceiling ($50)
* **ID**: `fintech-surcharge-limit`
* **Target Tool**: `add_surcharge` | **Action**: `BLOCK`
* **Rule**: `fee_amount GREATER_THAN 50`
* **Threat Mitigated**: Algorithmic billing error applying predatory fee structures.

---

### 4.2 Database & Application Security (AppSec)

#### 5. Block Destructive SQL Commands (DROP/TRUNCATE/ALTER)
* **ID**: `security-destructive-sql`
* **Target Tool**: `execute_sql` | **Action**: `BLOCK`
* **Rule**: `query REGEX (?i)(DROP|TRUNCATE|ALTER)\s+TABLE`
* **Threat Mitigated**: Text-to-SQL agent generating catastrophic DDL statements destroying tables.

#### 6. Gate Bulk User Account Deletion
* **ID**: `security-mass-user-deletion`
* **Target Tool**: `delete_users` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `user_ids_count GREATER_THAN 1`
* **Threat Mitigated**: Prompt injection tricking a support bot into mass-deleting accounts.

#### 7. Block Dangerous Shell Commands (rm -rf / curl|sh / chmod 777)
* **ID**: `security-command-injection`
* **Target Tool**: `run_shell_command` | **Action**: `BLOCK`
* **Rule**: `command REGEX (?i)(rm\s+-rf|curl.*\|\s*(bash|sh)|chmod\s+777|mkfs)`
* **Threat Mitigated**: Remote Code Execution (RCE) via injected shell commands.

#### 8. Prevent Unbounded SQL Queries (Missing LIMIT)
* **ID**: `security-unbounded-query`
* **Target Tool**: `execute_sql` | **Action**: `BLOCK`
* **Rule**: `query REGEX (?i)SELECT\s+.*\s+FROM\s+(?!.*LIMIT\s+\d+).*`
* **Threat Mitigated**: Full database scraping and memory exhaustion.

---

### 4.3 DevOps & Cloud Infrastructure

#### 9. Block Public Cloud Storage Bucket Creation
* **ID**: `devops-s3-public-block`
* **Target Tool**: `create_s3_bucket` | **Action**: `BLOCK`
* **Rule**: `is_public EQUALS true`
* **Threat Mitigated**: Cloud data leaks from unintentionally making S3 buckets public.

#### 10. Protect Kubernetes Production Namespace
* **ID**: `devops-k8s-prod-protect`
* **Target Tool**: `kubectl_delete` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `namespace EQUALS production`
* **Threat Mitigated**: Autonomous SRE bots deleting production pods or deployments.

#### 11. Production VM Termination Gate
* **ID**: `devops-terminate-vm-gate`
* **Target Tool**: `terminate_instance` | **Action**: `BLOCK`
* **Rule**: `environment EQUALS production`
* **Threat Mitigated**: Cloud cost-optimization bots shutting down active production workloads.

#### 12. Block Wildcard IAM Policy Grants (*:*)
* **ID**: `devops-iam-wildcard-block`
* **Target Tool**: `attach_iam_policy` | **Action**: `BLOCK`
* **Rule**: `action EQUALS *:*`
* **Threat Mitigated**: Privilege escalation granting full administrator access to service roles.

---

### 4.4 CRM & Sales Operations

#### 13. Gate Bulk Customer Email Blast (>50 Recipients)
* **ID**: `crm-bulk-email-gate`
* **Target Tool**: `send_email_campaign` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `recipient_count GREATER_THAN 50`
* **Threat Mitigated**: Marketing bots triggering unsolicited mass email campaigns damaging domain reputation.

#### 14. Require Review for VIP Customer Record Modifications
* **ID**: `crm-vip-customer-gate`
* **Target Tool**: `modify_customer` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `customer.tier EQUALS enterprise`
* **Threat Mitigated**: Automated support bots modifying contracts or SLAs of Tier-1 enterprise clients.

#### 15. Excessive Sales Discount Ceiling (>25%)
* **ID**: `crm-discount-cap`
* **Target Tool**: `apply_discount` | **Action**: `BLOCK`
* **Rule**: `discount_percent GREATER_THAN 25`
* **Threat Mitigated**: AI sales negotiation agents coerced by prompt injection into granting 90% contract discounts.

---

### 4.5 Healthcare & Life Sciences (HIPAA / PHI)

#### 16. Bulk Medical Record Export Threshold (>10 Records)
* **ID**: `healthcare-bulk-record-export`
* **Target Tool**: `export_patient_records` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `record_count GREATER_THAN 10`
* **Threat Mitigated**: Mass exfiltration of Protected Health Information (PHI) violating HIPAA.

#### 17. Block Outbound Social Security Numbers (SSN)
* **ID**: `healthcare-ssn-pii-block`
* **Target Tool**: `*` (All Tools) | **Action**: `BLOCK`
* **Rule**: `payload.text REGEX \b\d{3}-\d{2}-\d{4}\b`
* **Threat Mitigated**: Inadvertent disclosure of raw patient SSNs in tool calls.

---

### 4.6 Cybersecurity & LLM Prompt Guardrails

#### 18. System Prompt Exfiltration Defense
* **ID**: `cybersecurity-prompt-leak-block`
* **Target Tool**: `send_external_message` | **Action**: `BLOCK`
* **Rule**: `content REGEX (?i)(system\s+prompt|BEGIN_SYSTEM_INSTRUCTIONS|developer\s+instruction)`
* **Threat Mitigated**: Adversarial jailbreak extracting proprietary system prompts and keys.

---

### 4.7 Human Resources & People Ops

#### 19. Salary Adjustment Dual-Signoff Gate
* **ID**: `hr-salary-increase-gate`
* **Target Tool**: `update_compensation` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `increase_percent GREATER_THAN 5`
* **Threat Mitigated**: Unauthorized payroll adjustments or agent errors modifying salary tables.

---

### 4.8 AI Service Providers (OpenAI, Anthropic, Gemini, Bedrock, Azure, Perplexity)

#### 20. Block Deprecated / High-Cost OpenAI Models
* **ID**: `ai-openai-unapproved-model`
* **Target Tool**: `openai_chat_completion` | **Action**: `BLOCK`
* **Rule**: `model IN gpt-4-32k,text-davinci-003,davinci,gpt-4-vision-preview`
* **Threat Mitigated**: Rogue agents or prompt injections switching to expensive or deprecated model tiers.

#### 21. Anthropic Max Output Token Ceiling (4,096)
* **ID**: `ai-anthropic-max-tokens`
* **Target Tool**: `anthropic_messages_create` | **Action**: `BLOCK`
* **Rule**: `max_tokens GREATER_THAN 4096`
* **Threat Mitigated**: Runaway generative loops requesting massive output token buffers causing billing spikes.

#### 22. Block Gemini Safety Threshold Disable
* **ID**: `ai-gemini-safety-disable`
* **Target Tool**: `gemini_generate_content` | **Action**: `BLOCK`
* **Rule**: `safety_settings.threshold EQUALS BLOCK_NONE`
* **Threat Mitigated**: Adversarial prompts attempting to disable safety filters to generate harmful content.

#### 23. Enforce AWS Bedrock Corporate Guardrail
* **ID**: `ai-bedrock-guardrail-enforce`
* **Target Tool**: `bedrock_invoke_model` | **Action**: `BLOCK`
* **Rule**: `guardrailIdentifier NOT_EQUALS gr-prod-enterprise-01`
* **Threat Mitigated**: Unmonitored foundation model calls bypassing organizational PII and content guardrails.

#### 24. Cap Azure OpenAI Temperature (<= 0.3 for Determinism)
* **ID**: `ai-azure-openai-temp-guard`
* **Target Tool**: `azure_openai_completion` | **Action**: `BLOCK`
* **Rule**: `temperature GREATER_THAN 0.3`
* **Threat Mitigated**: High-temperature stochastic generation causing hallucinations in analytical agent tasks.

#### 25. Gate Stale Perplexity Search Grounding
* **ID**: `ai-perplexity-recency-gate`
#### 26. Lock ChatGPT Custom Instructions & System Prompt
* **ID**: `ai-chatgpt-system-prompt-lock`
* **Target Tool**: `chatgpt_prompt` | **Action**: `BLOCK`
* **Rule**: `instructions REGEX (?i)(ignore\s+previous|bypass|DAN\s+mode)`
* **Threat Mitigated**: Prompt injection or jailbreak payloads coercing ChatGPT into overriding or ignoring enterprise system prompts.

#### 27. Cap Antigravity Agent Compute Budget (<= 100 Credits)
* **ID**: `ai-antigravity-compute-budget`
* **Target Tool**: `antigravity_agent_run` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `compute_budget_credits GREATER_THAN 100`
* **Threat Mitigated**: Recursive DeepMind Antigravity multi-agent loops causing runaway cloud GPU compute expenses.

#### 28. Block Antigravity Sandbox Isolation Bypass
* **ID**: `ai-antigravity-sandbox-override`
* **Target Tool**: `antigravity_execute` | **Action**: `BLOCK`
* **Rule**: `bypass_sandbox EQUALS true`
* **Threat Mitigated**: Autonomous code agents attempting to escape sandboxed terminal isolation to execute unapproved host commands.

#### 29. Cap Claude 3.7 Extended Thinking Budget (16k Tokens)
* **ID**: `ai-claude-thinking-budget`
* **Target Tool**: `claude_messages_create` | **Action**: `BLOCK`
* **Rule**: `thinking.budget_tokens GREATER_THAN 16384`
* **Threat Mitigated**: Inflated latency and disproportionate billing from excessive Claude 3.7 Sonnet extended thinking token limits.

#### 30. Gate Ollama Large Model Downloads (>10 GB)
* **ID**: `ai-ollama-pull-size-gate`
* **Target Tool**: `ollama_pull_model` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `size_gb GREATER_THAN 10`
* **Threat Mitigated**: Edge servers or developer workstations running out of disk space due to autonomous 70B+ model downloads.

#### 31. Block Ollama Unquantized FP16 Models
* **ID**: `ai-ollama-unquantized-block`
* **Target Tool**: `ollama_run` | **Action**: `BLOCK`
* **Rule**: `quantization EQUALS fp16`
* **Threat Mitigated**: Unquantized 16-bit float model weights causing GPU VRAM Out-Of-Memory crashes on local clusters.

---

### 4.9 IAM Groups & User-Based Access Policies

X4G4T evaluates user identity and RBAC/ABAC group memberships passed in the IAM context (`iam.roles`, `iam.groups`, `iam.userId`):

#### 32. Block Contractors from Executing SQL Statements
* **ID**: `iam-contractor-database-block`
* **Target Tool**: `execute_sql` | **Action**: `BLOCK`
* **Rule**: `iam.roles CONTAINS contractor`
* **Threat Mitigated**: External contractor agents or third-party sessions executing direct SQL statements against relational databases.

#### 33. Require Dual-Control for Intern Financial Operations
* **ID**: `iam-intern-wire-gate`
* **Target Tool**: `wire_transfer` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `iam.groups CONTAINS interns`
* **Threat Mitigated**: High-value financial wire transfers or disbursements initiated by junior or intern credentials without supervisor sign-off.

#### 34. Restrict Production K8s Deletions to SRE Admins
* **ID**: `iam-prod-k8s-role-gate`
* **Target Tool**: `kubectl_delete` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `iam.roles NOT_EQUALS sre-admin`
* **Threat Mitigated**: Accidental or unauthorized pod/deployment deletion in Kubernetes production clusters by non-SRE personnel.

---

### 4.10 Spend Control & Agent Budget Alerts

Policies designed to prevent runaway costs, excessive token consumption, and unmonitored usage of premium reasoning models:

#### 35. Per-Call Token Spend Ceiling (16,384 Tokens)
* **ID**: `spend-token-limit-request`
* **Target Tool**: `*` | **Action**: `BLOCK`
* **Rule**: `total_tokens GREATER_THAN 16384`
* **Threat Mitigated**: Runaway LLM generation loops incurring unexpected API cost spikes.

#### 36. Estimated Cost Alert (> $1.50 per Invocation)
* **ID**: `spend-cost-per-call-gate`
* **Target Tool**: `*` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `estimated_cost_usd GREATER_THAN 1.50`
* **Threat Mitigated**: Individual tool calls exceeding $1.50 in estimated API or compute costs running without human oversight.

#### 37. Agent Monthly Quota Spend Alert (> $500)
* **ID**: `spend-agent-monthly-budget`
* **Target Tool**: `*` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `agent.monthly_spend_usd GREATER_THAN 500`
* **Threat Mitigated**: Autonomous background agents silently draining monthly corporate cloud and AI billing limits.

#### 38. Require Sign-Off for High-Cost Reasoning Models (o1/o3)
* **ID**: `spend-high-cost-reasoning-model`
* **Target Tool**: `*` | **Action**: `REQUIRE_APPROVAL`
* **Rule**: `model IN o1,o1-preview,o3-mini-high`
* **Threat Mitigated**: Unnecessary usage of expensive multi-dollar reasoning models for routine queries.

---

## 5. Testing & Verifying Guardrail Policies

### 5.1 REST Gateway Ingestion (`POST /v1/gateway/execute`)

Test a refund limit policy via `curl`:

```bash
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "issue_refund",
    "arguments": {
      "order_id": "ord_9901",
      "amount": 350
    }
  }'
```

**Expected Response (HTTP 422)**:
```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Tool execution blocked by policy 'Enforce Max Refund Threshold ($250)'."
  },
  "violation": {
    "policyName": "Enforce Max Refund Threshold ($250)",
    "field": "amount",
    "operator": "GREATER_THAN",
    "actualValue": 350,
    "targetValue": "250"
  }
}
```

---

### 5.2 Model Context Protocol (MCP) Router (`tools/call`)

For Claude Desktop, Cursor, or MCP servers:

```bash
curl -X POST http://localhost:4000/v1/gateway/mcp \
  -H "Authorization: Bearer sec_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req_1",
    "method": "tools/call",
    "params": {
      "name": "execute_sql",
      "arguments": {
        "query": "DROP TABLE users;"
      }
    }
  }'
```

**Expected JSON-RPC Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "req_1",
  "error": {
    "code": -32001,
    "message": "X4G4T Policy Violation: Tool execution blocked by policy 'Block Destructive SQL Commands (DROP/TRUNCATE/ALTER)'."
  }
}
```

---

### 5.3 Slack Human-in-the-Loop (HITL) Workflow Verification

1. Submit a tool call triggering a `REQUIRE_APPROVAL` policy (e.g. `wire_transfer` with `amount: 15000`).
2. X4G4T returns `202 Accepted` with a `holdId`.
3. Check the configured Slack channel. An interactive card appears with:
   - Tool Name, Agent ID, and Arguments
   - "Approve Execution" (Green) and "Reject / Terminate" (Red) buttons
4. Click **Approve Execution**. 
5. Suspended agents polling `GET /v1/gateway/hitl/:holdId` receive `200 OK: APPROVED` and resume execution!

