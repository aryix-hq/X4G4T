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
   - [4.2 Personal LLM Provider Vault](#42-personal-llm-provider-vault)
5. [RBAC Policy Lockdown (Developer vs. SecOps Admin)](#5-rbac-policy-lockdown-developer-vs-secops-admin)
   - [5.1 Separation of Duties (SoD) Matrix](#51-separation-of-duties-sod-matrix)
   - [5.2 Portal Lockdown & 403 Forbidden Enforcement](#52-portal-lockdown--403-forbidden-enforcement)
6. [Emergency Global AI / LLM Lockdown Kill-Switch](#6-emergency-global-ai--llm-lockdown-kill-switch)
   - [6.1 Incident Response Workflow](#61-incident-response-workflow)
   - [6.2 HTTP 503 (AI_LOCKDOWN_ACTIVE) Gateway Circuit Breaker](#62-http-503-ai_lockdown_active-gateway-circuit-breaker)
7. [Elasticsearch & External Audit Stream Telemetry](#7-elasticsearch--external-audit-stream-telemetry)
   - [7.1 Is Every Request Logged to Elasticsearch?](#71-is-every-request-logged-to-elasticsearch)
   - [7.2 Elasticsearch Log Record Schema](#72-elasticsearch-log-record-schema)
   - [7.3 Elasticsearch Configuration & Streaming Verification](#73-elasticsearch-configuration--streaming-verification)

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

### 4.2 Personal LLM Provider Vault

Standard IAM users can navigate to **Dashboard -> API Keys & LLM Vault** (`/dashboard/keys`) to configure their personal provider preferences:
- **OpenAI ChatGPT**: Target model (e.g., `gpt-4o`, `gpt-4o-mini`, `o1-preview`), API key, or enterprise gateway URL.
- **Google Gemini**: Target model (e.g., `gemini-1.5-pro`, `gemini-1.5-flash`), Google AI Studio / Vertex AI API key.
- **Anthropic Claude**: Target model (e.g., `claude-3-5-sonnet-20241022`), Claude API key.
- **Ollama**: Target local/remote model (e.g., `llama3.1:8b`, `qwen2.5-coder:32b`), Base URL (e.g., `http://localhost:11434/v1`).
- **Antigravity**: Target model (e.g., `agy-research-v1`, `agy-coder`), custom endpoint URL.

---

## 5. RBAC Policy Lockdown (Developer vs. SecOps Admin)

A core tenet of enterprise security is **Separation of Duties (SoD)**: Developers who write AI agent code must not be able to disable or weaken the security guardrails that govern those agents.

### 5.1 Separation of Duties (SoD) Matrix

```
┌─────────────────────────────────────────────────┬───────────┬──────────────┐
│ Capability                                      │ Developer │ SecOps Admin │
├─────────────────────────────────────────────────┼───────────┼──────────────┤
│ Log in via Enterprise SSO (Clerk / OIDC / SAML) │    YES    │     YES      │
│ Generate user-specific API keys                 │    YES    │     YES      │
│ Configure personal LLM Provider Vault           │    YES    │     YES      │
│ View personal agent execution traces & logs     │    YES    │     YES      │
│ Execute agents through Proxy / Gateway          │    YES    │     YES      │
├─────────────────────────────────────────────────┼───────────┼──────────────┼
│ View active guardrail policies (/policies)      │  LOCKED   │     YES      │
│ Create custom AST guardrail rules               │  FORBIDDEN│     YES      │
│ Toggle / Delete policies                        │  FORBIDDEN│     YES      │
│ Deploy policies from Predefined Library         │  FORBIDDEN│     YES      │
│ Approve / Reject Human-in-the-Loop (HITL) holds │  FORBIDDEN│     YES      │
│ Engage Emergency Global AI Lockdown             │  FORBIDDEN│     YES      │
└─────────────────────────────────────────────────┴───────────┴──────────────┘
```

### 5.2 Portal Lockdown & 403 Forbidden Enforcement

1. **Client-Side Portal Lockdown (`/dashboard/policies`)**:
   - If an authenticated IAM user has the role `developer`, the policies page automatically renders a locked security card:
     - Clear indicator: `RBAC POLICY LOCKDOWN ACTIVE`
     - Explanation: "Access Restricted to Organization Administrators. Your IAM identity is authenticated with the developer role."
     - All policy editing tabs, rule builders, and predefined library deployment buttons are completely hidden.
   - The sidebar navigation displays a `Locked` badge next to Guardrail Policies.

2. **Server Action Protection (`assertAdminRole`)**:
   - Server Actions (`createPolicyAction`, `updatePolicyAction`, `togglePolicyAction`, `deployLibraryPolicyAction`, `toggleGlobalAiLockdownAction`) enforce strict role validation:
     ```typescript
     export async function assertAdminRole(): Promise<void> {
       const { role } = await getTenantContext();
       if (role !== "admin") {
         throw new Error("403 Forbidden: Only organization administrators (SecOps) can modify guardrail policies.");
       }
     }
     ```
   - Any unauthorized POST request or direct action invocation immediately aborts with an HTTP 403 error.

---

## 6. Emergency Global AI / LLM Lockdown Kill-Switch

In high-threat scenarios (such as an active prompt injection campaign, rogue agent loop, or data breach), SecOps teams require an immediate **kill-switch** to halt all AI agent execution across the enterprise without taking down application infrastructure.

### 6.1 Incident Response Workflow

```
[SecOps Incident Detected]
            │
            ▼
[Click "Engage Emergency Lockdown" in X4G4T Portal]
            │
            ├── A. Global Lockdown flag set to TRUE (in-memory & env)
            ├── B. Audit event exported to Elasticsearch & Webhooks
            ├── C. Red Emergency Banner displayed across all portal dashboards
            │
            ▼
[All Incoming Gateway Requests Immediately Intercepted]
            │
            ├── Proxy (:4000) returns HTTP 503 (AI_LOCKDOWN_ACTIVE)
            └── Serverless (:3000) returns HTTP 503 (AI_LOCKDOWN_ACTIVE)
```

### 6.2 HTTP 503 (AI_LOCKDOWN_ACTIVE) Gateway Circuit Breaker

When the kill-switch is engaged, every request arriving at `/v1/gateway/execute` (both Fastify proxy and Next.js serverless route) is immediately rejected:

```json
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": {
    "code": "AI_LOCKDOWN_ACTIVE",
    "message": "All autonomous AI agent executions are currently locked down by SecOps emergency kill-switch."
  }
}
```

- **Zero Downstream Traffic**: Downstream calls to OpenAI, Google Vertex AI, Anthropic, or internal LLMs are completely suspended.
- **Zero Policy Latency**: Requests are rejected at the edge in <0.5ms before executing policy evaluation or database lookups.
- **Audit Logging Maintained**: The blocked attempt is logged to Elasticsearch with `triggeredPolicyId: "pol_emergency_ai_lockdown"` and `verdict: "BLOCKED"`.

---

## 7. Elasticsearch & External Audit Stream Telemetry

### 7.1 Is Every Request Logged to Elasticsearch?

**YES.** Every single request processed by the X4G4T proxy — whether it is:
- `PASSED` (allowed and forwarded downstream)
- `BLOCKED` (rejected by an AST guardrail policy)
- `HELD` (suspended pending Human-in-the-Loop review)
- `AI_LOCKDOWN_ACTIVE` (halted by the emergency kill-switch)

triggers asynchronous telemetry streaming to configured external log services via `exportLogToExternalServices()`.

### 7.2 Elasticsearch Log Record Schema

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

### 7.3 Elasticsearch Configuration & Streaming Verification

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

