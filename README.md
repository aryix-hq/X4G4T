# X4G4T: Zero-latency, headless policy firewall and Data Leakage Prevention (DLP) proxy for AI agents and Model Context Protocol (MCP) servers.

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test Suite](https://img.shields.io/badge/Tests-100%25_Passing-brightgreen.svg)](https://github.com/aryix-hq/X4G4T)
[![AST Evaluation](https://img.shields.io/badge/AST_Evaluation-%3C0.2ms-orange.svg)](docs/PERFORMANCE_BENCHMARKS.md)
[![mcp-proxy](https://img.shields.io/badge/topic-mcp--proxy-blue.svg)](https://github.com/topics/mcp-proxy)
[![agent-guardrails](https://img.shields.io/badge/topic-agent--guardrails-green.svg)](https://github.com/topics/agent-guardrails)
[![dlp-proxy](https://img.shields.io/badge/topic-dlp--proxy-purple.svg)](https://github.com/topics/dlp-proxy)
[![ai-agent-security](https://img.shields.io/badge/topic-ai--agent--security-red.svg)](https://github.com/topics/ai-agent-security)
[![model-context-protocol](https://img.shields.io/badge/topic-model--context--protocol-yellow.svg)](https://github.com/topics/model-context-protocol)
[![rate-limiting](https://img.shields.io/badge/topic-rate--limiting-teal.svg)](https://github.com/topics/rate-limiting)

**The Headless AI Agent Security Firewall, Model Context Protocol (MCP) Proxy & Zero-Trust Governance Gateway.**

*Sub-millisecond runtime policy enforcement, zero-trust LLM credential substitution, in-flight DLP redaction, SSRF protection, sliding-window rate limiting, and tamper-evident audit logging for autonomous agents and MCP servers.*

[Quickstart](#-3-minute-quickstart) • [How It Works](docs/HOW_IT_WORKS.md) • [Policy Guide](docs/POLICY_GUIDE.md) • [Connect Tools](docs/CONNECTING_YOUR_TOOLS.md) • [Architecture](#-architecture--visual-flow) • [Features](#-core-capabilities) • [Docs](docs/) • [Contributing](CONTRIBUTING.md)

</div>

---

> ### 🧸 In Plain English (The 10-Year-Old Explanation):
> Imagine you have a super-smart robot assistant, but you don't want it accidentally spending your money, deleting your homework, or sharing your secret passwords. **X4G4T is the invisible safety shield** that watches every single tool your robot tries to use and stops bad mistakes before they can ever happen.

---

## 🌟 The Top 5 Things X4G4T Does For You

1. **🛡️ The Airport Security Scanner (Policy Firewall)**: Evaluates every tool action your AI assistant takes (running bash scripts, calling external APIs, executing database queries) in **< 0.2ms** ($<200\,\mu\text{s}$) and blocks dangerous commands instantly.
2. **🔒 The VIP Badge & Secret Vault (Zero-Trust Key Injection)**: Your AI agents only hold safe dummy tokens. X4G4T automatically swaps in real master production keys at the edge so rogue prompts can never steal or leak your cloud credentials.
3. **✍️ The Blackout Marker (Data Loss Prevention / DLP)**: Automatically detects and blacks out customer credit cards, Social Security numbers, and passwords before an AI can send or expose them.
4. **👥 The Manager's Signature (Human-in-the-Loop Approvals)**: If an agent tries to do something risky—like refunding over \$500 or deleting a record—X4G4T halts execution and pings your Slack channel with an interactive 1-click **Approve** button.
5. **🚨 The Building Circuit Breaker (Emergency Global Kill-Switch)**: If anything ever goes wrong or an active threat is detected, one click flips the global lockdown switch, freezing 100% of outbound AI agent actions enterprise-wide in **0.00ms**.

---

## ⚖️ Feature Comparison: Without X4G4T vs. With X4G4T

| Agent Threat Vector | Without X4G4T (Raw Agent Access) | With X4G4T (Protected Runtime) |
| :--- | :--- | :--- |
| **Accidental Database Deletion** | Agent runs `DROP TABLE users;` $\rightarrow$ Production outage and data loss. | Blocked in **0.18ms** $\rightarrow$ Agent receives safety warning and self-corrects. |
| **Cloud Credential Theft** | Prompt injection tricks agent into reading `.env` $\rightarrow$ Master keys leaked to web. | Agent only holds dummy key $\rightarrow$ Real keys safely locked inside gateway vault. |
| **PII & Customer Data Exposure** | Customer credit cards or SSNs sent into third-party cloud LLMs. | DLP engine detects and redacts tokens in-flight with `[REDACTED_CC]`. |
| **Runaway Billing & Loops** | Rogue agent loops through paid APIs overnight $\rightarrow$ \$10,000+ unexpected bill. | Sliding-window token buckets and rate-limits hard-cap traffic and enforce quotas. |
| **High-Value Wire Transfers** | Agent autonomously executes irreversible financial or cloud infrastructure actions. | Put on **HOLD** $\rightarrow$ Manager notified on Slack $\rightarrow$ Requires human signature. |
| **SOC 2 & ISO 27001 Auditing** | No unified log of what autonomous agents executed in production. | Every tool call cryptographically signed in a tamper-evident SHA-256 audit chain. |

---

## ⚡ Why X4G4T?

Autonomous AI coding agents (Claude Code, Cursor, Windsurf, Devin), agentic frameworks (LangChain, CrewAI, AutoGen), and Model Context Protocol (MCP) clients execute real shell commands, call APIs, mutate databases, and handle sensitive infrastructure credentials. 

**Without an inline firewall, rogue autonomous agents can:**
- 🚨 **Exfiltrate Master LLM Keys**: Prompt injection can trick agents into reading `.env` files or dumping environment variables.
- 💥 **Execute Destructive Operations**: Accidentally run `DROP TABLE`, terminate production EC2 instances, or trigger high-value wire transfers.
- 🕵️ **Leak Sensitive PII**: Pass customer SSNs, credit cards, or Aadhaar numbers into third-party cloud LLMs.
- 🌐 **Probe Internal Networks (SSRF)**: Scan local loopback addresses (`127.0.0.1`) or query AWS/GCP cloud metadata endpoints (`169.254.169.254`).

**X4G4T acts as an ultra-low-latency reverse proxy and policy firewall** placed directly between your AI agent runtimes and upstream LLMs or downstream tools. Every tool execution is parsed, evaluated against pure in-memory Abstract Syntax Tree (AST) guardrails in **<0.2ms**, checked for SSRF/DLP violations, and either **ALLOWED**, **BLOCKED**, or held for **HUMAN-IN-THE-LOOP (HITL)** approval.

---

## 🏛️ Architecture & Visual Flow

```
                                ┌────────────────────────────────────────────────────────┐
                                │          X4G4T CENTRALIZED GATEWAY (:4000)          │
     Autonomous AI Agents       │                                                        │       Downstream Targets
   ┌─────────────────────────┐  │  ┌──────────────────────────────────────────────────┐  │     ┌───────────────────┐
   │ Cursor / Claude Code    │  │  │ 1. Upstream LLM Key Vault & Egress Injection     │  │ ──► │ OpenAI / Anthropic│
   │ Windsurf / Cline / Roo  │  │  │    (Agents use local keys; gateway injects real) │  │     │ Google Gemini     │
   └────────────┬────────────┘  │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
                │               │  │ 2. Sub-Millisecond AST Evaluator (<0.2ms)        │  │
   ┌────────────┴────────────┐  │  │    - Numerical bounds, regex, enum operators     │  │     ┌───────────────────┐
   │ LangChain / AutoGen     │ ─┼─►│    - IAM role/group permissions enforcement      │  │ ──► │ Stripe / Payments │
   └────────────┬────────────┘  │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
                │               │  │ 3. Enterprise DLP & SSRF Guards                  │  │
   ┌────────────┴────────────┐  │  │    - Luhn CC, SSN, Aadhaar, AWS key scrub        │  │     ┌───────────────────┐
   │ MCP Clients             │  │  │    - Cloud metadata (169.254.169.254) blocked    │  │ ──► │ PostgreSQL / SQL  │
   │ (JSON-RPC tools/call)   │  │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
   └─────────────────────────┘  │  │ 4. Tamper-Evident Daily Audit Logging            │  │
                                │  │    - Fire-and-forget Graylog/ES indexing         │  │     ┌───────────────────┐
                                │  │    - Real-time Prometheus metrics exposition     │  │ ──► │ AWS / Kubernetes  │
                                │  └────────────────────────┬─────────────────────────┘  │     └───────────────────┘
                                └───────────────────────────┼────────────────────────────┘
                                                            │
                                                            ▼ (On REQUIRE_APPROVAL)
                                                   ┌─────────────────┐
                                                   │ Slack / Email   │
                                                   │ HITL Sign-off   │
                                                   └─────────────────┘
```

---

## 🚀 3-Minute Quickstart

X4G4T ships with a complete, production-grade **Turn-Key Docker Compose Stack** including PostgreSQL, Redis, Elasticsearch/Graylog, Prometheus, Grafana, Fastify Gateway, and Next.js Web UI.

### 1. Start the System
```bash
# Clone the repository
git clone https://github.com/aryix-hq/X4G4T.git
cd X4G4T

# Start all services in detached mode
docker compose up -d

# Verify health
docker compose ps
```

### 2. Verify Your First Protected Request
Run this `curl` command to test your new proxy firewall:
```bash
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_x4g4t_demo" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "demo_agent_1",
    "tool_name": "database_query",
    "arguments": {
      "query": "SELECT * FROM users LIMIT 5;"
    }
  }'
```
Expected response:
```json
{
  "verdict": "ALLOW",
  "latencyMs": 0,
  "toolName": "database_query",
  "message": "Tool execution passed all active policy guardrails."
}
```

### 3. Access Endpoints
| Component | Local URL | Default Credentials | Purpose |
| :--- | :--- | :--- | :--- |
| **X4G4T Web Control Plane** | [http://localhost:3000](http://localhost:3000) | Instant Sandbox Mode (or Clerk SSO) | Visual policy editor & live audit log |
| **Fastify Proxy Gateway** | [http://localhost:4000](http://localhost:4000) | Header: `Authorization: Bearer sec_live_x4g4t_demo` | The inline agent firewall endpoint |
| **Grafana Observability** | [http://localhost:3001](http://localhost:3001) | Pre-authenticated Admin (`admin` / `admin`) | 17 pre-built security & traffic panels |
| **Prometheus Raw Metrics** | [http://localhost:9090](http://localhost:9090) | Scrapes `/metrics` every 5 seconds | Real-time prometheus telemetry |
| **Graylog Search Engine** | [http://localhost:9000](http://localhost:9000) | Pre-configured Admin (`admin` / `admin`) | Compliance log retention & forensics |

### 📦 Pre-Built GitHub Container Registry (GHCR) Images
Pre-built multi-architecture (`linux/amd64`, `linux/arm64`) images are published to GitHub Container Registry:
```bash
docker pull ghcr.io/aryix-hq/x4g4t-proxy:latest
docker pull ghcr.io/aryix-hq/x4g4t-web:latest
```

---

## 🗺️ Codebase & Directory Roadmap

```text
├── apps/
│   ├── proxy/              # The high-speed Fastify policy firewall (<0.2ms latency)
│   ├── web/                # The Next.js 14 control plane dashboard & policy manager
│   ├── aux-ops/            # Background worker for heavy reports & scheduled syncs
│   ├── graylog-forwarder/  # High-throughput streaming forwarder for compliance logs
│   └── client-simulator/  # Interactive CLI & drill simulator for chaos/load tests
├── packages/
│   ├── policy-engine/      # Pure TypeScript AST engine (zero-allocation evaluator & DLP)
│   └── db/                 # Drizzle ORM schema, migrations, and PostgreSQL client
├── docs/                   # Complete architecture, policy guides, and whitepapers
│   ├── HOW_IT_WORKS.md     # Architecture and data flow for non-engineers
│   ├── POLICY_GUIDE.md     # Real-world safety rules guide (refunds, SQL, DLP)
│   └── CONNECTING_YOUR_TOOLS.md # Setup guide for Cursor, VS Code, Ollama, & LLMs
├── docker/                 # Production Dockerfiles, Grafana dashboards, & init scripts
└── k8s/                    # Enterprise Kubernetes deployment manifests & Helm charts
```

---

## 📦 Core Capabilities

- 🛡️ **Sub-Millisecond Policy Engine**: Pure in-memory AST evaluator completes checks in **<200µs** ($0.2\,\text{ms}$) per tool call.
- 🔑 **Zero-Trust LLM Key Injection**: Developers configure local dummy keys or X4G4T proxy tokens. The gateway injects vaulted `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` at the edge before traffic egresses.
- 🔍 **Enterprise Data Leakage Prevention (DLP)**: In-flight detection and scrubbing of Credit Cards (with Luhn validation), US SSNs, Indian Aadhaar numbers, AWS Secret Keys, GitHub tokens, and private RSA keys.
- 🌐 **SSRF & Cloud Metadata Shield**: Rejects loopback (`127.0.0.1`), private RFC1918 subnets, and cloud instance metadata services (`169.254.169.254`).
- 🚨 **Emergency Global AI Lockdown Kill-Switch**: 1-click administrative kill-switch immediately halts all autonomous agent actions enterprise-wide with `HTTP 503`.
- 🔌 **Model Context Protocol (MCP) Native**: Intercepts and parses JSON-RPC 2.0 `tools/call` frames from Cursor, Claude Desktop, and standalone MCP servers.
- ⏱️ **Sliding-Window Rate Limiting**: Distributed rate-limiting via atomic Redis Lua scripts per user, per IP, or per organization.
- 👥 **Enterprise IAM & RBAC**: Ingests identity tokens from Clerk, WorkOS, Okta, AWS Cognito, and Azure AD to enforce user/group/role restrictions.
- 🚨 **Multi-Channel Human-in-the-Loop (HITL)**: Suspends risky actions with `HTTP 202 HELD`, alerting reviewers via Slack Block Kit and SMTP email with 1-click approvals.
- 📊 **Turn-Key Observability**: Pre-provisioned Prometheus scrapers and Grafana dashboards with 17 real-time telemetry panels.

---

## 📊 Open-Core Feature Matrix

| Feature | Open-Source Community Core (Apache 2.0) | Enterprise Commercial Edition |
| :--- | :---: | :---: |
| **Fastify Proxy AI Firewall** | ✅ Included | ✅ Included |
| **Pure TypeScript AST Evaluator** | ✅ Included | ✅ Included |
| **Zero-Trust LLM Key Injection** | ✅ Included | ✅ Included |
| **DLP Sanitization & SSRF Guard** | ✅ Included | ✅ Included |
| **MCP JSON-RPC 2.0 Interception** | ✅ Included | ✅ Included |
| **Sliding-Window Rate Limiting** | ✅ Included | ✅ Included |
| **Emergency Global AI Kill-Switch** | ✅ Included | ✅ Included |
| **Turn-Key Docker Compose Stack** | ✅ Included | ✅ Included |
| **Kubernetes Helm / Manifests** | ✅ Included | ✅ Included |
| **Prometheus Metrics & Grafana Dashboards** | ✅ Included | ✅ Included |
| **Daily-Rotated Elasticsearch Logs** | ✅ Included | ✅ Included |
| **SAML / SCIM Enterprise SSO** | Community (Clerk/OIDC) | Enterprise (Okta, Entra ID, Ping) |
| **Multi-Cluster Distributed Sync** | Single Cluster | Multi-Region Anycast Control Plane |
| **WORM Compliance Cold Storage** | Daily Indices | AWS S3 Object Lock / 7-Year Retention |
| **24/7 Production SLA & Support** | Community GitHub Issues | Enterprise SLA & Dedicated Support |

---

## 🛠️ Common Troubleshooting Recipes & Technical Query Index

Engineers and SecOps teams deploy X4G4T to resolve specific production agent risks. Below are direct solutions to the most common queries:

### 1. `mcp-proxy` • Securing Cursor & Claude Desktop Model Context Protocol Servers
* **Problem**: Cursor or Claude Desktop agents executing tool calls directly against local or remote MCP servers without policy inspection or parameter validation.
* **Solution**: Point your MCP client to the X4G4T headless JSON-RPC 2.0 interception endpoint (`POST /v1/mcp`):
```json
// .cursor/mcp.json or Claude Desktop configuration
{
  "mcpServers": {
    "secure-tools": {
      "url": "http://localhost:4000/v1/mcp",
      "headers": {
        "x-x4g4t-developer-token": "dev_session_token"
      }
    }
  }
}
```
* **Verdict**: X4G4T inspects `tools/call`, checks arguments against active AST policies, and returns JSON-RPC error `-32001 (Policy Violation)` or `[X4G4T HELD]` if approval is required.

---

### 2. `agent-guardrails` • Blocking Destructive SQL Queries & Cloud Mutation
* **Problem**: Autonomous coding agents generating and executing `DROP TABLE`, `TRUNCATE`, or `DELETE FROM users` without human oversight.
* **Solution**: X4G4T evaluates pure in-memory AST rules in **<200µs** ($0.2\,\text{ms}$) with zero database latency on the ingress path:
```bash
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "x-x4g4t-developer-token: dev_admin" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-sql-worker",
    "tool_name": "run_sql_query",
    "arguments": { "query": "DROP TABLE users;" },
    "downstream_url": "https://api.internal/sql"
  }'
```
* **Response**: Immediately rejected with `HTTP 422 Unprocessable Entity`:
```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Triggered policy 'Catch Table Drops' for tool 'run_sql_query'"
  }
}
```

---

### 3. `dlp-proxy` • In-Flight PII Redaction & Secret Leak Prevention
* **Problem**: Autonomous agents passing customer credit card numbers, US SSNs, AWS Access Keys, or RSA private keys into third-party cloud LLM APIs.
* **Solution**: In-flight Data Leakage Prevention (DLP) scans payloads with **Luhn Mod-10 checksum validation** and regex pattern engines, redacting secrets prior to upstream egress:
```text
Original:  "User CC: 4532-0150-1234-5678, AWS Key: AKIAIOSFODNN7EXAMPLE"
Redacted:  "User CC: [REDACTED_CC], AWS Key: [REDACTED_AWS_KEY]"
```

---

### 4. `rate-limiting` • Distributed Sliding-Window Throttling for AI Agents
* **Problem**: Runaway agent recursive loops consuming high LLM token quotas or DoS-ing downstream microservices.
* **Solution**: Distributed sliding-window rate limiting backed by atomic Redis Lua scripts (`SLIDING_WINDOW_LUA_SCRIPT`) per IP, per user identity, or per organization:
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 3410
Retry-After: 3410
```

---

### 5. `ai-agent-security` • SSRF & Cloud Metadata Protection
* **Problem**: Agents instructed via indirect prompt injection to fetch internal VPC resources (`10.0.0.0/8`, `192.168.0.0/16`) or AWS/GCP instance metadata (`http://169.254.169.254/latest/meta-data/`).
* **Solution**: Outbound HTTP requests to private RFC1918 subnets, loopbacks (`127.0.0.1`), and link-local cloud metadata IPs are rejected with `HTTP 403 SSRF_BLOCKED`.

---

## ☸️ Kubernetes Deployment

Deploy X4G4T into your Kubernetes cluster (EKS, GKE, AKS, or local Kind) with a single idempotent script:

```bash
# Deploys ConfigMaps, Secrets, Storage, Postgres, Redis, Elasticsearch, 
# Prometheus, Grafana, Proxy, Web, and CoreDNS loopback patches
./scripts/deploy-k8s.sh
```

To dry-run or target a specific namespace:
```bash
./scripts/deploy-k8s.sh --dry-run
./scripts/deploy-k8s.sh --namespace prod-x4g4t
```

For complete architecture details, read [docs/DOCKER_COMPOSE_STACK.md](docs/DOCKER_COMPOSE_STACK.md).

---

## 📈 Observability & Telemetry

X4G4T exposes real-time operational telemetry at `GET /metrics`:
- **P50 / P90 / P99 Latency Histograms**: End-to-end gateway and AST evaluation timings.
- **Threat Mitigation Counters**: SSRF blocks, DLP redactions, rate limit hits, and token injections.
- **Infrastructure Health Gauges**: Live PostgreSQL and Redis connection statuses.

Read [docs/OBSERVABILITY_GRAFANA_PROVISIONING.md](docs/OBSERVABILITY_GRAFANA_PROVISIONING.md) for Prometheus scraping configs, Elasticsearch schemas, and PromQL alerting recipes.

---

## 🏎️ Performance Benchmarks

Empirical Vitest benchmark results on standard developer hardware (Apple Silicon M-series):
```
======================================================
[AST In-Memory Evaluator]: 100,000 iterations
Mean Eval Latency:  0.00018ms (0.18 microseconds)
Throughput:         5,550,000 evaluations / second

[Fastify Gateway Ingestion Hot Path]: 1,000 requests
P50 Latency:        0.081ms
P90 Latency:        0.308ms
P99 Latency:        1.399ms
======================================================
```
Full methodology and stress tests: [docs/PERFORMANCE_BENCHMARKS.md](docs/PERFORMANCE_BENCHMARKS.md).

---

## 📚 Plain-English Documentation Guides

- 📘 [**How It Works (Architecture for Non-Engineers)**](docs/HOW_IT_WORKS.md) — Simple, step-by-step walkthrough of request lifecycles, service roles, and fail-closed defenses.
- 📙 [**Policy Setup Guide**](docs/POLICY_GUIDE.md) — How to configure rules, thresholds, and Slack approvals with real-world examples.
- 📗 [**Connecting Your Tools & IDEs**](docs/CONNECTING_YOUR_TOOLS.md) — 5-minute setup instructions for Cursor, Windsurf, VS Code, Ollama, and OpenAI/Anthropic.
- 📕 [**System Architecture & Deep Dive**](docs/ARCHITECTURE.md) — Technical breakdown of AST compilation, ring buffers, and distributed caching.

---

## 🤝 Contributing

We welcome contributions from the open-source community! Check out [CONTRIBUTING.md](CONTRIBUTING.md) to get your local environment set up.

```bash
# Clone & install
git clone https://github.com/aryix-hq/X4G4T.git
cd X4G4T
pnpm install

# Run test suite
pnpm test
```

---

## 📄 License

X4G4T is open-source software licensed under the **[Apache License, Version 2.0](LICENSE)**.
