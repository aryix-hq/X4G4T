# X4G4T: Complete Product & Feature Specification
### Zero-Latency Headless Policy Firewall & Data Leakage Prevention (DLP) Proxy for Autonomous AI Agents

> **Brand:** X4G4T (pronounced *X-Four-Gate*)  
> **Author:** ARYIX (OPC) Private Limited  
> **Website:** [https://www.aryix.co.in/](https://www.aryix.co.in/)  
> **Core Purpose:** When AI software transitions from generating tokens to taking actions (invoking tools, modifying databases, executing shell commands, making wire transfers), it stops being a text generator and becomes an autonomous actor on your network. Traditional firewalls inspect IP addresses and HTTP verbs; X4G4T inspects **agent intent, tool parameters, sensitive credentials, and blast radius** in $<1\text{ms}$ before packets leave the host.

---

## Table of Contents

1. [Architectural Highlights & Latency Invariants](#1-architectural-highlights--latency-invariants)
2. [Feature 1: Zero-Latency AST Policy Firewall](#feature-1-zero-latency-ast-policy-firewall)
3. [Feature 2: In-Flight Sensitive Data Leakage Prevention (DLP)](#feature-2-in-flight-sensitive-data-leakage-prevention-dlp)
4. [Feature 3: Bilateral Emergency Air-Gap Kill Switch with 2FA](#feature-3-bilateral-emergency-air-gap-kill-switch-with-2fa)
5. [Feature 4: Policy "Shadow/Learning Mode" & Counterfactual Drift Testing](#feature-4-policy-shadowlearning-mode--counterfactual-drift-testing)
6. [Feature 5: Log-Mining ML Policy Recommendation Engine](#feature-5-log-mining-ml-policy-recommendation-engine)
7. [Feature 6: High-Stakes Human-in-the-Loop (HITL) Governance](#feature-6-high-stakes-human-in-the-loop-hitl-governance)
8. [Feature 7: Sovereign & Local LLM Provider Governance (Ollama, vLLM, TGI)](#feature-7-sovereign--local-llm-provider-governance-ollama-vllm-tgi)
9. [Feature 8: Model Context Protocol (MCP) JSON-RPC 2.0 Router](#feature-8-model-context-protocol-mcp-json-rpc-20-router)
10. [Feature 9: Cryptographic ISO/IEC 27001 Tamper-Evident Hash Chaining](#feature-9-cryptographic-isoiec-27001-tamper-evident-hash-chaining)
11. [Feature 10: GDPR Art. 17 / India DPDP Sec. 12 Crypto-Shredding Registry](#feature-10-gdpr-art-17--india-dpdp-sec-12-crypto-shredding-registry)
12. [Feature 11: Real-Time Multi-Service Health & Status Monitoring Console](#feature-11-real-time-multi-service-health--status-monitoring-console)
13. [Feature 12: Role-Based Access Control (RBAC) & Separation of Duties (SoD)](#feature-12-role-based-access-control-rbac--separation-of-duties-sod)

---

## 1. Architectural Highlights & Latency Invariants

X4G4T operates as a **headless security gateway** positioned inline between AI agents/IDEs and downstream execution targets (APIs, databases, MCP servers, and LLMs).

```
   [ AI Agents / LangChain / CrewAI / IDE Workstations ]
                            │
                            ▼
              ┌───────────────────────────┐
              │   X4G4T FASTIFY PROXY     │  <-- Port 4000 (Data Plane)
              │  • Zero-Latency AST Guard │      Hot-Path SLA: <1ms evaluation
              │  • In-Flight DLP Scanner  │
              │  • In-Memory Kill Switch  │
              └─────────────┬─────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
[ Upstream LLMs ]   [ Internal APIs ]   [ MCP Tool Servers ]
(OpenAI, Claude,    (Stripe, Postgres,  (Filesystem, GitHub,
 vLLM, Ollama)       Kubernetes, CRM)    PostgreSQL MCP)
```

- **Data Plane (Port 4000):** Written in Fastify with pure in-memory Abstract Syntax Tree (AST) matching. Zero synchronous database queries on the hot path.
- **Intelligence Plane (Port 5001):** Decoupled background ML daemon for unsupervised log-mining, anomaly discovery, and rule synthesis.
- **Control Plane (Port 3000):** Next.js 15 SecOps dashboard for policy management, live audit inspection, and system health status.

---

## Feature 1: Zero-Latency AST Policy Firewall

### The Problem
Large Language Models are non-deterministic. An agent instructed to "clean up inactive users" can hallucinate SQL arguments (`DELETE FROM users WHERE 1=1`) or misunderstand currency conversions. Conventional network firewalls cannot inspect nested JSON payloads or enforce business logic limits.

### How X4G4T Solves It
X4G4T evaluates incoming tool arguments against compiled JSON AST guardrails in memory in $<1\text{ms}$.
- **Field-Path Resolution:** Supports deeply nested dot-notation paths (`transaction.line_items.0.amount`, `user.profile.tier`).
- **Operators:** Supports 9 deterministic operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`, `CONTAINS`, `REGEX`, and `IN`.
- **Verdict Precedence:** Strict priority order: `BLOCK` $\rightarrow$ `REQUIRE_APPROVAL` $\rightarrow$ `ALLOW`.
- **Fail-Closed Default:** If a payload cannot be evaluated or parsed, it is rejected immediately with HTTP 422 `POLICY_VIOLATION`.

---

## Feature 2: In-Flight Sensitive Data Leakage Prevention (DLP)

### The Problem
When developers or autonomous agents generate prompts, read internal documentation, or fetch support tickets, raw text often contains proprietary secrets, customer PII, AWS access keys, or internal API tokens. Sending these payloads to third-party commercial LLMs constitutes an irreversible data breach.

### How X4G4T Solves It
X4G4T intercepts all ingress and egress payloads with a streaming, in-flight DLP pipeline:
- **High-Entropy Secret Detection:** Detects and redacts AWS Keys (`AKIA...`), GitHub Tokens (`ghp_...`), JWTs (`eyJ...`), and private SSH keys (`-----BEGIN PRIVATE KEY-----`).
- **PII Pattern Masking:** Inspects credit cards (with Luhn algorithmic checksum validation), Social Security Numbers (SSN), Indian Aadhaar cards (with Verhoeff checksum algorithm), email addresses, and phone numbers.
- **Custom Keyword Blacklisting:** Supports tenant-configurable exact-match keywords and proprietary regex patterns.
- **Action Modes:**
  - `REDACT`: Transparently sanitizes matching tokens in-flight (e.g., replaces with `[REDACTED_AWS_KEY]`) before forwarding downstream.
  - `BLOCK`: Rejects the tool call with HTTP 422 and alerts SecOps.
  - `ALERT_ONLY`: Permits the request while generating high-priority telemetry.

---

## Feature 3: Bilateral Emergency Air-Gap Kill Switch with 2FA

### The Problem
When an enterprise discovers an active rogue agent loop, multi-agent cascading hallucination, or active prompt injection exfiltration, SecOps needs to sever all autonomous agent operations instantly without restarting infrastructure or modifying application code.

### How X4G4T Solves It
X4G4T provides an emergency circuit breaker that completely isolates the network:
- **Bilateral Air-Gap:**
  - **Inbound Severance:** All incoming tool calls, prompt traffic, and MCP frames from client IDEs and external agents are dropped immediately with HTTP 503 `EMERGENCY_KILL_SWITCH_ACTIVE`.
  - **Outbound Severance:** All pending or streaming egress requests to external APIs (OpenAI, Anthropic, Gemini) and internal inference nodes (Ollama, vLLM) are terminated in $<1\text{ms}$.
- **Mandatory 2FA (RFC 6238 TOTP):** Toggling the emergency kill switch (activation and deactivation) strictly requires a valid 6-digit Time-Based One-Time Password. Static credentials cannot trip or reset the circuit breaker.
- **Sub-Microsecond Resolution:** The proxy checks an in-memory atomic boolean synced via Redis Pub/Sub (`killswitch:invalidation`), resolving kill-switch checks in $<1\mu\text{s}$ without database or network round-trips.

---

## Feature 4: Policy "Shadow/Learning Mode" & Counterfactual Drift Testing

### The Problem
Security teams frequently hesitate to deploy strict guardrails because of the fear of "breaking production" or introducing false-positive blocks that disrupt critical business automation.

### How X4G4T Solves It
X4G4T introduces three operational deployment modes for policies: `ACTIVE`, `SHADOW_LEARN`, and `DISABLED`.
- **Counterfactual Evaluation:** When a policy is deployed in `SHADOW_LEARN`, incoming requests are evaluated synchronously against the candidate rules.
- **Zero-Disruption Invariant:** If a violation occurs, the request is **NOT** blocked. Traffic passes downstream unimpeded.
- **Telemetry Tagging:** The verdict is recorded as `SHADOW_BLOCKED` or `SHADOW_PASSED` in telemetry streams and aggregated into hourly `shadow_metrics` rollups.
- **Blast-Radius & Drift Quantification:** The SecOps dashboard displays the exact counterfactual blast radius ($\frac{\text{would\_have\_blocked}}{\text{total\_evaluated}} \times 100\%$) and drift curves *before* an operator toggles the policy to `ACTIVE`.

---

## Feature 5: Log-Mining ML Policy Recommendation Engine

### The Problem
Security engineers cannot manually write hundreds of parameter boundaries for every newly created internal tool or agent action. Manual rule authoring leads to either porous security or overly restrictive policies.

### How X4G4T Solves It
X4G4T includes a decoupled Intelligence Plane (`x4g4t-ml-service` on port 5001):
- **Decoupled Architecture:** Runs as an isolated microservice daemon, completely eliminating analytical CPU/memory load from the proxy data plane.
- **Rolling Statistical Outlier Baselines:** Aggregates historical parameter distributions across execution logs.
- **Numeric Safety Ceilings:** Calculates the 99th percentile ($P_{99}$) of past legitimate executions and synthesizes automated guardrails with a 15% safety buffer:
  $$\text{Recommended Ceiling} = \lceil P_{99} \times 1.15 \rceil$$
- **Categorical Whitelisting:** Identifies discrete string domains (environments, currencies, action types) with $>99.5\%$ frequency and suggests `IN` enum whitelists.
- **Approval Queue:** Recommendations are staged in `policy_recommendations` with status `PENDING` and require one-click SecOps review and activation.

---

## Feature 6: High-Stakes Human-in-the-Loop (HITL) Governance

### The Problem
Some agent actions are too sensitive for full autonomy (e.g. database schema migrations, payments over $10,000, modifying cloud IAM roles). However, requiring humans to manually run the task defeats the value of automation.

### How X4G4T Solves It
X4G4T provides conditional Human-in-the-Loop gating:
- **Selective Hold:** Routine actions pass through with $<1\text{ms}$ latency. Sensitive actions matching `action_on_match = "REQUIRE_APPROVAL"` enter a stateful `HELD` condition.
- **Client Suspension:** The gateway responds with HTTP 202 `Accepted` containing a `hold_id` and retry poll intervals.
- **Interactive Review:** The platform dispatches an interactive card to Slack or the Next.js SecOps dashboard.
- **Audit & Expiration:** Reviewers click "Approve" or "Reject". Holds expire automatically after 15 minutes to prevent stale execution.

---

## Feature 7: Sovereign & Local LLM Provider Governance (Ollama, vLLM, TGI)

### The Problem
Enterprises deploying open-weight models (Llama 3, Mistral, DeepSeek) on internal GPU clusters (via Ollama, vLLM, Text Generation Inference, or LocalAI) often assume local models are inherently safe. In reality, local models remain vulnerable to prompt injection, unauthorized tool execution, and exfiltration.

### How X4G4T Solves It
X4G4T natively intercepts upstream inference calls to local endpoints:
- Supports native Ollama endpoints (`/api/generate`, `/api/chat`) and OpenAI-compatible runtimes (`vLLM`, `LocalAI`, `TGI`).
- Enforces the identical DLP scrubbing, AST parameter bounds checking, token rate limits, and audit hash chaining on local models as commercial cloud APIs.
- Integrates transparently via CoreDNS proxy rewrites without requiring SDK modifications in agent code.

---

## Feature 8: Model Context Protocol (MCP) JSON-RPC 2.0 Router

### The Problem
Anthropic's Model Context Protocol (MCP) is rapidly becoming the industry standard for connecting AI agents to tools, databases, and local filesystems. Unrestricted MCP access allows agents to run arbitrary shell commands, read host files, or exfiltrate private codebases.

### How X4G4T Solves It
X4G4T provides a dedicated MCP JSON-RPC 2.0 proxy router (`POST /v1/gateway/mcp`):
- **Lifecycle Frame Pass-Through:** Forwards discovery frames (`tools/list`, `initialize`) transparently to the upstream MCP target.
- **Execution Inspection:** Intercepts `tools/call` requests, extracting `params.name` and `params.arguments`.
- **Policy Enforcement:** Evaluates tool arguments against guardrails in $<1\text{ms}$.
- **Standardized Error Reporting:** Returns JSON-RPC error code `-32001` (`Policy Violation`) upon blocked executions and `isError: true` for suspended HITL requests.

---

## Feature 9: Cryptographic ISO/IEC 27001 Tamper-Evident Hash Chaining

### The Problem
Autonomous agents operate in high-liability environments. If an audit log can be altered, truncated, or modified by a rogue database administrator, forensic non-repudiation is impossible.

### How X4G4T Solves It
In compliance with **ISO/IEC 27001:2022 Control A.8.15**:
- Every record in `execution_logs` is cryptographically chained to its predecessor using SHA-256:
  $$\text{record\_hash}_i = \text{SHA-256}\left( \text{id}_i \parallel \text{prev\_hash}_i \parallel \text{tool}_i \parallel \text{verdict}_i \parallel \text{created\_at}_i \right)$$
- The ledger forms an immutable, blockchain-like audit trail.
- Any manual SQL mutation to `arguments`, `verdict`, or timestamps immediately breaks the hash chain verification.

---

## Feature 10: GDPR Art. 17 / India DPDP Sec. 12 Crypto-Shredding Registry

### The Problem
There is a fundamental legal tension between **audit immutability** (ISO 27001, SOC 2) and the **Right to Erasure / Right to be Forgotten** (GDPR Art. 17, India DPDP Act Sec. 12). If personal data is deleted from an append-only hash chain, the entire cryptographic ledger breaks.

### How X4G4T Solves It
X4G4T implements mathematical **Crypto-Shredding**:
- Personal data in `execution_logs` is encrypted with an individual data principal key ($\text{SEK}_{\text{subject\_id}}$) stored in `subject_encryption_keys`.
- When an erasure request is executed, the platform cryptographically destroys the symmetric key by overwriting it with random noise and deleting the row.
- Without the key, the ciphertext is permanently mathematically unrecoverable, satisfying EU EDPB erasure standards while keeping the SHA-256 hash chain intact.

---

## Feature 11: Real-Time Multi-Service Health & Status Monitoring Console

### The Problem
Enterprise SecOps and Platform Engineering teams require continuous, live visibility into every component of their AI guardrail infrastructure (Postgres, Redis, Elasticsearch, Proxy, ML Service).

### How X4G4T Solves It
- **Web Status Console (`/dashboard/status`):** Real-time health dashboard polling all 5 core services in parallel, displaying round-trip latencies, operational posture badges, and structured incident logs.
- **Turn-Key Grafana Provisioning (`x4g4t-system-status.json`):** Dedicated Grafana dashboard pre-configured with multi-service availability gauges, P50/P90/P99 latency curves, and request volume breakdowns.
- **Prometheus Telemetry (`/metrics`):** Exports standardized OpenMetrics counters and histograms.

---

## Feature 12: Role-Based Access Control (RBAC) & Separation of Duties (SoD)

### The Problem
Developers building AI agents should not have the authority to alter or disable the policy guardrails governing those same agents. Such access violates Separation of Duties (SOC 2 CC6.1).

### How X4G4T Solves It
- **SecOps Administrators (`role: "admin"`):** Full access to create, update, toggle, delete policies, approve HITL requests, view unredacted audit trails, and trigger the emergency kill switch.
- **Developers (`role: "developer"`):** Restricted from viewing, creating, or modifying security guardrails. Retain authorization to manage developer API keys, configure personal sandbox endpoints, and inspect logs for their own agents.
- **Deterministic 403 Enforcement:** All policy mutation Server Actions invoke `assertAdminRole()` and reject unauthorized modifications at the API layer.

---

## Feature 13: Network Source & Destination Policy Engine & Bitwise CIDR Matching

### The Problem
AI agents run in varied environments—workstations, edge devices, cloud pods, or CI/CD pipelines. Security teams must ensure that agents can only execute tools from authorized IP ranges and cannot exfiltrate data to unapproved downstream hosts or private cloud metadata services (e.g. AWS `169.254.169.254`).

### How X4G4T Solves It
- **Network Ingress Field Paths:** Policies can evaluate `network.source_ip` and `network.source_hostname`, automatically extracted from HTTP reverse-proxy headers (`X-Forwarded-For`, `X-Real-IP`, `remoteAddress`, `X-Client-Hostname`).
- **Bitwise `CIDR_MATCH` Operator:** First-class support for IPv4 CIDR subnet bitmasks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `198.51.100.0/24`). Pure bitwise bitmask evaluation executes in $<5\mu\text{s}$.
- **Network Egress Boundaries:** Policies evaluate `network.destination_host`, `network.destination_port`, and `network.protocol` against allowed host whitelists.
- **Perimeter SSRF Guard:** `validateDownstreamUrl` stops requests directed at link-local addresses (`169.254.169.254`), loopbacks (`127.0.0.1`), and RFC 1918 private subnets unless local development mode is explicitly enabled.

---

## Feature 14: Aux-Ops Autonomous System Telemetry & Multi-Sink Audit Sinks (Kafka, Graylog, ES)

### The Problem
Enterprise deployments operating at high concurrency need autonomous, low-overhead platform telemetries that don't burden the data plane proxy with polling tasks or remote heartbeat checks.

### How X4G4T Solves It
- **Autonomous Aux-Ops Daemon (Port 5050):** An independent background daemon that continuously reads Linux cgroups v2 (`cpu.stat`, `memory.current`, `memory.max`), calculates Node.js event loop latency percentiles ($P_{50}, P_{90}, P_{99}$), and conducts active TCP probes against Postgres, Redis, Elasticsearch, Proxy, ML Service, and Prometheus.
- **Graylog Telemetry Sink:** Ingests structured JSON audit logs via GELF HTTP input (`/gelf`) or Syslog UDP (Port 12201/514), supporting full Lucene search, stream alerts, and compliance archiving.
- **Kafka Distributed Streaming Sink:** Asynchronous, non-blocking producer pipeline publishing every policy decision to `x4g4t.audit.stream` for real-time SIEM ingestion (Splunk, Datadog, Snowflake).
- **Elasticsearch Rotation:** Time-rotated indices (`x4g4t-logs-YYYY.MM.DD`) with automated lifecycle management and daily indices.

---

## Feature 15: Graylog Forwarder Sidecar & Deep Trail Query Navigation

### The Problem
When monitoring distributed microservices, application standard output logs and container diagnostic streams frequently become fragmented across different pod nodes. Furthermore, when investigating a policy block or anomaly in a security dashboard, engineers often must manually copy and paste IDs into an external SIEM console.

### How X4G4T Solves It
- **Dedicated Log Forwarder Sidecar (`x4g4t-graylog-forwarder`, Port 5150):** Tunnels into `/var/run/docker.sock` and multiplexes stdout/stderr streams from all 15 cluster containers in real time, packing them into standardized GELF 1.1 UDP messages with rich metadata (`_container_name`, `_container_id`, `_verdict`, `_triggered_policy_id`, `_client_ip`, `_user_email`).
- **1-Click Graylog Deep Search Links:** The Policy Studio, Learning Mode Analytics, and Advanced Policy Creator include direct, context-aware links (`http://localhost:9000/search?q=triggered_policy_id:...`). Clicking "Graylog Trail" immediately opens the pre-filtered event stream in a new tab without manual query construction.
- **Universal Graylog Query Guide:** Comprehensive Lucene query reference and debugging instructions are available in [docs/GRAYLOG_QUERY_GUIDE.md](file:///Users/adithya/Code/AegisOps/aegis-ops/docs/GRAYLOG_QUERY_GUIDE.md).

---

## Feature 16: Autonomous Client Simulator Pod for Live Agent Emulation

### The Problem
Validating security guardrails, rate-limit boundaries, and air-gap kill switches in staging or CI environments typically requires manual curl commands or mock bash scripts that do not reflect persistent streaming, real SSE chunk transfer, or autonomous multi-agent behavior.

### How X4G4T Solves It
- **Autonomous User Agent Container (`x4g4t-client-simulator`, Port 4500):** Emulates continuous live agent traffic against the proxy gateway with scheduled heartbeats (12s intervals) covering benign chat completions, Server-Sent Events (SSE) token streaming, parameter-bound tool calls, and shadow learning evaluations.
- **On-Demand Attack & Mock Battery (`POST /simulate`):** Executes a standardized battery of adversarial tests (PII/AWS key leaks, SQL injection `DROP TABLE` attacks, and $5,000 threshold breaches), providing instant verification with $<10\text{ms}$ per-scenario latency tracking.

---

## Feature 17: Sub-5-Second Global AI Lockdown & Policy Freeze Synchronization

### The Problem
During an active security breach, a lag between toggling an emergency kill switch in the management UI and updating operational status in Prometheus/Grafana leads to operator confusion and false alerts.

### How X4G4T Solves It
- **Instant Gateway Lockdown (`/v1/system/sync-lockdown`):** SecOps toggles update Redis atomic locks and inform Fastify proxy instances simultaneously in $<1\text{ms}$, immediately terminating incoming traffic with HTTP 503 `KILL_SWITCH_ACTIVE`.
- **Under 5-Second Prometheus & Grafana SLA:** Prometheus scrapes `proxy:4000`, `web:3000`, and `aux-ops:5050` every 5 seconds. The Grafana overview dashboard auto-refreshes every 5 seconds (`refresh: "5s"`), guaranteeing that emergency state transitions reflect accurately on executive screens within $<5$ seconds.


