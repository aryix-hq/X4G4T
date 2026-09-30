# X4G4T Master Documentation Index

Welcome to the comprehensive, authoritative technical documentation for **X4G4T** (`@aryix-hq/x4g4t`), the zero-latency, headless policy firewall and Data Leakage Prevention (DLP) proxy for autonomous AI agents and Model Context Protocol (MCP) servers.

All documentation in this repository is strictly organized by functional domain:

```
docs/
├── overview/        # High-level architecture, quickstart, layman guides, features
├── architecture/    # System topology, streaming pipelines, database schemas, network routing
├── governance/      # Policy engine guides, DLP scanners, kill switches, compliance frameworks
├── integrations/    # Local Ollama, Cloud LLMs (Gemini/OpenAI), IDEs (Cursor/VS Code), MCP, API reference
├── ops/             # Docker Compose stacks, Kubernetes hardening, Grafana/Prometheus observability
├── audits/          # Black-box audit reports, latency benchmarks, compliance scorecards, UAT reports
├── planning/        # Historical implementation plans and phased delivery milestone records
├── guides/          # Web dashboard documentation backing (IAM, policies, enterprise RBAC)
├── assets/          # Architecture schematics and visual flow diagrams
└── INDEX.md         # This Master Index
```

---

## 🧭 Navigation & Categorized Document Directory

### 01. Getting Started & Overview
Foundational concepts, layman analogies, quickstarts, and platform capabilities:
- [**Overview & Value Proposition**](overview/README.md): Executive summary, everyday security analogies, and core value proposition.
- [**3-Minute Quickstart Guide**](overview/QUICKSTART.md): Rapid local deployment using Docker Compose, 2-tier profiles, and first policy tests.
- [**How It Works (Architecture for Non-Engineers)**](overview/HOW_IT_WORKS.md): Step-by-step walkthrough of request lifecycles using everyday layman analogies (Airport Security Scanner, Blackout Marker, Circuit Breaker).
- [**Core Capabilities & Feature Matrix**](overview/FEATURES.md): Granular breakdown of zero-latency enforcement, dual-mode auth, and multi-channel HITL.
- [**System Requirements & Sizing**](overview/SYSTEM_REQUIREMENTS.md): Hardware specifications, operating systems, and memory footprints for production.

---

### 02. Architecture & Design
Deep dive into microservices, data plane hot paths, networking, and datastores:
- [**System Topology & Component Boundaries**](architecture/SYSTEM_TOPOLOGY.md): The 3-plane decoupled architecture (Data, Control, Intelligence), network segmentation, and fail-safe design.
- [**Pipeline, SSE Streaming & Real-Time Tracing**](architecture/PIPELINE_AND_STREAMING.md): Hot-path execution lifecycle, Server-Sent Events (SSE) streaming, Time to First Token (TTFT) metrics, and sub-5ms mid-flight severing.
- [**Distributed Telemetry (Kafka, Redis Streams & Graylog)**](architecture/TELEMETRY_KAFKA_GRAYLOG.md): High-throughput Apache Kafka topic `x4g4t.audit.stream`, partitioning strategy, backpressure fallbacks, and GELF UDP 1.1 formatting.
- [**Graylog Evolution & Forensics**](architecture/GRAYLOG_EVOLUTION.md): Root-cause analysis of the containerized forwarder evolution and lightweight simulator replacement.
- [**Network Topologies & DNS Egress Isolation**](architecture/NETWORK_DNS_ROUTING.md): Docker bridge networks, DNS filtering, SSRF perimeter guards, and TLS termination.
- [**Database Schema & Entity Models**](architecture/DATABASE_SCHEMA.md): PostgreSQL 16 schema definitions, Drizzle ORM relations, indexes, and audit table designs.
- [**Core Architecture Specification**](architecture/LEGACY_ARCHITECTURE.md): Comprehensive architectural specification covering token hashing, ring buffers, and fast paths.
- [**Concurrency, Limits & Scaling**](architecture/LARGE_SCALE_TRAFFIC_AND_LIMITS.md): High-volume throughput limits, connection pooling, and multi-replica scaling.

---

### 03. Policy Engine, DLP & Governance
Security guardrail definitions, algorithmic secret scanners, and disaster recovery:
- [**Policy Engine Reference & Operator Guide**](governance/POLICY_ENGINE_GUIDE.md): In-memory AST evaluation (<0.2ms), full operator reference, deep dot-path extractors, and sliding-window rate limits (RFC 6585).
- [**Data Loss Prevention (DLP) & Secret Scanning**](governance/DLP_AND_SECRETS.md): Shannon entropy scanning ($H(X) \ge 4.5$), Luhn Mod-10 card validation, zero-width character stripping, and Unicode NFKC normalization.
- [**Shadow Mode & Autonomous Policy Mining**](governance/SHADOW_LEARNING_MODE.md): Counterfactual non-interfering evaluation, out-of-band ML parameter distribution mining, and rolling $P_{99} \times 1.15$ threshold synthesis.
- [**Emergency Air-Gap Kill Switch**](governance/EMERGENCY_KILL_SWITCH.md): Sub-millisecond bilateral traffic drops, Redis distributed lock synchronization, and RFC 6238 TOTP two-factor authentication.
- [**Policy Setup & Threshold Authoring Guide**](governance/POLICY_GUIDE.md): Step-by-step instructions for authoring rules, setting limits, and configuring Slack triage.
- [**Battle-Tested Policy Templates Library**](governance/POLICY_TEMPLATES.md): Ready-to-deploy templates for financial guards, SQL protection, file-system fences, and PII filters.
- [**Business Logic & State Invariants**](governance/BUSINESS_LOGIC.md): Formal verification of fail-closed transitions, idempotent token caching, and race-condition prevention.
- [**Compliance & Security Framework Alignment**](governance/COMPLIANCE_AND_SECURITY.md): DISA ASD STIG, OWASP ASVS Level 3, and Common Criteria EAL4+ alignment mapping.
- [**Enterprise LLM Proxy & RBAC Lockdown**](governance/ENTERPRISE_LLM_PROXY_AND_RBAC.md): Role-based access control, IAM token verification, and organizational isolation.

---

### 04. Tool & Provider Integration
Connecting local runtimes, enterprise cloud models, autonomous coding assistants, and APIs:
- [**Local LLM Integration (Ollama & vLLM)**](integrations/LOCAL_LLM_OLLAMA.md): Ingress protection, in-flight prompt scrubbing, and embedded tool call validation for Dockerized Ollama and vLLM.
- [**Cloud Provider Integration & Reverse Key Vaulting**](integrations/CLOUD_LLMS.md): Credential isolation, dummy developer token swapping, and enterprise key injection for Google Gemini, OpenAI, and Anthropic.
- [**IDEs, Autonomous Agents & Model Context Protocol (MCP)**](integrations/IDEs_AND_AGENTS.md): Configuring Cursor, VS Code, Claude Desktop, and JSON-RPC 2.0 tool execution interceptors (`-32001`).
- [**Connecting Your Tools Walkthrough**](integrations/CONNECTING_YOUR_TOOLS.md): 5-minute configuration guides for developer workstations and autonomous agent pods.
- [**Gateway Key Injection Mechanics**](integrations/GATEWAY_KEY_INJECTION.md): Technical specification of header stripping, credential vault lookup, and downstream bearer replacement.
- [**REST & SSE API Reference**](integrations/API_REFERENCE.md): Complete OpenAPI specification of `/v1/gateway/execute`, `/v1/gateway/mcp`, `/v1/gateway/llm/*`, and polling endpoints.

---

### 05. Infrastructure & Operations
Container manifests, Kubernetes hardening, observability, and autonomous daemons:
- [**Docker Compose Stack Reference**](ops/DOCKER_COMPOSE_GUIDE.md): Complete multi-container blueprint covering all 15 services, resource allocation, and persistent volumes.
- [**Docker Compose Topology Architecture**](ops/DOCKER_COMPOSE_STACK.md): Detailed network bridges, service dependencies, environment configurations, and volume mappings.
- [**Kubernetes Hardening & Production Guide**](ops/KUBERNETES_HARDENING.md): Restricted Pod Security Standards, non-root execution, resource limits, and Prometheus ServiceMonitor configurations.
- [**Auxiliary Operations Daemon (Aux-Ops)**](ops/SELF_DISCOVERY_METRICS.md): Automated PostgreSQL schema bootstrap, Linux cgroup v1/v2 metrics harvesting, and Node.js event-loop lag sampling.
- [**Observability & Grafana Dashboard Provisioning**](ops/OBSERVABILITY_GRAFANA_PROVISIONING.md): Prometheus scrape configs, Grafana dashboard JSON models, and PromQL alerting rules.
- [**Graylog SIEM Query & Threat Hunting Guide**](ops/GRAYLOG_QUERY_GUIDE.md): Lucene query cheatsheet, stream configuration, and alert pipelines for SecOps analysts.

---

### 06. Audits, Verification & Benchmarks
Independent security audits, latency measurements, and verification reports:
- [**Black-Box QA & Security Audit Report**](audits/BLACK_BOX_SECURITY_AUDIT_REPORT.md): Complete 26-scenario verification report covering Release-Blocking Gates 1–3, SSRF adversarial corpus, and machine-readable evidence.
- [**Machine-Readable Audit Findings (JSON)**](audits/BLACK_BOX_AUDIT_REPORT.json): Structured JSON test results and assertions.
- [**Empirical Latency & Performance Benchmarks**](audits/PERFORMANCE_BENCHMARKS.md): 100,000-iteration AST evaluation benchmarks (P50 0.003ms, P99 0.015ms) and Fastify gateway benchmarks.
- [**Compliance Controls Scorecard**](audits/COMPLIANCE_SCORECARD.md): Detailed compliance status against industry cybersecurity frameworks.
- [**Policy Engine Effectiveness Report**](audits/POLICY_ENGINE_EFFECTIVENESS_REPORT.md): Evaluation of rule compilation overhead, cache hit ratios, and memory footprint.
- [**User Acceptance Testing (UAT) Report**](audits/UAT_REPORT.md): Multi-persona testing covering developers, security engineers, and compliance officers.
- [**Live Dual-Pipeline Forensic Verification**](../audit-reports/LIVE_PIPELINE_VERIFICATION.md): Empirical test output verifying Dockerized Ollama and Google Gemini reverse key vaulting.

---

### 07. Planning, Milestones & Roadmap
Strategic engineering evolution and historical project delivery:
- [**Strategic Product Blueprint**](planning/STRATEGIC_PRODUCT_BLUEPRINT.md): Comprehensive ICP definition, competitive positioning, open-core monetization model, and OWASP-aligned adversarial moat.
- [**Product Execution Roadmap**](ROADMAP.md): 12-month phased strategic roadmap covering 5-minute MCP drop-in, Policy-as-Code CLI, 6-tuple agent identity, and enterprise fleet scale.
- [**Implementation Master Plan**](planning/IMPLEMENTATION_PLAN.md): Architectural design document outlining the five implementation phases.
- [**Phase 1: Database & Policy Engine**](planning/phases/PHASE_1_DATABASE_AND_POLICY_ENGINE.md)
- [**Phase 2: Fastify Proxy Ingestion**](planning/phases/PHASE_2_FASTIFY_PROXY_INGESTION.md)
- [**Phase 3: Control Plane & Key Management**](planning/phases/PHASE_3_CONTROL_PLANE_AND_KEY_MANAGEMENT.md)
- [**Phase 4: Live Telemetry & Slack HITL**](planning/phases/PHASE_4_LIVE_TELEMETRY_AND_SLACK_HITL.md)
- [**Phase 5: MCP Gateway & System Hardening**](planning/phases/PHASE_5_MCP_GATEWAY_AND_HARDENING.md)
