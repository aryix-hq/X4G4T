# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-09-26

### 🚀 Enterprise Governance, Resilience & Intelligence Release

Version 0.2.0 transforms X4G4T from a core proxy firewall into a defense-grade enterprise AI governance platform. This release introduces zero-overhead Shadow/Learning Mode, automated ML policy recommendations, distributed Graylog/Kafka streaming with ISO 27001 tamper-evident hash chaining, asynchronous governance reporting via Aux-Ops, and hard fail-closed resilience under chaos conditions.

### Added
- **Shadow / Learning Mode (Counterfactual AST Projection)**:
  - Added non-interfering `SHADOW_LEARN` policy evaluation mode.
  - Candidate policies evaluate against live agent traffic, recording counterfactual verdicts (`SHADOW_BLOCKED`, `SHADOW_ALLOWED`) to telemetry without impeding live execution.
  - Asynchronous, lock-free hourly metric rollups in Redis (`shadow:metric:<orgId>:<policyId>:<bucketHour>`) and in-memory stores.
- **Machine Learning Policy Mining Engine (`apps/proxy/src/workers/ml-miner.ts`)**:
  - Implemented frequent-itemset pattern mining on historical agent telemetry.
  - Automatically calculates z-score distributions and normal behavior baselines across tool calls and argument bounds.
  - HTTP recommendation endpoint (`POST /v1/ml/mine`) returning high-confidence candidate policies for SecOps teams.
- **Auxiliary Operations Service (`apps/aux-ops`)**:
  - Dedicated background microservice for heavy compliance and governance calculations.
  - Generates downloadable PDF and CSV policy effectiveness reports for 1-month, 1-quarter, and 1-year windows.
  - Scheduled background execution offloading compute load from the proxy hot path.
- **Graylog GELF & Kafka Log Forwarding (`apps/graylog-forwarder`)**:
  - High-throughput streaming forwarder dispatching GELF UDP/TCP log frames to Graylog clusters.
  - ISO/IEC 27001 A.8.15 tamper-evident SHA-256 audit chaining: every execution record cryptographically binds to the previous log record's hash (`computeLogRecordHash`).
  - Native Graylog query explorer and pre-configured Graylog dashboards.
- **Multi-Window Rate Limiting Engine**:
  - Distributed sliding-window and token bucket rate limits powered by atomic Redis Lua scripts.
  - Configurable rate windows (1-Hour, 5-Hour, 1-Week, and Custom) supporting burst allowances, tenant-level quotas, and RFC 6585 compliance (`Retry-After`, `X-RateLimit-*`).
- **Multi-Channel Human-in-the-Loop (HITL) Workflow**:
  - Asynchronous tool execution suspension returning HTTP `202 Accepted` with unique `hold_id` and retry intervals.
  - Slack Block Kit interactive message dispatch with 1-click **Approve** and **Reject** webhook callbacks.
  - SMTP email dispatch for out-of-band security approvals.
  - Automatic 15-minute TTL expiration: unreviewed holds automatically transition to `EXPIRED_HALTED`.
- **Enterprise IAM & RBAC Engine**:
  - Full support for identity tokens from Clerk, WorkOS, Okta, AWS Cognito, and Azure AD.
  - Hierarchical role/group evaluation against policy AST conditions (`iam.roles`, `iam.groups`, `iam.userId`).
- **Client Simulator & Chaos Drill Suite (`apps/client-simulator`, `scripts/simulate-mock-drill.sh`)**:
  - Automated drill script simulating concurrent compliant, malicious, and exfiltration tool calls to verify firewall effectiveness.
- **Plain-English Documentation Suite**:
  - Published [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md) (Architecture for Non-Engineers with everyday analogies).
  - Published [`docs/POLICY_GUIDE.md`](docs/POLICY_GUIDE.md) (Step-by-step guide to setting up safety rules).
  - Published [`docs/CONNECTING_YOUR_TOOLS.md`](docs/CONNECTING_YOUR_TOOLS.md) (Setup guides for Cursor, VS Code, Ollama, and Cloud LLMs).

### Changed
- **AST Policy Engine (`packages/policy-engine`)**:
  - Sub-millisecond evaluation latency: benchmarked at **< 0.2ms** ($< 200\,\mu\text{s}$) across 50 active rules.
  - Added support for Compound `OR` matching logic in addition to short-circuit `AND` trees.
  - Extended dot-path extraction with indexed array resolution (`items[0].price`) and wildcard array projections (`items[*].price`).
  - Added operator matrix support for `GTE`, `LTE`, `IN`, and regex boundary checks.
- **Data Loss Prevention (DLP) Engine**:
  - Added Luhn Mod-10 checksum validation for VISA, MasterCard, AMEX, Discover, and Diners Club credit cards.
  - Extended pattern scrubbers for US SSNs, Indian Aadhaar numbers, AWS Secret Access Keys (`AKIA...`), GitHub Personal Access Tokens (`ghp_...`), and RSA/OpenSSH private key headers.
- **Web Control Plane Dashboard (`apps/web`)**:
  - Visual policy editor with drag-and-drop templates (E-commerce, SQL safety, exfiltration protection).
  - Live 1-click Emergency Lockdown Kill-Switch banner with enterprise-wide status broadcasting.
  - Interactive Graylog analytics viewer, policy effectiveness charts, and HITL hold resolution tables.

### Security & Resilience
- **Fail-Closed Architecture Under Partitioning**:
  - Gateway enforces hard `503 Service Unavailable` (`FAIL_CLOSED_MAINTENANCE`) during complete database/Redis network partitions or AST timeouts.
  - Memory-cached policy fallback: retains known good safety rules during brief transient database disconnects.
- **Sub-5ms Mid-Flight SSE Severing**:
  - Real-time token scanner for Server-Sent Events (SSE) streaming responses.
  - Automatically terminates outbound HTTP connections in $\le 5\text{ms}$ upon detecting forbidden tokens or leaked credentials.
- **ReDoS Prevention**:
  - Evaluates regex patterns in bounded Node.js `vm` microtask contexts with strict timeouts (15ms).
  - Automatically rejects catastrophic backtracking constructs (`(x+)+`, `(a|a)+`) and bounds input strings to 10,000 characters.
- **2FA Re-Authentication Gate**:
  - Requires valid TOTP re-authentication token for destructive actions (e.g. API key revocation).
  - Idempotent race-condition resistance: concurrent revocation requests return `409 Conflict` after the initial successful resolution.
- **Payload Bomb Protection**:
  - Enforces hard 10MB payload size limits, rejecting oversized inputs with `413 Payload Too Large`.

---

## [0.1.0] - 2026-09-19

### 🛡️ Initial Public Release: Core Policy Firewall & Proxy Gateway

The foundational open-source release of X4G4T (`@aryix-hq/x4g4t`), introducing zero-latency headless policy enforcement and data leakage prevention for autonomous AI agents and Model Context Protocol (MCP) clients.

### Added
- **Fastify Reverse Proxy Gateway (`apps/proxy`)**:
  - High-performance reverse proxy placed between AI agent runtimes and upstream LLMs or downstream tools.
  - Endpoints: `POST /v1/gateway/execute` (direct tool execution) and `POST /v1/mcp` (JSON-RPC 2.0 MCP interception).
- **Pure TypeScript AST Policy Engine (`packages/policy-engine`)**:
  - In-memory Abstract Syntax Tree evaluator with zero database overhead on the request hot path.
  - Core operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `CONTAINS`, `REGEX`.
  - Verdict actions: `ALLOW`, `BLOCK`, `REQUIRE_APPROVAL`.
- **Zero-Trust LLM Credential Substitution**:
  - Developers and agents authenticate using local safe dummy tokens (`sec_live_...`).
  - Gateway dynamically injects real encrypted master provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) at the egress boundary.
- **Server-Side Request Forgery (SSRF) Protection**:
  - Blocks requests targeting loopback addresses (`127.0.0.1`, `localhost`), private RFC1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud instance metadata services (`169.254.169.254`).
- **Emergency Global Lockdown Kill-Switch**:
  - Single atomic toggle halting all outbound agent tool executions enterprise-wide.
- **Turn-Key Docker Compose Stack**:
  - Complete multi-container deployment: Fastify Proxy, Next.js Web UI, PostgreSQL, Redis, Elasticsearch, Prometheus, and Grafana.
- **Enterprise Observability**:
  - Prometheus `/metrics` exposition with P50/P90/P99 latency histograms and threat mitigation counters.
  - Pre-provisioned Grafana dashboard (`x4g4t-overview.json`) with 17 real-time telemetry panels.
- **Relational Schema & Migrations (`packages/db`)**:
  - Drizzle ORM schema defining organizations, users, API keys, policies, execution logs, and HITL holds.

