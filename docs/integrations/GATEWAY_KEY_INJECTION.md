# Enterprise Gateway Key Injection & Client Isolation Guide

This document details the architecture, threat model, and configuration for **Centralized Upstream Key Injection** in **X4G4T**.

---

## 1. Executive Summary & Problem Statement

In conventional AI engineering environments, developers and CLI agents store raw upstream master API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) on local workstations, in `.env` files, or in IDE settings (Cursor, VS Code, Claude Desktop, Copilot).

### Severe Risks of Client-Side Master Keys:
1. **Prompt Injection Credential Exfiltration**: Autonomous agents with tool execution access can be tricked by malicious prompts into reading `.env` files or echoing API keys to external endpoints.
2. **Key Sprawl & Accidental Git Leaks**: Master keys hardcoded or committed to git repositories lead to catastrophic budget drain or intellectual property exposure.
3. **Zero Cost & Quota Governance**: When developers use direct provider keys, organizations cannot enforce per-developer token caps, sliding-window rate limits, or DLP inspection.
4. **Painful Key Rotation**: Rotating a compromised master key requires updating dozens of developer laptops, CI/CD runners, and production microservices simultaneously.

---

## 2. The 3 Pillars of X4G4T Key Injection

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER WORKSTATION / IDE                     │
│  (Cursor, VS Code, Claude Desktop, LangChain, CLI Agents)             │
│                                                                        │
│  Environment / Configuration:                                          │
│  OPENAI_API_KEY="sk-ant-dummy-developer-token"                        │
│  GEMINI_API_KEY="dummy-gemini-key"                                     │
│  OPENAI_BASE_URL="http://localhost:4000/v1"  (or transparent CoreDNS)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ 1. Request with Dummy / Gateway Key
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        X4G4T PROXY GATEWAY                          │
│                                                                        │
│  [ Step 1: Ingestion & Auth ]                                          │
│  - Authenticates developer session / corporate VPN subnet              │
│  - Strips incoming dummy or gateway credentials                        │
│                                                                        │
│  [ Step 2: Policy & Security Inspection ]                              │
│  - AST Policy evaluation (Deny-Always-Wins)                            │
│  - Sliding-window rate limit check                                     │
│  - DLP Inspection: Luhn credit card check, AWS/GitHub secrets, PII    │
│  - Human-in-the-Loop hold check for high-impact actions                │
│                                                                        │
│  [ Step 3: Upstream Key Injection ]                                    │
│  - Resolves target provider domain                                     │
│  - Retrieves vaulted master key from KeyVault / Secret Manager         │
│  - Attaches provider-specific authentication header                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ 2. Forwarded with Vaulted Master Key
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     UPSTREAM LLM CLOUD PROVIDERS                       │
│                                                                        │
│   Google Gemini           OpenAI (ChatGPT)         Anthropic Claude    │
│   Header: x-goog-api-key  Header: Bearer <sk-..>   Header: x-api-key   │
└────────────────────────────────────────────────────────────────────────┘
```

### Pillar 1: Central Storage (Key Vault & Secret Manager)
Master LLM provider keys are stored exclusively within X4G4T:
- In Docker: `.env.docker` vaulted configuration.
- In Kubernetes: Kubernetes Secrets (`k8s/02-secrets.yaml`), Azure KeyVault, AWS Secrets Manager, or HashiCorp Vault via External Secrets Operator.

### Pillar 2: Client Isolation (Zero Credential Exposure)
Clients, IDEs, and agents only communicate with X4G4T using:
- **X4G4T Developer Tokens** (`sec_live_...`), or
- **Dummy IDE Placeholder Keys** (`sk-ant-dummy-developer-token`, `dummy-developer-token`, `sk-dummy`).
Clients **never receive or process** real upstream credentials.

### Pillar 3: Upstream Header Injection
Before forwarding the inspected payload downstream, X4G4T removes client headers and attaches the vendor-specific authentication protocol:

| Provider | Target Endpoint | Injected Header | Protocol Details |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `generativelanguage.googleapis.com` | `x-goog-api-key: $GEMINI_API_KEY` | Strips `Authorization`, injects Google API key header. |
| **OpenAI (ChatGPT / o1)** | `api.openai.com` | `Authorization: Bearer $OPENAI_API_KEY` | Replaces dummy client token with enterprise master key. |
| **Anthropic Claude** | `api.anthropic.com` | `x-api-key: $ANTHROPIC_API_KEY`<br>`anthropic-version: 2023-06-01` | Strips `Authorization`, injects Anthropic API key and version header. |

---

## 3. Implementation in Code

X4G4T executes key injection directly within [`apps/proxy/src/services/gateway.ts`](../apps/proxy/src/services/gateway.ts):

```typescript
const authHeader = injectedHeaders["Authorization"] || injectedHeaders["authorization"];
const isGatewayProxyKey = Boolean(authHeader && authHeader.includes("sec_live_"));
const isDummyKey = Boolean(
  authHeader &&
  (authHeader.includes("dummy") ||
   authHeader.includes("sk-ant-dummy") ||
   authHeader.includes("sk-dummy") ||
   authHeader.includes("developer-session"))
);

// If caller authenticated via X4G4T or used a dummy key from a corporate subnet:
if (!authHeader || isGatewayProxyKey || isDummyKey) {
  if (url.includes("api.openai.com") && process.env.OPENAI_API_KEY) {
    injectedHeaders["Authorization"] = `Bearer ${process.env.OPENAI_API_KEY}`;
  } else if (url.includes("api.anthropic.com") && process.env.ANTHROPIC_API_KEY) {
    delete injectedHeaders["Authorization"];
    delete injectedHeaders["authorization"];
    injectedHeaders["x-api-key"] = process.env.ANTHROPIC_API_KEY;
    injectedHeaders["anthropic-version"] = injectedHeaders["anthropic-version"] || "2023-06-01";
  } else if (url.includes("generativelanguage.googleapis.com") && process.env.GEMINI_API_KEY) {
    delete injectedHeaders["Authorization"];
    delete injectedHeaders["authorization"];
    injectedHeaders["x-goog-api-key"] = process.env.GEMINI_API_KEY;
  }
}
```

---

## 4. Workstation Configuration Examples

### Cursor IDE
Configure `.cursor/settings.json` or Global Settings:
```json
{
  "cursor.openaiBaseUrl": "http://localhost:4000/v1",
  "cursor.apiKey": "sk-ant-dummy-developer-token"
}
```

### Python SDK (OpenAI)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="dummy-developer-token"  # Real key injected by X4G4T
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Analyze system performance"}]
)
```

### Google GenAI (Gemini) SDK
```python
import google.generativeai as genai

# Point client or reverse DNS to X4G4T
genai.configure(
    api_key="dummy-gemini-key",
    client_options={"api_endpoint": "http://localhost:4000"}
)
```

---

## 5. Security Verification & Test Coverage

The gateway injection engine is continuously verified in the automated test suite ([`apps/proxy/test/rate-limit-dlp-proxy.test.ts`](../apps/proxy/test/rate-limit-dlp-proxy.test.ts)):
1. Requests dispatched with `Authorization: Bearer sk-ant-dummy-developer-token` are accepted.
2. The proxy verifies the caller originates from an approved corporate subnet or loopback.
3. The dummy header is stripped.
4. Downstream fetch interceptor confirms the upstream target receives the vaulted master key (`Bearer sk-corp-master-openai-key-...` or `x-goog-api-key: ...`).

