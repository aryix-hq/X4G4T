# Cloud Provider Integration: Google Gemini, OpenAI & Anthropic

## 1. The Enterprise Credential Problem

In traditional AI agent setups, developers or CI pipelines configure raw cloud API keys (`sk-proj-...`, `AIzaSy...`, or `sk-ant-...`) directly in workstation `.env` files or agent config blocks.

### The Security Hazards
- **Credential Exfiltration:** Prompt injection attacks can trick an agent into printing or transmitting its environment variables.
- **Runaway Token Spend:** A rogue agent running in an infinite loop can consume \$10,000s of token credits in minutes.
- **Zero Attribution:** Upstream cloud provider logs only record that the company master key was used—they cannot pinpoint *which developer* or *which agent* triggered the request.

---

## 2. Reverse Key Injection Architecture

X4G4T completely eliminates raw credentials from developer workstations and AI agent memory:

```
  AI Agent (Cursor / Claude Code)
         │
         │ Uses Dummy Token: Bearer sec_live_dev_token
         ▼
  [X4G4T Reverse Proxy Gateway]
         │
         ├─▶ 1. Authenticate Client Identity (Resolve Email & IP)
         ├─▶ 2. Enforce Sliding-Window Token Quota (Per-developer limits)
         ├─▶ 3. In-Flight DLP Scrubbing (Redact secrets before egress)
         ├─▶ 4. Strip Dummy Bearer Header
         ├─▶ 5. Inject Vaulted Enterprise Master Key (e.g. Gemini / OpenAI)
         │
         ▼ Forward over TLS
  [Cloud Endpoint (generativelanguage.googleapis.com / api.openai.com)]
```

---

## 3. Provider Configuration Reference

### Google Gemini API Integration
Register the Gemini provider in X4G4T:

```sql
INSERT INTO upstream_providers (
  id, org_id, name, provider_type, base_url, auth_token, is_internal, is_active
) VALUES (
  'provider_google_gemini',
  'org_enterprise_corp',
  'Google Gemini 1.5 Pro (Enterprise Vaulted)',
  'CUSTOM',
  'https://generativelanguage.googleapis.com',
  'AIzaSy_VAULTED_ENTERPRISE_MASTER_KEY_SECRET',
  false,
  true
);
```

### Agent Invocation via Reverse Key Injection
The agent issues requests against the proxy without possessing the real key:

```bash
curl -X POST http://localhost:4000/v1/gateway/llm/provider_google_gemini/v1beta/models/gemini-1.5-pro:generateContent \
  -H "Authorization: Bearer sec_live_dev_key_12345678901234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{ "text": "Draft an executive summary of our Q3 security posture." }]
    }]
  }'
```

### What Happened Under the Hood:
1. X4G4T validated the dummy developer key `sec_live_dev_key_...` in `<0.05ms`.
2. Checked rate limits and verified client identity.
3. Evaluated DLP rules against the prompt text.
4. Stripped the dummy header and injected the enterprise Gemini API key.
5. Emitted an immutable forensic audit log to Kafka binding the request to the human developer.
