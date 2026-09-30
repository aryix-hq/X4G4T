# Local LLM Integration: Dockerized Ollama & vLLM

## 1. Overview & Architecture

Running local large language models (via **Ollama**, **vLLM**, or **LocalAI**) provides full data residency and zero external cloud costs. However, local models are susceptible to prompt injection and malicious tool misuse.

**X4G4T** acts as the secure ingress gateway for all local inference workloads:

```
  AI Coding Agent (Cursor / VS Code)
               │
               ▼
  [X4G4T Gateway (/v1/gateway/llm/:providerId/*)]
               │
               ├─▶ 1. Authenticate Developer Identity & Check Quota
               ├─▶ 2. In-Flight DLP Prompt Scrubbing (Redact PII/Keys)
               ├─▶ 3. AST Guardrail Validation on Embedded Tool Calls
               │
               ▼ Forward sanitized request
  [Dockerized Ollama Engine (http://localhost:11434)]
               │
               ▼ Stream tokens back to client
  [SSE Token Forwarding & Real-Time Audit Emission to Kafka]
```

---

## 2. Registering an Ollama Provider in X4G4T

You can register your local Ollama instance via the Web Console (`/dashboard/settings`) or SQL seed:

```sql
INSERT INTO upstream_providers (
  id, org_id, name, provider_type, base_url, is_internal, is_active
) VALUES (
  'provider_local_ollama',
  'org_enterprise_corp',
  'Local Docker Ollama (Llama 3.2)',
  'OLLAMA',
  'http://localhost:11434',
  true,
  true
);
```

---

## 3. Invoking Ollama via X4G4T

Configure your agent or API client to point to the X4G4T reverse proxy route:

```bash
# Direct Ollama Generate Endpoint via X4G4T Gateway
curl -X POST http://localhost:4000/v1/gateway/llm/provider_local_ollama/api/generate \
  -H "Authorization: Bearer sec_live_dev_key_12345678901234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:1b",
    "prompt": "Analyze the customer table and output schema recommendations.",
    "stream": false
  }'
```

### In-Flight Security Protections
1. **DLP Pre-Screening:** If the prompt contains unmasked credit cards or AWS keys, they are redacted in-place before the prompt reaches Ollama.
2. **Embedded Tool Call Interception:** If the model emits or is instructed to execute structured tool calls (`tools` or `tool_calls` in the request body), X4G4T validates each tool call against your compiled AST policies before forwarding.
3. **Audit Trail:** Every inference session records prompt token counts, latency, and full identity metadata to Kafka.
