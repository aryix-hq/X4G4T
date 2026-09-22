# X4G4T: End-User & Developer Guide

Welcome to **X4G4T** — the ultra-low-latency ($<15\text{ms}$) headless audit and policy firewall for autonomous AI agent tool calls and Model Context Protocol (MCP) servers.

This guide walks you through onboarding, creating API keys, defining deterministic guardrail policies, integrating your AI agents (via REST and MCP), handling Human-in-the-Loop (HITL) approvals via Slack, and inspecting live audit telemetry.

---

## Table of Contents
1. [Core Concepts](#1-core-concepts)
2. [Step 1: Onboarding & API Key Provisioning](#2-step-1-onboarding--api-key-provisioning)
3. [Step 2: Defining Guardrail Policies](#3-step-2-defining-guardrail-policies)
4. [Step 3: Integrating Your AI Agent](#4-step-3-integrating-your-ai-agent)
   - [REST Gateway (`/v1/gateway/execute`)](#rest-gateway-v1gatewayexecute)
   - [Model Context Protocol (`/v1/gateway/mcp`)](#model-context-protocol-v1gatewaymcp)
5. [Step 4: Human-in-the-Loop (HITL) Approvals](#5-step-4-human-in-the-loop-hitl-approvals)
6. [Step 5: Live Telemetry & Audit Stream](#6-step-5-live-telemetry--audit-stream)
7. [Step 6: Compliance & Tamper-Evidence Verification](#7-step-6-compliance--tamper-evidence-verification)

---

## 1. Core Concepts: Centralized Gateway Architecture

X4G4T acts as a **Centralized Inline Gateway & Firewall** sitting directly in the execution path between polyglot AI agent runtimes (OpenAI ChatGPT, Google Gemini, Anthropic Claude, LangChain, Cursor, Claude Desktop) and your upstream enterprise APIs / microservices (Stripe, Postgres, Salesforce, AWS, internal SaaS).

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

- **Zero-Latency In-Memory Evaluation:** Policies are evaluated in pure AST memory in $<0.15\,\mu\text{s}$ ($0.00015\,\text{ms}$).
- **Zero-Trust Credential Vaulting:** Downstream API keys and database credentials are held in X4G4T. The LLM only receives tool declarations; it never has direct access to production secrets.
- **Three Deterministic Verdicts:**
  - `ALLOW` (200 OK): Payload satisfies all guardrails; forwarded immediately to downstream target with vaulted credentials.
  - `BLOCK` (422 Unprocessable): Payload violates policy; rejected with HTTP 422 `POLICY_VIOLATION` (or JSON-RPC `-32001`). Downstream APIs are **never** touched.
  - `REQUIRE_APPROVAL` (202 Accepted): High-impact action suspended; dispatches interactive approval card to Slack with HMAC-SHA256 buttons.
- **Fail-Closed Security:** If an invalid payload is received, the firewall denies execution by default.

---

## 2. Step 1: Onboarding, API Keys & LLM Provider Vault

### 1. Access the Dashboard
Navigate to the X4G4T Web Dashboard at `http://localhost:3000` (or your company's deployed URL). Log in using your enterprise SSO or credentials.

### 2. Generate an X4G4T Proxy Key
1. Navigate to **API Keys & LLM Vault** in the sidebar navigation (`/dashboard/keys`).
2. Click **Generate Secret Key**.
3. Copy your plain-text key (`sec_live_...`).

> [!IMPORTANT]
> **One-Time Secret Reveal:** Your plain-text API key (`sec_live_...`) is displayed **only once**. X4G4T immediately hashes the key using SHA-256 and never stores the raw secret. Copy the key and store it securely in your secret manager (e.g., AWS Secrets Manager, Vault, `.env`).

```bash
# Example Generated Key
sec_live_9f81a7b6c5d4e3f201928374abcdef12
```

### 3. Configure Upstream LLM Providers (Zero-Trust Vault)
On the **LLM Provider Vault** tab (`/dashboard/keys`):
- **OpenAI (ChatGPT):** Vault your `OPENAI_API_KEY`, select target models (`gpt-4o`, `gpt-4o-mini`, `o1`), and configure the gateway base URL.
- **Google Gemini:** Vault your `GEMINI_API_KEY` and select models (`gemini-1.5-pro`, `gemini-1.5-flash`).
- **Anthropic Claude:** Vault your `ANTHROPIC_API_KEY` and select models (`claude-3-5-sonnet`, `claude-3-5-haiku`).
- **Ollama (Air-Gapped / Local):** Point to your local Ollama endpoint (`http://localhost:11434`) with zero cloud key exposure.
- **Antigravity / MCP:** Point to your local or hosted MCP gateway (`http://localhost:4000/v1/gateway/mcp`).

> [!TIP]
> **Zero-Trust Guarantee:** Upstream credentials are held securely in X4G4T. Even if an AI agent is prompt-injected or compromised, it cannot exfiltrate your backend API keys or database passwords.

---

## 3. Step 2: Defining Guardrail Policies

Policies enforce deterministic constraints on structured tool arguments before those arguments leave the agent runtime.

### 1. Navigate to Policy Management
Click **Policies** in the sidebar navigation (`/dashboard/policies`).

### 2. Create a Policy
Fill out the **Add New Policy Rule** form:
- **Policy Name:** Descriptive title (e.g., `Enforce Max Refund Threshold`).
- **Target Tool:** The exact name of the tool invoked by the agent (e.g., `issue_refund`, `execute_sql`, `transfer_funds`, or `*` for all tools).
- **Action on Match:**
  - `BLOCK`: Immediately deny the tool execution.
  - `REQUIRE_APPROVAL`: Suspend execution and alert human operators in Slack.
  - `ALLOW`: Explicitly allow matching operations.
- **Field Dot-Path:** Nested path to the argument property (e.g., `amount`, `transaction.total`, `user.email`, `query`).
- **Operator:**
  - `EQUALS` / `NOT_EQUALS`: Exact string/number match.
  - `GREATER_THAN` / `LESS_THAN`: Numeric threshold comparisons.
  - `GREATER_THAN_OR_EQUAL` / `LESS_THAN_OR_EQUAL`: Inclusive numeric bounds.
  - `CONTAINS`: Substring search.
  - `REGEX`: Regular expression matching (e.g., `(?i)DROP\s+TABLE`).
  - `IN`: Comma-delimited list inclusion (e.g., `US,CA,GB`).
- **Target Value:** Comparison value (e.g., `250` for refund caps or `(?i)(DROP|TRUNCATE)` for SQL protection).

### Example Policy Configurations

| Tool Name | Field Path | Operator | Target Value | Action | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `issue_refund` | `amount` | `GREATER_THAN` | `250` | `BLOCK` | Prevent hallucinated refunds $> \$250$ |
| `wire_transfer` | `amount` | `GREATER_THAN_OR_EQUAL`| `10000` | `REQUIRE_APPROVAL` | Require human sign-off for large wires |
| `execute_sql` | `query` | `REGEX` | `(?i)DROP\s+TABLE` | `BLOCK` | Prevent catastrophic table drops |
| `deploy_service`| `environment` | `EQUALS` | `production` | `REQUIRE_APPROVAL` | Gate production releases |

---

## 4. Step 3: Integrating Your AI Agent via Centralized Gateway

All agent runtimes route outbound tool calls through the **Centralized Gateway** instead of calling downstream APIs directly. The gateway verifies active policies in `<0.15µs`, enforces IAM permissions, redacts PII, and securely injects vaulted downstream credentials.

### Centralized Gateway Endpoint Specifications
- **Method:** `POST`
- **Endpoint:** `http://localhost:4000/v1/gateway/execute` (or your production gateway URL)
- **Headers:**
  - `Authorization: Bearer <X4G4T_API_KEY>` (or enterprise IAM JWT)
  - `Content-Type: application/json`
  - `x-iam-roles: <OPTIONAL_COMMA_DELIMITED_ROLES>` (e.g. `support_agent,contractor`)
  - `x-iam-user-id: <OPTIONAL_USER_IDENTIFIER>`

```json
{
  "agent_id": "customer_service_agent_v1",
  "tool_name": "issue_refund",
  "arguments": {
    "amount": 45,
    "customer_id": "cust_12345",
    "reason": "customer_request"
  },
  "downstream_url": "https://api.stripe.com/v1/refunds",
  "downstream_headers": {
    "Authorization": "Bearer rk_live_stripe_secret_key"
  }
}
```

---

### Integration Example 1: OpenAI / ChatGPT Function Calling (TypeScript)

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const X4G4T_GATEWAY = "http://localhost:4000/v1/gateway/execute";

async function runChatGptAgent(prompt: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "issue_refund",
          description: "Process customer refund",
          parameters: {
            type: "object",
            properties: { order_id: { type: "string" }, amount: { type: "number" } },
            required: ["order_id", "amount"]
          }
        }
      }
    ]
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) return completion.choices[0]?.message?.content;

  // Intercept tool execution via Centralized Gateway
  const gatewayRes = await fetch(X4G4T_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.X4G4T_API_KEY}`,
      "Content-Type": "application/json",
      "x-iam-roles": "support_agent"
    },
    body: JSON.stringify({
      agent_id: "chatgpt-support-bot",
      tool_name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
      downstream_url: "https://api.stripe.com/v1/refunds",
      downstream_headers: { "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    })
  });

  if (gatewayRes.status === 422) {
    const error = await gatewayRes.json();
    return `Blocked by X4G4T Policy: ${error.error.message}`;
  }
  if (gatewayRes.status === 202) {
    const hold = await gatewayRes.json();
    return `Action held for supervisor approval in Slack (Hold ID: ${hold.hold_id})`;
  }

  return await gatewayRes.json();
}
```

---

### Integration Example 2: Google Gemini Function Calling (TypeScript)

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const X4G4T_GATEWAY = "http://localhost:4000/v1/gateway/execute";

async function runGeminiAgent(prompt: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    tools: [
      {
        functionDeclarations: [
          {
            name: "execute_sql",
            description: "Run analytical SQL query",
            parameters: {
              type: "OBJECT" as any,
              properties: { query: { type: "STRING" as any } },
              required: ["query"]
            }
          }
        ]
      }
    ]
  });

  const chat = model.startChat();
  const response = await chat.sendMessage(prompt);
  const call = response.response.functionCalls()?.[0];
  if (!call) return response.response.text();

  // Centralized Gateway Intercept
  const gatewayRes = await fetch(X4G4T_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.X4G4T_API_KEY}`,
      "Content-Type": "application/json",
      "x-iam-roles": "analyst"
    },
    body: JSON.stringify({
      agent_id: "gemini-analyst",
      tool_name: call.name,
      arguments: call.args,
      downstream_url: "https://db.internal.company.com/query",
      downstream_headers: { "x-db-token": process.env.INTERNAL_DB_TOKEN }
    })
  });

  const result = await gatewayRes.json();
  const followUp = await chat.sendMessage([
    { functionResponse: { name: call.name, response: result } }
  ]);
  return followUp.response.text();
}
```

---

### Integration Example 3: Python (LangChain / CrewAI / Requests)

```python
import os
import requests

X4G4T_PROXY_URL = "http://localhost:4000/v1/gateway/execute"
X4G4T_API_KEY = os.environ["X4G4T_API_KEY"]

def execute_guarded_tool(tool_name: str, arguments: dict, target_url: str):
    headers = {
        "Authorization": f"Bearer {X4G4T_API_KEY}",
        "Content-Type": "application/json",
        "x-iam-roles": "engineer",
        "x-iam-user-id": "usr_python_agent_01"
    }
    payload = {
        "agent_id": "langchain_payment_agent",
        "tool_name": tool_name,
        "arguments": arguments,
        "downstream_url": target_url,
        "downstream_headers": {
            "Authorization": f"Bearer {os.environ.get('DOWNSTREAM_API_KEY', '')}"
        }
    }
    
    response = requests.post(X4G4T_PROXY_URL, json=payload, headers=headers)
    
    if response.status_code == 200:
        return response.json()
    elif response.status_code == 422:
        violation = response.json()
        print(f"🚨 BLOCKED: {violation['error']['message']}")
        return {"error": "Policy violation", "details": violation}
    elif response.status_code == 202:
        hold_info = response.json()
        print(f"⏳ HELD: Action requires approval. Hold ID: {hold_info['hold_id']}")
        return hold_info
    else:
        response.raise_for_status()
```

---

### Model Context Protocol (`/v1/gateway/mcp`)

If you use **Claude Desktop**, **Cursor**, or custom MCP clients, X4G4T provides native JSON-RPC 2.0 proxying.

#### Configuring Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "guarded-enterprise-tools": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-proxy-client",
        "--gateway", "http://localhost:4000/v1/gateway/mcp",
        "--token", "sec_live_your_api_key_here",
        "--target-mcp", "http://internal-tools.corp.local/rpc"
      ]
    }
  }
}
```

#### What Happens Under the Hood:
1. **Discovery Frames (`tools/list`):** Transparently passed to your upstream MCP server.
2. **Compliant Tool Calls (`tools/call`):** Verified against policy and forwarded to the upstream server.
3. **Violating Tool Calls:** Intercepted and returned as standard JSON-RPC error `-32001`:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 101,
     "error": {
       "code": -32001,
       "message": "Execution blocked by policy: Triggered policy 'Enforce Max Refund Threshold' for tool 'issue_refund'",
       "data": { "tool": "issue_refund", "policy_id": "pol_123" }
     }
   }
   ```
4. **Held Tool Calls:** Returned with `[X4G4T HELD]` notification card and `isError: true`.

---

## 5. Step 4: Multi-Channel Human-in-the-Loop (HITL) Approvals

When an agent triggers a `REQUIRE_APPROVAL` policy:
1. **Immediate Agent Response:** X4G4T returns HTTP 202 `Accepted` with a `hold_id` and retry instructions.
2. **Multi-Channel Alert Dispatch:**
   - **In-Portal Admin Console (`/dashboard/approvals`):** Live queue of pending requests where operators can inspect full argument JSON and click **Approve Execution** or **Reject / Terminate**.
   - **SMTP Email Notifications:** Sends an HTML alert to `ADMIN_EMAIL` containing tool details, risk level, and direct 1-click approval links.
   - **Slack Block Kit Alert:** Dispatches an interactive card with approve/reject buttons directly to your team channel.

```text
┌────────────────────────────────────────────────────────────┐
│ 🛡️ X4G4T Security Alert: Action Requires Approval      │
│                                                            │
│ • Organization: Acme Corp (org_123)                        │
│ • Agent ID: finance_treasury_bot                           │
│ • Tool: wire_transfer                                      │
│ • Hold ID: hold_982374-123                                 │
│                                                            │
│ Arguments:                                                 │
│ {                                                          │
│   "amount": 50000,                                         │
│   "beneficiary": "Global Logistics Ltd",                   │
│   "iban": "GB29NWBK60161331926819"                         │
│ }                                                          │
│                                                            │
│  [ ✅ Approve in Portal ]        [ 🛑 Reject / Terminate ] │
└────────────────────────────────────────────────────────────┘
```

### Agent Polling Loop
While suspended, the agent periodically polls the HITL status endpoint:

```http
GET /v1/gateway/hitl/:holdId
Authorization: Bearer sec_live_...
```

- **Pending:** HTTP 202 `{"status": "PENDING", "retry_after_sec": 5}`
- **Approved:** HTTP 200 `{"status": "APPROVED", "reviewer": "admin_usr", "resolved_at": "..."}`
- **Rejected:** HTTP 200 `{"status": "REJECTED", "reviewer": "admin_usr", "resolved_at": "..."}`

---

## 6. Step 5: Live Telemetry, Audit Stream & External Log Sinks

### 1. In-App Audit Stream & Analytics
Navigate to **Audit Stream & Analytics** (`/dashboard/logs`) to inspect:
- **Live Intercept KPIs:** Total requests, pass rate, block rate, and held rate.
- **Latency Monitoring:** Average gateway overhead ($<1\text{ms}$).
- **Full Payload Inspection:** Inspect sanitized argument JSON and policy matching metadata.

### 2. Elasticsearch & External Log Streaming
X4G4T can stream all intercepted tool executions to external SIEM / log providers without adding hot-path latency:
- **Elasticsearch / OpenSearch:** Configure `ELASTICSEARCH_URL` (e.g. `http://localhost:9200`) and `ELASTICSEARCH_INDEX` (e.g. `x4g4t-logs`) in `.env`. Logs are indexed with `@timestamp` and full execution context.
- **Generic Log Webhooks:** Configure `EXTERNAL_LOG_WEBHOOK_URL` to stream JSON events to Datadog, Splunk, Logstash, New Relic, or Grafana Loki.
- **Non-blocking Guarantee:** Telemetry is pushed asynchronously in background workers, adding **0ms** to LLM agent response times.

---

## 7. Step 6: Compliance & Tamper-Evidence Verification

### ISO 27001 Cryptographic Hash Chaining
Every execution log entry is hashed using SHA-256:
$$\text{record\_hash} = \text{SHA-256}(\text{id} : \text{previous\_record\_hash} : \text{tool} : \text{verdict} : \text{timestamp})$$
Retroactively modifying any historical log record breaks the chain, providing mathematical proof of audit trail integrity.

### GDPR & DPDP Crypto-Shredding
- In-flight personal identifiable information (emails, credit cards, SSNs) is automatically redacted in logs.
- When an individual exercises their **Right to Erasure** (GDPR Art. 17 / DPDP Sec. 12), their encryption key in `subject_encryption_keys` is destroyed. The encrypted arguments become permanently unrecoverable without altering or deleting the audit record's cryptographic hash chain.

