# X4G4T: End-to-End Business Logic & System Invariants

This document serves as the authoritative specification of the **business logic, state machines, mathematical models, evaluation semantics, and failure modes** governing the X4G4T platform.

---

## Table of Contents
1. [Domain Model & Entity Relationships](#1-domain-model--entity-relationships)
2. [Gateway Authentication & Multi-Tenancy Logic](#2-gateway-authentication--multi-tenancy-logic)
3. [Deterministic Policy Evaluation Engine](#3-deterministic-policy-evaluation-engine)
   - [Rule Evaluation Semantics (AND-Condition AST)](#rule-evaluation-semantics-and-condition-ast)
   - [Field-Path Resolution & Type Coercion](#field-path-resolution--type-coercion)
   - [Operator Evaluation Matrix](#operator-evaluation-matrix)
   - [Verdict Precedence & Conflict Resolution](#verdict-precedence--conflict-resolution)
4. [Downstream Forwarding & Circuit Breaking](#4-downstream-forwarding--circuit-breaking)
5. [Human-in-the-Loop (HITL) State Machine](#5-human-in-the-loop-hitl-state-machine)
6. [Asynchronous Telemetry & Hash Chaining Logic](#6-asynchronous-telemetry--hash-chaining-logic)
   - [BullMQ Asynchronous Decoupling](#bullmq-asynchronous-decoupling)
   - [ISO/IEC 27001 Cryptographic Hash Chaining](#isoiec-27001-cryptographic-hash-chaining)
7. [Data Privacy & Crypto-Shredding Mechanics](#7-data-privacy--crypto-shredding-mechanics)
   - [In-Flight PII Redaction](#in-flight-pii-redaction)
   - [GDPR Art. 17 / DPDP Sec. 12 Crypto-Shredding](#gdpr-art-17--dpdp-sec-12-crypto-shredding)
8. [Model Context Protocol (MCP) JSON-RPC 2.0 Router](#8-model-context-protocol-mcp-json-rpc-20-router)
9. [Failure Modes, Fail-Closed Defaults & Edge Cases](#9-failure-modes-fail-closed-defaults--edge-cases)

---

## 1. Domain Model & Entity Relationships

The X4G4T data model enforces strict tenant isolation, auditable key lifecycles, configurable guardrail policies, tamper-evident logs, and GDPR-compliant crypto-shredding keys.

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ API_KEYS : owns
    ORGANIZATIONS ||--o{ POLICIES : defines
    ORGANIZATIONS ||--o{ EXECUTION_LOGS : records
    ORGANIZATIONS ||--o{ HITL_REQUESTS : manages
    ORGANIZATIONS ||--o{ SUBJECT_ENCRYPTION_KEYS : maintains
    POLICIES ||--o{ POLICY_RULES : contains
    EXECUTION_LOGS ||--o| HITL_REQUESTS : triggers
```

### Entity Business Invariants

| Entity | Primary Keys & Indexes | Business Rules & Invariants |
| :--- | :--- | :--- |
| `organizations` | `id` (UUID / text) | - Represents an isolated enterprise tenant.<br>- Defines `retention_days` (default: 90 days).<br>- All queries across tables must be scoped by `org_id`. |
| `api_keys` | `id` (UUID), `key_hash` (unique) | - Secret key generated with prefix `sec_live_` + 24 cryptographically random bytes.<br>- Plain-text key is **never** stored in the database.<br>- Only `SHA-256(raw_key)` is persisted.<br>- Revoked keys (`is_active = false`) are permanently rejected. |
| `policies` | `id` (UUID), `org_id` | - Target tool specifies the exact tool name or `*` (wildcard matching all tools).<br>- `action_on_match` must be one of: `ALLOW`, `BLOCK`, `REQUIRE_APPROVAL`.<br>- Toggling `is_active` immediately alters runtime evaluation. |
| `policy_rules` | `id` (UUID), `policy_id` | - Belongs to exactly one policy.<br>- Defines `field_path` (nested dot-notation), `operator`, and `target_value`.<br>- Multiple rules within a policy evaluate under **AND** semantics. |
| `execution_logs` | `id` (UUID), `org_id`, `created_at` | - Append-only immutable audit trail.<br>- Stores `record_hash` and `previous_record_hash` forming a cryptographic blockchain-like ledger.<br>- Personal data arguments are encrypted or sanitized. |
| `hitl_requests` | `id` (UUID), `org_id` | - Stateful request created when a policy triggers `REQUIRE_APPROVAL`.<br>- Transitions: `PENDING` $\rightarrow$ `APPROVED` \| `REJECTED` \| `EXPIRED`.<br>- Must record `reviewer_id` and `resolved_at` upon terminal state. |
| `subject_encryption_keys` | `id` (UUID), `subject_id` (unique) | - Stores unique AES-256-GCM symmetric keys for individual data subjects.<br>- Destroying this key cryptographically erases all associated execution logs. |

---

## 2. Gateway Authentication & Multi-Tenancy Logic

All inbound requests to the Centralized Gateway (`/v1/gateway/execute` and `/v1/gateway/mcp`) pass through the dual-mode zero-trust authentication layer.

```mermaid
flowchart TD
    Req[Inbound HTTP Request] --> AuthHeader{Authorization Header Present?}
    AuthHeader -- No --> Err401[Return 401 UNAUTHORIZED]
    AuthHeader -- Yes --> TokenCheck{Is Token a 3-Part JWT?}
    
    TokenCheck -- Yes (Enterprise IAM) --> VerifyJWT[Verify IAM JWT: exp, nbf, iss, aud]
    VerifyJWT --> ExtractClaims[Extract sub, org_id, roles, groups]
    ExtractClaims --> CacheSession[Cache IAM Session TTL: 5m]
    CacheSession --> ScopeTenant[Scope Context to Org ID & User ID / Roles]
    
    TokenCheck -- No (Static API Key) --> HashToken[Compute SHA-256 of Raw Token]
    HashToken --> CacheCheck{Hash in In-Memory Cache?}
    CacheCheck -- Yes --> ScopeTenant
    CacheCheck -- No --> DBCheck{Hash Exists & Active in Database?}
    DBCheck -- No --> ErrInvalid[Return 401 INVALID_API_KEY]
    DBCheck -- Yes --> PopulateCache[Write Hash -> OrgID to Cache TTL: 5m]
    PopulateCache --> ScopeTenant
    
    ScopeTenant --> Proceed[Proceed to Policy Evaluation]
```

### Business Rules:
1. **Dual-Mode Header Support:**
   - **Enterprise IAM JWT**: `Authorization: Bearer eyJ...` issued by Clerk, WorkOS, Okta, AWS Cognito, or Azure AD / Microsoft Entra ID.
   - **Static API Key**: `Authorization: Bearer sec_live_<token>` (256-bit entropy token).
2. **Deterministic Hash Calculation for Static Keys:**
   $$\text{Key Hash} = \text{SHA-256}(\text{raw\_token})$$
3. **In-Memory Caching (SLA Guard):** To prevent database round-trips on every request, verified sessions and key hashes are cached in an in-memory `Map` with a **5-minute TTL**.
4. **IAM Context Propagation:** User ID, organization ID, RBAC roles, and group memberships are attached to the request context for policy evaluation.
5. **Tenant Isolation:** All policy lookups, audit logs, and Human-in-the-Loop holds are strictly partitioned by `org_id`.

---

## 3. Deterministic Policy Evaluation Engine

The policy engine operates entirely in-memory as a pure Abstract Syntax Tree (AST) evaluator without external network calls or database reads.

### Rule Evaluation Semantics (AND-Condition AST)

A policy contains one or more `policy_rules`. For a policy to match:
1. **Tool Name Matching:** `policy.targetTool === "*"` OR `policy.targetTool === context.toolName`.
2. **Rule Conjunction (AND Semantics):** **Every single rule** in `policy.rules` must evaluate to `true`. If any rule evaluates to `false`, the policy does not match, and evaluation proceeds to the next policy.

$$\text{PolicyMatches}(P, C) = (P.\text{tool} = * \lor P.\text{tool} = C.\text{tool}) \land \left( \bigwedge_{r \in P.\text{rules}} \text{EvalRule}(r, C.\text{args}) \right)$$

```mermaid
flowchart TD
    Start[Evaluate Policies for Tool] --> LoopPol[Iterate Next Policy in Org]
    LoopPol --> MatchTool{Tool Matches or '*'?}
    MatchTool -- No --> LoopPol
    MatchTool -- Yes --> LoopRules[Iterate Rules in Policy]
    LoopRules --> ExtractVal[Extract Field Value via Dot-Path]
    ExtractVal --> EvalOp{Operator Evaluates to True?}
    EvalOp -- No --> LoopPol
    EvalOp -- Yes --> MoreRules{More Rules in this Policy?}
    MoreRules -- Yes --> LoopRules
    MoreRules -- No --> MatchFound[Policy Matches!]
    MatchFound --> TriggerAction[Return Policy Action: BLOCK | REQUIRE_APPROVAL | ALLOW]
    LoopPol -- Exhausted --> DefaultAllow[No Match: Return ALLOW]
```

---

### Field-Path Resolution & Type Coercion

The engine resolves nested properties using dot-notation:
- Example: `"transaction.customer.email"` resolves `context.arguments["transaction"]["customer"]["email"]`.
- Example: `"items.0.price"` resolves array indices.
- **Missing Fields:** If a path does not exist, it resolves to `undefined`.
  - Non-existence checks (`EQUALS` with `"null"` or `"undefined"`) evaluate appropriately.
  - Numeric or regex comparisons against `undefined` evaluate to `false`.

---

### Operator Evaluation Matrix

| Operator | Type Handling | Logic & Evaluation Rule | Edge Cases |
| :--- | :--- | :--- | :--- |
| `EQUALS` | String / Number / Boolean | Strict equality after string normalization (`String(actual) === String(target)`). | Case-sensitive. Numeric `100` equals `"100"`. |
| `NOT_EQUALS` | String / Number / Boolean | Inverted equality (`String(actual) !== String(target)`). | Returns `true` if field is undefined and target is not `"undefined"`. |
| `GREATER_THAN` | Numeric | Coerces both to `Number`. Returns `actualNum > targetNum`. | Returns `false` if `isNaN(actual)` or `isNaN(target)`. |
| `LESS_THAN` | Numeric | Coerces both to `Number`. Returns `actualNum < targetNum`. | Returns `false` if `isNaN(actual)` or `isNaN(target)`. |
| `GREATER_THAN_OR_EQUAL` | Numeric | Coerces both to `Number`. Returns `actualNum >= targetNum`. | Returns `false` if NaN. |
| `LESS_THAN_OR_EQUAL` | Numeric | Coerces both to `Number`. Returns `actualNum <= targetNum`. | Returns `false` if NaN. |
| `CONTAINS` | String | Substring check: `String(actual).includes(String(target))`. | Case-sensitive substring. |
| `REGEX` | String (Pattern) | Evaluates `new RegExp(pattern, flags).test(String(actual))`. | Automatically parses PCRE `(?i)` and inline flags `/pattern/i` into JS `RegExp` flags. |
| `IN` | Delimited List | Splits target by comma `,`, trims whitespace, and checks set inclusion. | Target `"US, CA, GB"` matches `"US"`. |

---

### Verdict Precedence & Conflict Resolution

When multiple policies target the same tool:
1. Policies are evaluated in the order configured by the administrator.
2. The **first matching policy** determines the immediate verdict.
3. If no policies match, the engine defaults to **`ALLOW`**.

---

## 4. Downstream Forwarding, Circuit Breaking & Credential Vaulting

When a tool call receives the **`ALLOW`** verdict, X4G4T acts as a secure credential vault and transparent proxy:

```mermaid
sequenceDiagram
    autonumber
    actor Agent as AI Agent Runtime (ChatGPT/Gemini/Claude)
    participant Gateway as X4G4T Centralized Gateway
    participant Vault as Credential Vault (Secrets)
    participant Upstream as Downstream Target API (Stripe/DB/AWS)
    participant Queue as Redis (BullMQ)

    Agent->>Gateway: POST /v1/gateway/execute { tool_name, arguments, downstream_url }
    Gateway->>Gateway: Evaluate In-Memory AST Policy -> ALLOW (<0.15µs)
    Gateway->>Gateway: Sanitize Inbound Headers & Redact PII
    Gateway->>Vault: Retrieve / Attach Downstream Authorization (rk_live_...)
    Gateway->>Upstream: fetch(downstream_url, vaulted_headers, args) [8s Timeout]
    alt Upstream Responds within 8000ms
        Upstream-->>Gateway: HTTP Response (200 OK, Body)
        Gateway-->>Agent: Mirror Upstream Response (200 OK)
    else Upstream Breaches 8000ms Deadline
        Gateway-->>Agent: HTTP 504 Gateway Timeout
    else Network Connection Refused / DNS Failure
        Gateway-->>Agent: HTTP 502 Bad Gateway
    end
    Gateway-)Queue: Enqueue Sanitized Audit Record (Non-blocking)
```

### Business Invariants:
1. **Zero-Trust Credential Vaulting:** The AI model and agent application never receive or hold downstream production credentials. The gateway injects authorized tokens (`downstream_headers`) in flight only after policy verification passes.
2. **Zero Hot-Path Database Writes:** Telemetry is pushed to BullMQ via Redis. The agent never waits for a database transaction.
3. **Hard 8000ms Circuit Breaker:** Downstream fetches use an `AbortController` capped at 8000ms. If the target service hangs, X4G4T immediately aborts the socket and returns `504 Gateway Timeout`.
4. **Fail-Safe Header Stripping:** Inbound proxy authentication headers (`Authorization: Bearer sec_live_...` or IAM JWTs) are stripped before calling downstream services to prevent token leakage.

---

## 5. Human-in-the-Loop (HITL) State Machine

When a policy triggers **`REQUIRE_APPROVAL`**, the execution is halted and transitioned through the HITL state machine.

```mermaid
stateDiagram-v2
    [*] --> PENDING : Policy triggers REQUIRE_APPROVAL\n(HTTP 202 HELD returned to agent)
    PENDING --> APPROVED : Operator clicks 'Approve' in Slack\nor Dashboard
    PENDING --> REJECTED : Operator clicks 'Reject' in Slack\nor Dashboard
    PENDING --> EXPIRED : Resolution timeout reached (e.g. 15 mins)
    APPROVED --> [*] : Agent polling returns 200 APPROVED\n(Agent resumes execution)
    REJECTED --> [*] : Agent polling returns 200 REJECTED\n(Agent terminates execution)
    EXPIRED --> [*] : Agent polling returns 200 REJECTED
```

### HITL Business Rules:
1. **Agent Suspension:** The gateway returns HTTP 202 `Accepted` with `status: "HELD"`, `hold_id`, and `retry_after_sec: 5`.
2. **Multi-Channel Notification Dispatch:**
   - **In-Portal Admin Console (`/dashboard/approvals`):** Instantly renders pending holds with live JSON argument viewers and 1-click `Approve` / `Reject` buttons.
   - **SMTP Email Notifications:** Sends an HTML alert to `ADMIN_EMAIL` with sanitized arguments, triggered policy name, and direct action links (`/dashboard/approvals?action=approve&holdId=...`).
   - **Slack Block Kit Dispatch:** Formats interactive cards with `Approve Execution` and `Reject / Terminate` buttons.
3. **Idempotency & Concurrency:**
   - Once a hold is marked `APPROVED` or `REJECTED`, subsequent button clicks or webhook invocations return the existing state without duplicate writes.
   - Both Slack and the Admin Portal display the reviewer's identity and timestamp, preventing dual reviews.
4. **Agent Polling Loop:**
   - Agent polls `GET /v1/gateway/hitl/:holdId`.
   - If `PENDING`: returns HTTP 202.
   - If resolved: returns HTTP 200 with `{ "status": "APPROVED" | "REJECTED", "reviewer": "...", "resolved_at": "..." }`.

---

## 6. Asynchronous Telemetry, Hash Chaining & External Log Streaming

### BullMQ Asynchronous Decoupling & External Exporters

All audit logs are dispatched asynchronously with zero hot-path database latency:
1. **Primary Audit Queue:** Pushed to BullMQ Redis queue `audit-logs` for batched PostgreSQL persistence.
2. **Elasticsearch / OpenSearch Stream:** Dispatched to `POST {ELASTICSEARCH_URL}/{INDEX}/_doc` with `@timestamp` and full execution context.
3. **Generic External Webhook Stream:** Dispatched to `POST {EXTERNAL_LOG_WEBHOOK_URL}` for ingestion into Datadog, Splunk, Logstash, or Loki.
4. **Latency Guarantee:** All external log writes run in non-blocking background workers or via `waitUntil()`, adding **$0\text{ms}$** to proxy execution latency.
- Payload contains: `{ orgId, agentId, toolName, arguments, verdict, triggeredPolicyId, latencyMs, createdAt }`.
- Redis writes complete in $<2\text{ms}$.

---

### ISO/IEC 27001 Cryptographic Hash Chaining

To satisfy **ISO/IEC 27001:2022 Control A.8.15 (Logging and Monitoring)**, X4G4T structures execution logs as a tamper-evident cryptographic hash chain.

#### Mathematical Hash Formula:
For each log record $R_i$:
$$\text{PayloadToHash}_i = R_i.\text{id} \parallel R_i.\text{previousRecordHash} \parallel R_i.\text{toolName} \parallel R_i.\text{verdict} \parallel R_i.\text{createdAt}$$
$$R_i.\text{recordHash} = \text{SHA-256}(\text{PayloadToHash}_i)$$

Where:
- $R_0.\text{previousRecordHash} = \text{"GENESIS\_BLOCK"}$ (or the previous epoch hash).
- For $i > 0$, $R_i.\text{previousRecordHash} = R_{i-1}.\text{recordHash}$.

```
┌─────────────────────────┐          ┌─────────────────────────┐          ┌─────────────────────────┐
│       Log Record 1      │          │       Log Record 2      │          │       Log Record 3      │
│ PrevHash: GENESIS       │          │ PrevHash: Hash(Log 1)   │          │ PrevHash: Hash(Log 2)   │
│ Tool: issue_refund      │ ───────> │ Tool: wire_transfer     │ ───────> │ Tool: execute_sql       │
│ Verdict: ALLOW          │          │ Verdict: HELD           │          │ Verdict: BLOCKED        │
│ Hash: 8f4a3...          │          │ Hash: e2b91...          │          │ Hash: 1a7c4...          │
└─────────────────────────┘          └─────────────────────────┘          └─────────────────────────┘
```

#### Verification Invariant:
If an attacker alters any field in $R_1$ (e.g., changes `verdict` from `BLOCKED` to `ALLOW`), $R_1.\text{recordHash}$ changes. Because $R_2.\text{previousRecordHash}$ is immutable, the equation $R_2.\text{previousRecordHash} == \text{Hash}(R_1)$ fails, mathematically invalidating the entire subsequent ledger.

---

## 7. Data Privacy & Crypto-Shredding Mechanics

### In-Flight PII Redaction

Before payloads are enqueued for audit logging, string values are scanned with zero-latency regular expressions and redacted:

| Data Type | Pattern | Replacement String |
| :--- | :--- | :--- |
| Email Address | `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b` | `[REDACTED_EMAIL]` |
| Credit Card Number | `\b(?:\d{4}[-\s]?){3}\d{4}\b\|\b\d{15,16}\b` | `[REDACTED_CARD]` |
| US SSN | `\b\d{3}-\d{2}-\d{4}\b` | `[REDACTED_SSN]` |
| International IBAN | `\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b` | `[REDACTED_IBAN]` |
| Telephone Number | `\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b` | `[REDACTED_PHONE]` |
| Secret Keys / Tokens | `\b(?:sk_live\|sec_live\|rk_live\|Bearer\s+)[A-Za-z0-9_\-.]+\b` | `[REDACTED_SECRET]` |

---

### GDPR Art. 17 / DPDP Sec. 12 Crypto-Shredding

#### The Legal-Technical Paradox:
- **ISO 27001:** Mandates immutable, append-only audit records.
- **GDPR Article 17 / India DPDP Act Section 12:** Mandates the absolute right to have personal data erased upon request.
- **Problem:** Deleting or modifying a row in `execution_logs` breaks the cryptographic hash chain.

#### The X4G4T Solution:
X4G4T employs **Envelope Crypto-Shredding**:
1. When personal data is logged, it is encrypted using an ephemeral **Subject Encryption Key (SEK)** stored in `subject_encryption_keys` via AES-256-GCM:
   $$\text{Ciphertext} = \text{AES-256-GCM}(\text{Payload}, \text{SEK}_{\text{subject\_id}}, \text{IV})$$
2. The audit metadata (Agent ID, tool name, verdict, timestamp, ciphertext hash) forms the ISO 27001 hash chain.
3. **Erasure Execution:** When an erasure request is received:
   - The database destroys $\text{SEK}_{\text{subject\_id}}$ by overwriting it with cryptographically random noise and deleting the row.
   - Without the key, the ciphertext is **mathematically unrecoverable** (information-theoretic erasure under EU EDPB guidelines).
   - The `execution_logs` row and its `record_hash` remain intact, preserving the integrity of the audit chain.

---

## 8. Model Context Protocol (MCP) JSON-RPC 2.0 Router

The MCP router (`POST /v1/gateway/mcp`) implements the standard Model Context Protocol JSON-RPC 2.0 specification for tools.

```mermaid
flowchart TD
    Req[POST /v1/gateway/mcp] --> ParseRPC{Valid JSON-RPC 2.0?}
    ParseRPC -- No --> Err32600[Return code -32600 Invalid Request]
    ParseRPC -- Yes --> CheckMethod{Method Type?}
    
    CheckMethod -- "tools/list" or "initialize" --> ForwardDiscovery[Pass-through to X-Target-MCP-URL]
    ForwardDiscovery --> ReturnUpstream[Return Upstream JSON-RPC Result]
    
    CheckMethod -- "tools/call" --> ExtractArgs[Extract params.name and params.arguments]
    ExtractArgs --> EvalPolicy[Run In-Memory Policy Evaluator]
    
    EvalPolicy -- "BLOCK" --> Return32001[Return JSON-RPC error -32001 Policy Violation]
    EvalPolicy -- "REQUIRE_APPROVAL" --> ReturnHeld[Return JSON-RPC Result with 'isError: true' and HELD card]
    EvalPolicy -- "ALLOW" --> ForwardTool[Forward tools/call to X-Target-MCP-URL]
    ForwardTool --> ReturnToolResult[Return Upstream Tool Result]
```

### MCP Specifics:
1. **Header Requirement:** Must include `X-Target-MCP-URL` specifying the upstream MCP server. Missing header returns JSON-RPC error code `-32602` (Invalid params).
2. **Error Code `-32001` (Policy Violation):** Standardized application error containing `{ tool, policyId, ruleId }`.
3. **Held Execution:** Returns `isError: true` with a text block: `[X4G4T HELD] Action requires human verification. Reviewers alerted via Slack.`

---

## 9. Failure Modes, Fail-Closed Defaults & Edge Cases

| Failure Scenario | System Behavior | Rationale & Invariant |
| :--- | :--- | :--- |
| **Malformed JSON Payload** | Immediate HTTP 400 `BAD_REQUEST` | Never attempt to parse corrupted inputs. |
| **Policy Engine Exception** | Immediate HTTP 422 / Block | **Fail-Closed Default:** If policy evaluation throws, tool execution is blocked. |
| **Downstream Timeout (>8s)** | Abort socket, return HTTP 504 `Gateway Timeout` | Prevents agent resource exhaustion and thread starvation. |
| **Downstream Connection Refused** | Return HTTP 502 `Bad Gateway` | Distinguishes downstream failure from gateway failure. |
| **Redis Queue Disconnection** | Fallback to direct synchronous DB write or warning log | Ensures audit trail is never silently dropped. |
| **Duplicate Slack Button Clicks** | Idempotent resolution: returns existing state | Prevents double-spending or duplicate approval triggers. |
| **Expired HITL Hold (>15m)** | Automatically transitions to `REJECTED` | Stale authorization approvals are forbidden. |
| **Key Revocation Propagation** | Immediate local cache invalidation | Revoked keys cease to function in $<1\text{ms}$. |
| **Emergency AI Lockdown Active** | Immediate HTTP 503 `AI_LOCKDOWN_ACTIVE` | Suspends all autonomous tool execution enterprise-wide without service restarts. |
| **Non-Admin Policy Mutation** | Immediate HTTP 403 `FORBIDDEN` | Separation of Duties: Developers cannot view or modify guardrails governing their agents. |

---

## 10. Emergency Global AI / LLM Lockdown Invariants

1. **Edge Circuit Breaker:** When `isGlobalAiLockdownActive()` is true, both proxy (`:4000`) and serverless gateway (`:3000`) halt all tool executions and return HTTP 503 `AI_LOCKDOWN_ACTIVE`.
2. **Zero Outbound Downstream Traffic:** Under active lockdown, no requests are dispatched to downstream targets or LLM providers.
3. **Audit Compliance:** Blocked lockdown attempts are recorded in Elasticsearch with `triggeredPolicyId: "pol_emergency_ai_lockdown"` and `verdict: "BLOCKED"`.
4. **SecOps Controlled:** Only users authenticated with the `admin` role can activate or deactivate the global lockdown.

---

## 11. RBAC Policy Lockdown & Separation of Duties Invariants

1. **Separation of Duties (SoD):** Standard IAM developers (`role: "developer"`) are restricted from viewing, creating, updating, or toggling security policies.
2. **Deterministic 403 Enforcement:** All policy mutation Server Actions (`createPolicyAction`, `updatePolicyAction`, `togglePolicyAction`, `deployLibraryPolicyAction`) invoke `assertAdminRole()` and throw 403 Forbidden errors if called by non-admins.
3. **Portal View Masking:** The `/dashboard/policies` route displays an access restricted security card for non-admin users, hiding all policy definitions, AST rules, and predefined library templates.
4. **Permitted Developer Scope:** Developers retain full authorization to create user-specific API keys (`sec_live_usr_...`), configure personal LLM vault preferences, and view personal execution telemetry.

