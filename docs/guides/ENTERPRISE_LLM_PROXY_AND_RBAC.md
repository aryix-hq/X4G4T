# X4G4T Enterprise LLM Licensing, Proxy Architecture & RBAC Security Guide

> **Authoritative Technical Guide on Enterprise LLM Governance, Zero-Trust Key Substitution, IAM-Specific Keys, RBAC Policy Lockdown, and Global AI Kill-Switch.**  
> *Designed for SecOps, Platform Engineers, and Enterprise Architects deploying autonomous AI agents.*

---

## Table of Contents

1. [Understanding Enterprise LLM Licensing Models](#1-understanding-enterprise-llm-licensing-models)
   - [1.1 OpenAI Enterprise & ChatGPT Enterprise](#11-openai-enterprise--chatgpt-enterprise)
   - [1.2 Google Cloud Vertex AI (Gemini 1.5 Pro & Flash)](#12-google-cloud-vertex-ai-gemini-15-pro--flash)
   - [1.3 Anthropic Claude Enterprise](#13-anthropic-claude-enterprise)
   - [1.4 AWS Bedrock (Claude, Llama 3, Titan)](#14-aws-bedrock-claude-llama-3-titan)
   - [1.5 Self-Hosted & Local LLMs (Ollama, vLLM, TGI)](#15-self-hosted--local-llms-ollama-vllm-tgi)
2. [Why Direct LLM Key Distribution Fails Enterprise Security](#2-why-direct-llm-key-distribution-fails-enterprise-security)
3. [Zero-Trust Key Substitution & Reverse Proxy Architecture](#3-zero-trust-key-substitution--reverse-proxy-architecture)
   - [3.1 The Middle-Layer Interception Flow](#31-the-middle-layer-interception-flow)
   - [3.2 Zero-Trust Key Swapping Mechanism](#32-zero-trust-key-swapping-mechanism)
4. [IAM User-Specific API Keys](#4-iam-user-specific-api-keys)
   - [4.1 Key Structure and Deterministic Attribution](#41-key-structure-and-deterministic-attribution)
   - [4.2 Enterprise LLM Provider Vault (SecOps Governed)](#42-enterprise-llm-provider-vault-secops-governed)
5. [RBAC Policy Lockdown & Separation of Duties](#5-rbac-policy-lockdown--separation-of-duties)
   - [5.1 Separation of Duties (SoD) Matrix](#51-separation-of-duties-sod-matrix)
   - [5.2 Portal Lockdown & 403 Forbidden Enforcement](#52-portal-lockdown--403-forbidden-enforcement)
   - [5.3 Admin Login Role Stability](#53-admin-login-role-stability)
6. [Emergency Global AI / LLM Lockdown Kill-Switch (Safety Mechanism)](#6-emergency-global-ai--llm-lockdown-kill-switch-safety-mechanism)
   - [6.1 Incident Response Workflow](#61-incident-response-workflow)
   - [6.2 HTTP 503 (AI_LOCKDOWN_ACTIVE) Gateway Circuit Breaker](#62-http-503-ai_lockdown_active-gateway-circuit-breaker)
7. [Policy Freeze Mode (SecOps Configuration Lock)](#7-policy-freeze-mode-secops-configuration-lock)
   - [7.1 Freezing Policy Changes & Preventing Drift](#71-freezing-policy-changes--preventing-drift)
   - [7.2 HTTP 423 Locked Enforcement](#72-http-423-locked-enforcement)
8. [Developer Support & Exemption Requests](#8-developer-support--exemption-requests)
   - [8.1 Developer Exemption Request Workflow](#81-developer-exemption-request-workflow)
   - [8.2 Admin Review & Resolution Audit Trail](#82-admin-review--resolution-audit-trail)
9. [Prometheus Metrics Engine & Observability](#9-prometheus-metrics-engine--observability)
   - [9.1 Exposed Metrics Endpoints](#91-exposed-metrics-endpoints)
   - [9.2 Metric Definitions & Types](#92-metric-definitions--types)
   - [9.3 Prometheus Scrape Configuration (prometheus.yml)](#93-prometheus-scrape-configuration-prometheusyml)
   - [9.4 Sample Alerting Rules](#94-sample-alerting-rules)
10. [Elasticsearch & External Audit Stream Telemetry](#10-elasticsearch--external-audit-stream-telemetry)
    - [10.1 Is Every Request Logged to Elasticsearch?](#101-is-every-request-logged-to-elasticsearch)
    - [10.2 Elasticsearch Log Record Schema](#102-elasticsearch-log-record-schema)
    - [10.3 Elasticsearch Configuration & Streaming Verification](#103-elasticsearch-configuration--streaming-verification)
11. [Server-Side Request Forgery (SSRF) Protection Engine](#11-server-side-request-forgery-ssrf-protection-engine)
    - [11.1 Cloud Metadata & Loopback Defense](#111-cloud-metadata--loopback-defense)
    - [11.2 Private RFC 1918 Subnet Isolation](#112-private-rfc-1918-subnet-isolation)
    - [11.3 Local Development & Testing Configuration](#113-local-development--testing-configuration)
12. [Deny-Always-Wins Policy Evaluation Precedence](#12-deny-always-wins-policy-evaluation-precedence)
    - [12.1 Security Precedence Model (BLOCK > REQUIRE_APPROVAL > ALLOW)](#121-security-precedence-model-block--require_approval--allow)
    - [12.2 Elimination of Policy Race Conditions](#122-elimination-of-policy-race-conditions)
13. [Zero-Trust Identity Enforcement & Anti-Spoofing](#13-zero-trust-identity-enforcement--anti-spoofing)
    - [13.1 Client Header Rejection (X-IAM-*)](#131-client-header-rejection-x-iam-)
    - [13.2 Cryptographic JWT Signature Verification](#132-cryptographic-jwt-signature-verification)
14. [End-to-End Human-in-the-Loop (HITL) Execution Resolution](#14-end-to-end-human-in-the-loop-hitl-execution-resolution)
    - [14.1 Hold Creation & Payload Storage](#141-hold-creation--payload-storage)
    - [14.2 Admin Resolution & Downstream Execution](#142-admin-resolution--downstream-execution)
    - [14.3 Agent Polling Lifecycle & Response Delivery](#143-agent-polling-lifecycle--response-delivery)

---

## 1. Understanding Enterprise LLM Licensing Models

When organizations deploy LLMs in production, they typically license them through one of five enterprise paradigms:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           Enterprise LLM Licensing Matrix                         │
├───────────────────┬──────────────────────┬──────────────────────┬────────────────┤
│ Provider          │ Auth / Credential    │ Billing / Metering   │ Privacy / ZDR  │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────┤
│ OpenAI Enterprise │ sk-proj-... (Master) │ Enterprise Invoice   │ 100% ZDR, no   │
│ (ChatGPT Ent.)    │ Service Accounts     │ Committed Use / MPU  │ model training │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────┤
│ Google Cloud      │ GCP Service Account  │ GCP Project Billing  │ Enterprise ZDR │
│ Vertex AI         │ OAuth2 / Bearer Token│ Invoice / Commit     │ VPC-SC Support │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────┤
│ Anthropic Claude  │ sk-ant-admin-...     │ Monthly / Annual     │ Zero-retention │
│ Enterprise        │ Workspace API Keys   │ Invoicing            │ HIPAA BAA      │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────┤
│ AWS Bedrock       │ AWS IAM Roles / STS  │ AWS Consolidated     │ Isolated VPC,  │
│ (Claude, Llama)   │ SigV4 Request Sign   │ Billing (Pay-as-go)  │ KMS Encryption │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────┤
│ Self-Hosted       │ Internal mTLS / Bearer│ CapEx (NVIDIA H100)  │ Air-gapped, no │
│ (Ollama, vLLM)    │ None (VPC-isolated)  │ Bare-Metal / K8s     │ outbound data  │
└───────────────────┴──────────────────────┴──────────────────────┴────────────────┘
```

### 1.1 OpenAI Enterprise & ChatGPT Enterprise
- **Licensing**: Purchased via committed annual spend agreements with OpenAI. Includes enterprise-grade security, administrative consoles, and workspace analytics.
- **Data Privacy**: Strict Zero Data Retention (ZDR) — customer prompts and outputs are never stored on OpenAI servers for training.
- **Key Distribution**: OpenAI provides master organization keys (`sk-proj-...`) and service account tokens with broad API access.

### 1.2 Google Cloud Vertex AI (Gemini 1.5 Pro & Flash)
- **Licensing**: Governed through Google Cloud Platform (GCP) enterprise contracts and committed use discounts.
- **Authentication**: Authenticates using Google Cloud IAM Service Account keys (`credentials.json`) or short-lived OAuth2 bearer tokens generated via `gcloud auth print-access-token`.
- **Network Isolation**: Enforceable through Google Cloud VPC Service Controls (VPC-SC), preventing data exfiltration outside corporate perimeters.

### 1.3 Anthropic Claude Enterprise
- **Licensing**: Enterprise agreements featuring custom rate limits, organization workspaces, Single Sign-On (SSO/SCIM), and dedicated customer success managers.
- **Authentication**: Managed via Admin API Keys (`sk-ant-admin-...`) and Workspace Keys.

### 1.4 AWS Bedrock (Claude, Llama 3, Titan)
- **Licensing**: Billed through AWS standard billing accounts.
- **Authentication**: Leverages native AWS IAM policies, IAM Roles, and AWS Security Token Service (STS) `AssumeRole` credentials. Requests must be signed using AWS Signature Version 4 (SigV4).

### 1.5 Self-Hosted & Local LLMs (Ollama, vLLM, TGI)
- **Licensing**: Open-weights models (Meta Llama 3, Mistral, Gemma 2, DeepSeek) running on corporate GPU infrastructure (e.g. NVIDIA H100 clusters).
- **Authentication**: Typically network-isolated inside enterprise VPCs without external API key requirements.

---

## 2. Why Direct LLM Key Distribution Fails Enterprise Security

Many organizations make the dangerous mistake of directly distributing raw LLM provider API keys (`sk-proj-...`, `sk-ant-...`) to software engineers, data scientists, and autonomous agent processes.

### Critical Failure Points:
1. **Zero Visibility & Audit Gap**: Direct calls from developer laptops or agent pods to `api.openai.com` bypass corporate monitoring. SecOps has zero insight into prompt contents, PII exfiltration, or tool execution arguments until the end-of-month cloud bill arrives.
2. **Key Leakage & Exfiltration**: A single developer committing a raw `sk-proj-...` master key to a public GitHub repository or public Docker container exposes the entire enterprise OpenAI billing account to unlimited malicious use.
3. **No Dynamic Guardrails**: Direct provider connections cannot enforce deterministic policies (e.g., blocking `rm -rf`, preventing financial transactions > $10,000, or stopping prompt injections).
4. **Runaway Spend & Agent Loops**: Unconstrained autonomous agents entering recursive tool-calling loops can burn tens of thousands of dollars in minutes without an upstream proxy circuit breaker.

---

## 3. Zero-Trust Key Substitution & Reverse Proxy Architecture

X4G4T solves these challenges by acting as a **Zero-Trust Reverse Proxy & Security Firewall** positioned between your agents/developers and downstream LLM providers.

### 3.1 The Middle-Layer Interception Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   X4G4T Gateway Proxy Flow                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

  1. Agent or Developer Runtime
     - OPENAI_BASE_URL = http://localhost:4000/v1
     - Authorization: Bearer sec_live_usr_d892a_... (X4G4T IAM Key)
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │ 2. X4G4T Gateway Proxy (:4000)                                                       │
  │    ├── A. Authenticate X4G4T Key & Resolve IAM User ID ("usr_dev_482")               │
  │    ├── B. Check Emergency Global AI Lockdown Kill-Switch (HTTP 503 if engaged)          │
  │    ├── C. Inspect Payload & Redact PII (GDPR / DPDP Sanitizer)                          │
  │    ├── D. Evaluate Deterministic AST Guardrail Policies (<1ms latency overhead)         │
  │    │      • Verdict: ALLOW -> Proceed to step E                                         │
  │    │      • Verdict: BLOCK -> Return HTTP 422 POLICY_VIOLATION                          │
  │    │      • Verdict: REQUIRE_APPROVAL -> Return HTTP 202 HELD (Trigger HITL Email)      │
  │    ├── E. ZERO-TRUST KEY SUBSTITUTION:                                                  │
  │    │      • Strip: Authorization: Bearer sec_live_usr_d892a_...                         │
  │    │      • Inject: Authorization: Bearer sk-proj-ENTERPRISE-MASTER-KEY                 │
  │    │      • Inject: OpenAI-Organization / GCP Project Headers                           │
  │    └── F. Asynchronous Audit Streaming (Neon Postgres + External Elasticsearch)        │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
  3. Real Downstream LLM Provider Endpoint
     - https://api.openai.com/v1/chat/completions
     - https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
     - https://api.anthropic.com/v1/messages
     - http://internal-ollama:11434/v1/chat/completions
                 │
                 ▼
  4. Response Returned Through Gateway to Agent
```

### 3.2 Zero-Trust Key Swapping Mechanism

1. **Developers and Agents NEVER receive raw LLM keys**: They only possess their personal X4G4T IAM key (`sec_live_usr_...`).
2. **Master Enterprise Keys Stay Vaulted**: Enterprise master keys (`sk-proj-...`, GCP Service Accounts, AWS STS credentials) reside exclusively inside the X4G4T secure vault (`inMemoryLlmConfigs` / encrypted database).
3. **Gateway Injects Credentials at the Edge**: When forwarding the HTTP request downstream, X4G4T strips the client's X4G4T Bearer token and injects the corresponding vaulted provider key.

---

## 4. IAM User-Specific API Keys

### 4.1 Key Structure and Deterministic Attribution

In X4G4T, API keys are not generic strings — they are cryptographically bound to an authenticated IAM user identity:

```
Key Format: sec_live_usr_<user_prefix>_<48_char_random_hex>
Example:    sec_live_usr_d892a_9f43b810ec49d01248a87b1c3e05a76e9f2b1c8a
```

- **User Attribution**: Every key contains an immutable reference to the IAM `userId` that generated it (e.g. `usr_dev_482` / `john.doe@enterprise.internal`).
- **Granular Revocation**: If a developer leaves the company or a laptop is stolen, SecOps can revoke that single key in the X4G4T portal without breaking production services or invalidating the enterprise master LLM key.
- **Tamper-Evident Hashing**: Raw keys are shown only once upon generation. The database stores only a SHA-256 hash (`keyHash`), ensuring zero plaintext exposure even in the event of a database compromise.

### 4.2 Enterprise LLM Provider Vault (SecOps Governed)

In enterprise deployments, LLM provider configurations (OpenAI master keys, Google Cloud Vertex AI service accounts, Anthropic Claude keys, Ollama host URLs) are **centrally governed by SecOps Administrators**:
- **Developer Restriction**: Developers cannot onboard, configure, or modify upstream LLM provider keys or URLs. When a developer visits the keys dashboard (`/dashboard/keys`), the LLM Provider Vault is displayed with a `Restricted: SecOps Governed` badge, and configuration controls are locked.
- **Enterprise Vault**: SecOps administrators configure master credentials once in the portal or via environment variables. These credentials remain securely vaulted and are never exposed to developers or client browsers.
- **Key Substitution**: When an agent executes with a developer's IAM key, X4G4T transparently substitutes the developer key with the enterprise vaulted key at the proxy boundary.

---

## 5. RBAC Policy Lockdown & Separation of Duties

A core tenet of enterprise security is **Separation of Duties (SoD)**: Developers who author autonomous agent code must not be able to disable or weaken the security guardrails that govern those agents, nor can they approve their own held executions or onboard unapproved LLMs.

### 5.1 Separation of Duties (SoD) Matrix

```
┌─────────────────────────────────────────────────┬───────────┬──────────────┐
│ Capability                                      │ Developer │ SecOps Admin │
├─────────────────────────────────────────────────┼───────────┼──────────────┤
│ Log in via Enterprise SSO (Clerk / OIDC / SAML) │    YES    │     YES      │
│ Generate user-specific API keys                 │    YES    │     YES      │
│ View personal agent execution traces & logs     │    YES    │     YES      │
│ Execute agents through Proxy / Gateway          │    YES    │     YES      │
│ Raise Support & Exemption Requests              │    YES    │     YES      │
├─────────────────────────────────────────────────┼───────────┼──────────────┤
│ Onboard / Configure LLM Provider Vault          │  LOCKED   │     YES      │
│ View active guardrail policies (/policies)      │  LOCKED   │     YES      │
│ Create custom AST guardrail rules               │  FORBIDDEN│     YES      │
│ Toggle / Delete policies                        │  FORBIDDEN│     YES      │
│ Deploy policies from Predefined Library         │  FORBIDDEN│     YES      │
│ Toggle Policy Freeze Mode (Configuration Lock)  │  FORBIDDEN│     YES      │
│ Approve / Reject Human-in-the-Loop (HITL) holds │  FORBIDDEN│     YES      │
│ Review & Resolve Developer Support Requests     │  FORBIDDEN│     YES      │
│ Engage Emergency Global AI Lockdown Kill-Switch │  FORBIDDEN│     YES      │
└─────────────────────────────────────────────────┴───────────┴──────────────┘
```

### 5.2 Portal Lockdown & 403 Forbidden Enforcement

1. **Client-Side Portal Lockdown (`/dashboard/policies`)**:
   - If an authenticated IAM user has the role `developer`, the policies page automatically renders a locked security card:
     - Clear indicator: `RBAC POLICY LOCKDOWN ACTIVE`
     - Explanation: "Access Restricted to Organization Administrators. Your IAM identity is authenticated with the developer role."
     - All policy editing tabs, rule builders, and predefined library deployment buttons are completely hidden.
   - The sidebar navigation displays a `Locked` badge next to Guardrail Policies.

2. **HITL Approvals Restriction (`/dashboard/approvals`)**:
   - Developers can inspect held executions, but the "Approve Execution" and "Reject / Terminate" buttons are disabled with the message: `Approval authority restricted to SecOps Administrator`.
   - Developers are provided a 1-click `Request Exemption for this Hold` button that opens a pre-filled Support Request ticket.

3. **Server Action Protection (`assertAdminRole`)**:
   - Server Actions (`createPolicyAction`, `updatePolicyAction`, `togglePolicyAction`, `deployLibraryPolicyAction`, `toggleGlobalAiLockdownAction`, `togglePolicyFreezeAction`, `saveLlmConfigAction`, `resolveHitlRequestAction`, `resolveSupportRequestAction`) enforce strict role validation:
     ```typescript
     export async function assertAdminRole(): Promise<void> {
       const { role } = await getTenantContext();
       if (role !== "admin") {
         throw new Error("403 Forbidden: Only organization administrators (SecOps) have permission for this action.");
       }
     }
     ```
   - Any unauthorized POST request or direct action invocation immediately aborts with an HTTP 403 Forbidden error.

### 5.3 Admin Login Role Stability

When RBAC Policy Lockdown is active across the organization, an administrator logging in must **never default to or be trapped in developer mode**:
- In `apps/web/lib/iam/resolver.ts`, the IAM resolver checks Clerk `publicMetadata.role`, email patterns (e.g. `admin@...`), and user ID prefixes.
- If an admin user logs in, their resolved role is strictly `admin`, granting immediate access to the Policy Engine, Global AI Lockdown controls, Policy Freeze controls, and HITL review queues.
- A built-in role switcher simulator is available in sandbox/demo mode for SecOps engineers to preview the developer experience and verify lockdown behavior without re-authenticating.

---

## 6. Emergency Global AI / LLM Lockdown Kill-Switch (Safety Mechanism)

The **Global AI Lockdown Kill-Switch** is a mission-critical safety mechanism designed to protect enterprise infrastructure against catastrophic agent failures, active prompt injection campaigns, model poisoning, or sudden rogue autonomous execution loops.

### 6.1 Incident Response Workflow

```
[SecOps Incident or Rogue Agent Loop Detected]
                      │
                      ▼
[Click "Engage Emergency Lockdown" in X4G4T Portal]
                      │
                      ├── A. Global Lockdown flag set to TRUE (in-memory & env)
                      ├── B. Prometheus gauge x4g4t_global_ai_lockdown_active set to 1
                      ├── C. Audit event streamed to Elasticsearch & SIEM webhooks
                      ├── D. Red Emergency Banner displayed across all portal dashboards
                      │
                      ▼
[All Incoming Gateway Requests Immediately Intercepted at Edge]
                      │
                      ├── Fastify Proxy Gateway (:4000) returns HTTP 503 (AI_LOCKDOWN_ACTIVE)
                      └── Next.js Serverless Gateway (:3000) returns HTTP 503 (AI_LOCKDOWN_ACTIVE)
```

### 6.2 HTTP 503 (AI_LOCKDOWN_ACTIVE) Gateway Circuit Breaker

When engaged, every request arriving at `/v1/gateway/execute` is immediately halted in $<0.1\text{ms}$ at the gateway boundary:

```json
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": {
    "code": "AI_LOCKDOWN_ACTIVE",
    "message": "All autonomous AI agent executions are currently locked down by SecOps emergency kill-switch.",
    "reason": "Emergency AI kill-switch engaged by SecOps."
  }
}
```

- **Zero Downstream Traffic**: All outbound calls to OpenAI, Google Vertex AI, Anthropic Claude, and local Ollama clusters are completely halted.
- **Edge Circuit Breaking**: Requests are rejected before parsing tool ASTs or reading databases, preventing CPU exhaustion during high-concurrency loops.
- **Instant Deactivation**: SecOps can deactivate the lockdown with a single click once the incident is remediated, restoring normal traffic without service restarts.

---

## 7. Policy Freeze Mode (SecOps Configuration Lock)

While the Global Kill-Switch halts runtime agent traffic, **Policy Freeze Mode** is designed for governance, compliance, and change management.

### 7.1 Freezing Policy Changes & Preventing Drift

During release freezes, quarterly compliance audits (SOC2, ISO 27001), or incident investigations, SecOps teams must prevent unauthorized or accidental modifications to active guardrails:
- When Policy Freeze is enabled, **all policy creation, rule edits, policy toggling, and library deployments are locked**.
- Active guardrails continue evaluating runtime agent traffic normally (traffic is NOT blocked).
- The Policies console displays a prominent `POLICY FREEZE ACTIVE` banner, and all creation/edit buttons are disabled.

### 7.2 HTTP 423 Locked Enforcement

If an API client or script attempts to mutate policies while frozen, the server actions immediately return HTTP 423 Locked:

```typescript
if (isPolicyFreezeActive()) {
  throw new Error("423 Locked: Policy editing is currently frozen by SecOps Admin.");
}
```

---

## 8. Developer Support & Exemption Requests

X4G4T provides an integrated **Support & Exemption Request System** (`/dashboard/approvals` -> Support Requests tab) to streamline communication between developers and SecOps.

### 8.1 Developer Exemption Request Workflow

When an autonomous agent execution is blocked by a guardrail policy or held for HITL review, developers can raise an exemption request directly from the portal:
1. Click **"Raise Support / Exemption Request"** (or click **"Request Exemption for this Hold"** directly from any held execution).
2. Select a category:
   - `POLICY_EXEMPTION`: Request temporary bypass or threshold adjustment for a specific policy.
   - `TOOL_ACCESS`: Request permission to invoke a restricted tool (e.g., `execute_sql`, `kubectl_delete`).
   - `NEW_LLM_PROVIDER`: Request onboarding of a new model or provider (e.g., Claude 3.5 Sonnet, Gemini 1.5 Pro).
   - `BUDGET_INCREASE`: Request rate limit or token quota increases.
   - `EMERGENCY_APPROVAL`: Request immediate sign-off during production incidents.
3. Specify the Target Agent ID, Requested Tool/Model, Priority (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), and Business Justification.
4. The ticket is submitted with status `PENDING`.

### 8.2 Admin Review & Resolution Audit Trail

- SecOps Administrators inspect incoming tickets under the **Support & Exemption Requests** tab.
- Admins review the business case, enter an optional resolution note, and click:
  - **"Approve Exemption"**: Updates ticket status to `APPROVED` with reviewer timestamp and note.
  - **"Decline Request"**: Updates ticket status to `DECLINED` with actionable feedback for the developer.
- All tickets, reviewer IDs, and timestamps are permanently stored for compliance and audit reporting.

---

## 9. Prometheus Metrics Engine & Observability

X4G4T includes a built-in, zero-dependency Prometheus metrics registry producing standard text format (`text/plain; version=0.0.4`).

### 9.1 Exposed Metrics Endpoints

- **Fastify Proxy Gateway**: `http://localhost:4000/metrics`
- **Next.js Web Control Plane**: `http://localhost:3000/api/metrics`

Both endpoints are accessible by Prometheus scrapers without authentication overhead (or protected via network security groups / mTLS in production).

### 9.2 Metric Definitions & Types

| Metric Name | Type | Description | Labels |
| :--- | :--- | :--- | :--- |
| `http_requests_total` | Counter | Total number of HTTP requests processed | `method`, `route`, `status` |
| `http_request_duration_seconds` | Histogram | Round-trip request latency in seconds | Cumulative buckets: 1ms to 8s |
| `policy_evaluation_duration_seconds` | Histogram | Pure in-memory AST policy evaluation latency | Cumulative buckets: 50µs to 10ms |
| `downstream_forward_duration_seconds` | Histogram | Latency of outbound downstream LLM/target calls | Cumulative buckets: 10ms to 8s |
| `hitl_requests_total` | Counter | Total Human-in-the-Loop holds triggered | None |
| `x4g4t_global_ai_lockdown_active` | Gauge | Emergency kill-switch status (1 = active, 0 = normal) | None |
| `x4g4t_policy_freeze_active` | Gauge | Policy editing freeze status (1 = frozen, 0 = normal) | None |
| `process_uptime_seconds` | Gauge | Process uptime in seconds | None |
| `process_resident_memory_bytes` | Gauge | Resident memory size (RSS) in bytes | None |
| `process_heap_used_bytes` | Gauge | V8 heap memory used in bytes | None |

### 9.3 Prometheus Scrape Configuration (prometheus.yml)

Add the following scrape jobs to your `prometheus.yml`:

```yaml
scrape_configs:
  # X4G4T Fastify Ingestion Gateway
  - job_name: "x4g4t-proxy"
    scrape_interval: 10s
    scrape_timeout: 5s
    static_configs:
      - targets: ["x4g4t-proxy.internal:4000"]
    metrics_path: "/metrics"

  # X4G4T Web Control Plane
  - job_name: "x4g4t-web"
    scrape_interval: 30s
    scrape_timeout: 10s
    static_configs:
      - targets: ["x4g4t-web.internal:3000"]
    metrics_path: "/api/metrics"
```

### 9.4 Sample Alerting Rules

```yaml
groups:
  - name: x4g4t-alerts
    rules:
      # Alert when Emergency Kill-Switch is engaged
      - alert: X4G4TGlobalAiLockdownActive
        expr: x4g4t_global_ai_lockdown_active == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "X4G4T Global AI Lockdown is ENGAGED"
          description: "All autonomous agent executions are being rejected with HTTP 503."

      # Alert when AST policy evaluation exceeds SLA (>5ms)
      - alert: X4G4THighPolicyLatency
        expr: histogram_quantile(0.99, sum(rate(policy_evaluation_duration_seconds_bucket[5m])) by (le)) > 0.005
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "X4G4T AST policy evaluation latency exceeds 5ms"
          description: "P99 policy evaluation latency is {{ $value }}s."

      # Alert on high rate of 5xx errors
      - alert: X4G4TGatewayErrorSpike
        expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "X4G4T gateway 5xx error rate exceeds 5%"
```

---

## 10. Elasticsearch & External Audit Stream Telemetry

### 10.1 Is Every Request Logged to Elasticsearch?

**YES.** Every single request processed by the X4G4T proxy — whether it is:
- `PASSED` (allowed and forwarded downstream)
- `BLOCKED` (rejected by an AST guardrail policy)
- `HELD` (suspended pending Human-in-the-Loop review)
- `AI_LOCKDOWN_ACTIVE` (halted by the emergency kill-switch)

triggers asynchronous telemetry streaming to configured external log services via `exportLogToExternalServices()`.

### 10.2 Elasticsearch Log Record Schema

Each log record sent to Elasticsearch contains:

```json
{
  "orgId": "org_enterprise_prod",
  "agentId": "secops-autofix-agent",
  "toolName": "execute_bash_command",
  "arguments": {
    "command": "kubectl get pods -n production"
  },
  "verdict": "PASSED",
  "triggeredPolicyId": null,
  "latencyMs": 4,
  "statusCode": 200,
  "recordHash": "d8f1e2c4b8a7...",
  "previousRecordHash": "a1b2c3d4e5f6...",
  "isPiiRedacted": false,
  "createdAt": "2026-09-19T07:25:37.622Z",
  "@timestamp": "2026-09-19T07:25:37.622Z"
}
```

- **`recordHash` & `previousRecordHash`**: ISO 27001 SHA-256 cryptographic hash chaining prevents retroactive tampering with log entries in SIEM systems.
- **GDPR / DPDP PII Redaction**: Any sensitive customer data (SSNs, credit card numbers, email addresses, phone numbers) is automatically replaced with `[REDACTED_PII]` before streaming to Elasticsearch.

### 10.3 Elasticsearch Configuration & Streaming Verification

To enable real-time streaming to your enterprise Elasticsearch or OpenSearch cluster, configure the following environment variables in `.env`:

```bash
# Elasticsearch Connection Details
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=x4g4t-audit-logs
ELASTICSEARCH_API_KEY=your-base64-encoded-api-key # Optional if using API key auth
ELASTICSEARCH_USERNAME=elastic                    # Optional if using basic auth
ELASTICSEARCH_PASSWORD=your-cluster-password      # Optional if using basic auth

# Optional Generic Webhook (Splunk / Datadog / Custom SIEM)
LOG_WEBHOOK_URL=https://siem.enterprise.internal/v1/x4g4t-events
LOG_WEBHOOK_SECRET=your-hmac-sha256-signing-secret
```

Verify index population using `curl`:

```bash
curl -X GET "http://localhost:9200/x4g4t-audit-logs/_search?pretty&size=5"
```

---

## 11. Server-Side Request Forgery (SSRF) Protection Engine

Autonomous AI agents often dynamically construct downstream API URLs or interact with external services. Without robust SSRF defenses, an agent manipulated by prompt injection or rogue instructions could target internal cloud metadata endpoints or private network resources.

### 11.1 Cloud Metadata & Loopback Defense

X4G4T evaluates all `downstream_url` parameters prior to forwarding. By default, the gateway strictly blocks:

- **Cloud Instance Metadata Services (IMDS):**
  - AWS, GCP, Azure, OpenStack IMDS: `169.254.169.254`
  - AWS ECS Task Metadata: `169.254.170.2`
  - GCP Metadata Domain: `metadata.google.internal`, `metadata`
  - Oracle Cloud IMDS: `192.0.0.192`
- **Loopback & Localhost:**
  - IPv4 Loopback: `127.0.0.0/8` (`127.0.0.1`, `localhost`, `*.localhost`)
  - IPv6 Loopback: `::1`, `::`

When an agent attempts to target a blocked hostname or IP, X4G4T aborts execution immediately with HTTP `400 Bad Request`:

```json
{
  "error": {
    "code": "SSRF_BLOCKED",
    "message": "Downstream target rejected by SSRF guard: Access to cloud metadata service '169.254.169.254' is strictly blocked."
  }
}
```

### 11.2 Private RFC 1918 Subnet Isolation

In production environments (`NODE_ENV=production`), X4G4T prevents agents from communicating with internal corporate networks unless explicitly whitelisted:

- `10.0.0.0/8` (Class A private networks)
- `172.16.0.0/12` (Class B private networks, including Docker/Kubernetes container networks)
- `192.168.0.0/16` (Class C private networks)
- `100.64.0.0/10` (Carrier-grade NAT)

### 11.3 Local Development & Testing Configuration

During local development and automated CI testing, target mock servers often run on `http://127.0.0.1:<port>` or `http://localhost:<port>`. To permit local testing without disabling production guards:

```bash
# Allow local addresses for development or automated testing suites
ALLOW_LOCAL_DOWNSTREAM=true
```

---

## 12. Deny-Always-Wins Policy Evaluation Precedence

When multiple security policies match an agent tool execution, X4G4T enforces strict **Deny-Always-Wins** security semantics.

### 12.1 Security Precedence Model

The evaluation engine evaluates all active policies matching the target tool and applies the following precedence:

$$\mathbf{BLOCK} \succ \mathbf{REQUIRE\_APPROVAL} \succ \mathbf{ALLOW}$$

1. **`BLOCK` (Highest Precedence):** If **any** matching policy produces a `BLOCK` verdict, execution is immediately halted with HTTP `422 Unprocessable Entity (POLICY_VIOLATION)`.
2. **`REQUIRE_APPROVAL` (Medium Precedence):** If no policy blocks the request, but **at least one** matching policy requires human intervention, the request is placed on hold with HTTP `202 Accepted (HELD)`.
3. **`ALLOW` (Lowest Precedence):** Execution proceeds downstream with HTTP `200 OK` only if all matching policies evaluate to `ALLOW` and zero policies demand higher restrictions.

### 12.2 Elimination of Policy Race Conditions

By evaluating all applicable policies rather than terminating on the first match (first-match-wins), X4G4T guarantees that no permissible rule can inadvertently bypass a restrictive rule configured by SecOps.

---

## 13. Zero-Trust Identity Enforcement & Anti-Spoofing

### 13.1 Client Header Rejection (`X-IAM-*`)

In untrusted network boundaries, malicious agents or compromised clients could attempt privilege escalation by passing custom headers such as:
- `X-IAM-Roles: admin,superuser`
- `X-IAM-User-Id: usr_secops_root`
- `X-IAM-Groups: executive_approvers`

**X4G4T strictly discards all unauthenticated client-supplied `X-IAM-*` headers.** Identity attributes, roles, and group memberships are extracted exclusively from cryptographically authenticated credentials:
- Validated Database API Keys (`sec_live_...`)
- Cryptographically verified enterprise IAM JWTs

### 13.2 Cryptographic JWT Signature Verification

When agents authenticate via enterprise Single Sign-On (SSO) or Identity Provider tokens (Clerk, WorkOS, Okta, Azure AD, Cognito):
- X4G4T verifies HMAC-SHA256 signatures using `IAM_JWT_SECRET` (or provider JWKS public keys).
- In production environments (`NODE_ENV=production`), unsigned tokens or tokens signed with invalid secrets are rejected with HTTP `401 Unauthorized (INVALID_IAM_TOKEN)`.
- Identity claims (`sub`, `iss`, `aud`, `exp`, `nbf`, `roles`, `groups`) are parsed and normalized into the immutable execution context.

---

## 14. End-to-End Human-in-the-Loop (HITL) Execution Resolution

High-risk actions (wire transfers, database migrations, IAM permission escalations) require human authorization before execution.

```
┌─────────┐              ┌──────────────┐              ┌───────────────┐              ┌────────────┐
│  Agent  │              │ X4G4T GW  │              │ Admin Portal  │              │ Downstream │
└────┬────┘              └──────┬───────┘              └───────┬───────┘              └─────┬──────┘
     │ 1. POST /execute         │                              │                            │
     ├─────────────────────────►│                              │                            │
     │   (evaluates to HELD)    │                              │                            │
     │ 2. 202 Accepted {hold_id}│                              │                            │
     │◄─────────────────────────┤                              │                            │
     │                          │ 3. Send Notification         │                            │
     │                          ├─────────────────────────────►│                            │
     │ 4. GET /hitl/:holdId     │                              │                            │
     │    (status: PENDING)     │                              │                            │
     ├─────────────────────────►│                              │                            │
     │    202 Retry-After: 5    │                              │                            │
     │◄─────────────────────────┤                              │                            │
     │                          │                              │ 5. Admin Approves Hold     │
     │                          │◄─────────────────────────────┤                            │
     │                          │ 6. Forward Tool Call Downstream                           │
     │                          ├──────────────────────────────────────────────────────────►│
     │                          │ 7. Return Execution Response │                            │
     │                          │◄──────────────────────────────────────────────────────────┤
     │ 8. GET /hitl/:holdId     │                              │                            │
     ├─────────────────────────►│                              │                            │
     │ 9. 200 OK {status:       │                              │                            │
     │    "APPROVED", response} │                              │                            │
     │◄─────────────────────────┤                              │                            │
```

### 14.1 Hold Creation & Payload Storage

When policy evaluation produces `REQUIRE_APPROVAL`:
1. X4G4T generates a unique `holdId` (`UUIDv4`).
2. The complete tool execution payload (`downstream_url`, `downstream_headers`, `arguments`) is securely vaulted alongside the hold record.
3. An administrative alert is dispatched via SMTP email and Slack Block Kit.
4. The gateway returns HTTP `202 Accepted` containing the `hold_id` and recommended polling interval:
   ```json
   {
     "status": "HELD",
     "hold_id": "8f3b2a1c-...",
     "message": "Operation requires human intervention. Poll or wait for webhook resolution.",
     "retry_after_sec": 5
   }
   ```

### 14.2 Admin Resolution & Downstream Execution

When an authorized SecOps administrator clicks **Approve** in the X4G4T Portal:
1. The server executes the vaulted tool call downstream against `downstream_url` with configured timeout and circuit breakers.
2. The downstream response (status code and body) is captured and associated with the hold record.
3. An immutable audit record is appended with reviewer identity and timestamp.

### 14.3 Agent Polling Lifecycle & Response Delivery

The agent periodically queries `GET /v1/gateway/hitl/:holdId`:
- While pending review: Returns HTTP `202 Accepted` with `{ "status": "PENDING", "retry_after_sec": 5 }`.
- Upon approval: Returns HTTP `200 OK` with `{ "status": "APPROVED", "reviewer": "admin@enterprise.com", "response": { ... } }`.
- Upon rejection: Returns HTTP `200 OK` with `{ "status": "REJECTED", "reviewer": "admin@enterprise.com", "message": "Execution rejected by administrator." }`.

This eliminates the circular approval loop and allows autonomous agents to safely resume their workflow with the verified downstream result.
