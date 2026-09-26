# Connecting Your Tools to X4G4T

This guide explains how to connect your preferred AI developer tools, IDE extensions, coding assistants, and automated pipelines through the **X4G4T Enterprise AI Gateway**.

By routing traffic through X4G4T, all prompts and completions are automatically guarded by your team's DLP scanners, sliding-window rate limits, and security policies.

---

## 1. How It Works: The "Reverse Auth" Pattern

Traditional corporate setups require developers to paste expensive corporate API keys into their personal laptops, risking accidental leakage in git commits or terminal histories.

X4G4T solves this with **Gateway Key Injection**:
- You configure your IDE with a dummy key (e.g., `sk-ant-dummy-developer-token` or `dummy-key`).
- As long as you are connected to the corporate network or VPN, X4G4T automatically identifies you, verifies your identity, and injects the genuine enterprise credentials into upstream requests to OpenAI, Anthropic, or Google Gemini.

```
┌─────────────────┐       Dummy Key        ┌─────────────────┐    Real Enterprise Key    ┌─────────────────┐
│  Cursor / Cline │ ────────────────────►  │  X4G4T Gateway  │  ─────────────────────►   │ OpenAI / Claude │
│  Developer IDE  │   http://proxy:8080    │  Key Injection  │     api.openai.com    │   Cloud Model   │
└─────────────────┘                        └─────────────────┘                           └─────────────────┘
```

---

## 2. Setting Up Popular Developer Tools

### 1. Cursor IDE
1. Open Cursor Settings (`Cmd + ,` or `Ctrl + ,`).
2. Navigate to **Features** $\rightarrow$ **AI** $\rightarrow$ **OpenAI API Key**.
3. Toggle on **Override OpenAI Base URL**.
4. Set the Base URL to:
   ```text
   http://localhost:8080/v1
   ```
5. Set the API Key to:
   ```text
   sk-dummy-developer-session
   ```
6. Click **Save** and verify completion in the chat window.

---

### 2. VS Code (Cline / Roo Code / Continue)
For VS Code extensions that interact with LLMs:
1. Open extension settings.
2. Select provider: **OpenAI Compatible**.
3. Set the base URL:
   ```text
   http://localhost:8080/v1
   ```
4. Set the API Key:
   ```text
   dummy-key
   ```
5. Specify your desired model (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`). X4G4T routes requests to the correct upstream provider automatically.

---

### 3. Windsurf IDE
1. Navigate to **Windsurf Settings** $\rightarrow$ **Model Provider**.
2. Select **Custom OpenAI Endpoint**.
3. Enter URL: `http://localhost:8080/v1`
4. Enter API Key: `dummy-developer-token`

---

### 4. Local Ollama & Hybrid Routing
If you run local models via Ollama and want X4G4T to audit internal queries:
1. Point your client to X4G4T at `http://localhost:8080/v1`.
2. Configure upstream fallback in your proxy `.env`:
   ```bash
   UPSTREAM_BASE_URL=http://localhost:11434/v1
   ```
3. All local model interactions are now recorded in your team's centralized Graylog and Prometheus audit dashboards.

---

### 5. Python & Node.js SDKs

#### Python (`openai` library)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sec_live_corp_token_12345678"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Analyze database schema for user accounts."}
    ]
)
print(response.choices[0].message.content)
```

#### Node.js (`openai` package)
```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8080/v1",
  apiKey: "sec_live_corp_token_12345678"
});

const completion = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Generate SQL migration" }]
});
console.log(completion.choices[0].message.content);
```

---

## 3. Troubleshooting & Frequently Asked Questions (FAQ)

### Q: Why am I getting an HTTP 429 Too Many Requests error?
**A:** Your agent or script has exceeded its sliding-window rate limit quota (default is 100 requests per hour).
- Inspect the response headers: `Retry-After` specifies the seconds until quota resets.
- If you require a higher burst ceiling for batch jobs, request an exemption from your security team in the Web Dashboard.

### Q: Why did my request return HTTP 422 Unprocessable Content?
**A:** The Data Loss Prevention (DLP) scanner intercepted sensitive secrets in your prompt or tool arguments (e.g., hardcoded AWS keys, unmasked passwords, or credit card numbers). Remove the credentials or use environment variables before retrying.

### Q: Why is my request hanging for up to 15 minutes with HTTP 202?
**A:** Your request triggered a **Human-in-the-Loop (HITL)** approval rule (e.g., high-risk database mutation or financial transaction). A notification was sent to your team's Slack security channel. Once an authorized supervisor clicks **Approve**, the request resumes automatically.

### Q: Why am I getting HTTP 503 Service Unavailable?
**A:** An emergency kill switch is currently engaged (either globally or for your organization). Contact your security administrator to verify system status.
