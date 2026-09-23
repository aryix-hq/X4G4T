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

[Quickstart](#-30-second-turn-key-quickstart) • [Architecture](#-architecture) • [Features](#-core-capabilities) • [Troubleshooting Recipes](#-common-troubleshooting-recipes--technical-query-index) • [Kubernetes](#-kubernetes-deployment) • [Observability](#-observability--telemetry) • [Docs](docs/) • [Contributing](CONTRIBUTING.md)

</div>

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

## 🏛️ Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │          X4G4T CENTRALIZED GATEWAY (:4000)          │
    Polyglot AI Agents         │                                                        │       Downstream Targets
  ┌─────────────────────────┐  │  ┌──────────────────────────────────────────────────┐  │     ┌───────────────────┐
  │ Claude Code / Cursor    │  │  │ 1. Upstream LLM Key Vault & Egress Injection     │  │ ──► │ OpenAI / Anthropic│
  └────────────┬────────────┘  │  │    (Agents use local keys; gateway injects real) │  │     │ Google Gemini     │
               │               │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
  ┌────────────┴────────────┐  │  │ 2. Sub-Millisecond AST Evaluator (<0.2ms)        │  │
  │ LangChain / AutoGen     │ ─┼─►│    - Numerical bounds, regex, enum operators     │  │     ┌───────────────────┐
  └────────────┬────────────┘  │  │    - IAM role/group permissions enforcement      │  │ ──► │ Stripe / Payments │
               │               │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
  ┌────────────┴────────────┐  │  │ 3. Enterprise DLP & SSRF Guards                  │  │
  │ MCP Clients             │  │  │    - Luhn CC, SSN, Aadhaar, AWS key scrub        │  │     ┌───────────────────┐
  │ (JSON-RPC tools/call)   │  │  │    - Cloud metadata (169.254.169.254) blocked    │  │ ──► │ PostgreSQL / SQL  │
  └─────────────────────────┘  │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
                               │  │ 4. Tamper-Evident Daily Audit Logging            │  │
                               │  │    - Fire-and-forget Elasticsearch indexing      │  │     ┌───────────────────┐
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

## 🚀 30-Second Turn-Key Quickstart

X4G4T ships with a complete, production-grade **Turn-Key Docker Compose Stack** including PostgreSQL, Redis, Elasticsearch, Prometheus, Grafana, Fastify Gateway, and Next.js Web UI.

```bash
# 1. Clone repository
git clone https://github.com/aryix-hq/X4G4T.git
cd X4G4T

# 2. Start all 7 services in detached mode
docker compose up -d

# 3. Verify health
docker compose ps
```

### Access Endpoints
| Component | Local URL | Default Credentials |
| :--- | :--- | :--- |
| **X4G4T Web Control Plane** | [http://localhost:3000](http://localhost:3000) | Instant Sandbox Mode (or Clerk SSO) |
| **Fastify Proxy Gateway** | [http://localhost:4000](http://localhost:4000) | Header: `Authorization: Bearer sec_live_x4g4t_demo` |
| **Grafana Observability** | [http://localhost:3001](http://localhost:3001) | Pre-authenticated Admin (`admin` / `admin`) |
| **Prometheus Raw Metrics** | [http://localhost:9090](http://localhost:9090) | Scrapes `/metrics` every 5 seconds |
| **Elasticsearch Cluster** | [http://localhost:9200](http://localhost:9200) | Daily index: `x4g4t-logs-YYYY.MM.DD` |

### 📦 Pre-Built GitHub Container Registry (GHCR) Images
Pre-built multi-architecture (`linux/amd64`, `linux/arm64`) images are published to GitHub Container Registry:
```bash
# Pull pre-built images directly (no local compilation needed)
docker pull ghcr.io/aryix-hq/x4g4t-proxy:latest
docker pull ghcr.io/aryix-hq/x4g4t-web:latest
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
