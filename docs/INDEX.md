# X4G4T Master Documentation Index

Welcome to the comprehensive technical documentation for **X4G4T** (`@aryix-hq/x4g4t`), the zero-latency, headless policy firewall and Data Leakage Prevention (DLP) proxy for autonomous AI agents and Model Context Protocol (MCP) servers.

---

## 🧭 Navigation & Section Index

### 01. Getting Started & Overview
Foundational concepts, layman analogies, and local development setup:
- [**Overview & Value Proposition**](overview/README.md): Executive summary, everyday security analogies, and high-level architectural benefits.
- [**3-Minute Quickstart Guide**](overview/QUICKSTART.md): Rapid local deployment using Docker Compose, 2-tier architecture profiles, and first policy tests.

---

### 02. Architecture & Design
Deep dive into microservices, data plane hot paths, and distributed streaming:
- [**System Topology & Component Boundaries**](architecture/SYSTEM_TOPOLOGY.md): The 3-plane decoupled architecture (Data, Control, Intelligence), network segmentation, and fail-safe design.
- [**Pipeline, SSE Streaming & Real-Time Tracing**](architecture/PIPELINE_AND_STREAMING.md): Hot-path execution lifecycle, Server-Sent Events (SSE) streaming, Time to First Token (TTFT) metrics, and sub-5ms mid-flight severing.
- [**Distributed Telemetry (Kafka, Redis Streams & Graylog)**](architecture/TELEMETRY_KAFKA_GRAYLOG.md): High-throughput Apache Kafka topic `x4g4t.audit.stream`, partitioning strategy, backpressure fallbacks, and GELF UDP 1.1 formatting.
- [**Graylog Evolution & Forensics**](architecture/GRAYLOG_EVOLUTION.md): Root-cause analysis of the containerized forwarder evolution and lightweight simulator replacement.

---

### 03. Policy Engine, DLP & Governance
Security guardrail definitions, algorithmic secret scanners, and disaster recovery:
- [**Policy Engine Reference & Operator Guide**](governance/POLICY_ENGINE_GUIDE.md): In-memory AST evaluation (<0.2ms), full operator reference, deep dot-path extractors, and sliding-window rate limits (RFC 6585).
- [**Data Loss Prevention (DLP) & Secret Scanning**](governance/DLP_AND_SECRETS.md): Shannon entropy scanning ($H(X) \ge 4.5$), Luhn Mod-10 card validation, zero-width character stripping, and Unicode NFKC normalization.
- [**Shadow Mode & Autonomous Policy Mining**](governance/SHADOW_LEARNING_MODE.md): Counterfactual non-interfering evaluation, out-of-band ML parameter distribution mining, and rolling $P_{99} \times 1.15$ threshold synthesis.
- [**Emergency Air-Gap Kill Switch**](governance/EMERGENCY_KILL_SWITCH.md): Sub-millisecond bilateral traffic drops, Redis distributed lock synchronization, and RFC 6238 TOTP two-factor authentication.

---

### 04. Tool & Provider Integration
Connecting local runtimes, enterprise cloud models, and autonomous coding assistants:
- [**Local LLM Integration (Ollama & vLLM)**](integrations/LOCAL_LLM_OLLAMA.md): Ingress protection, in-flight prompt scrubbing, and embedded tool call validation for Dockerized Ollama and vLLM.
- [**Cloud Provider Integration & Reverse Key Vaulting**](integrations/CLOUD_LLMS.md): Credential isolation, dummy developer token swapping, and enterprise key injection for Google Gemini, OpenAI, and Anthropic.
- [**IDEs, Autonomous Agents & Model Context Protocol (MCP)**](integrations/IDEs_AND_AGENTS.md): Configuring Cursor, VS Code, Claude Desktop, and JSON-RPC 2.0 tool execution interceptors.

---

### 05. Infrastructure & Operations
Container manifests, Kubernetes hardening, and autonomous operations daemons:
- [**Docker Compose Stack Reference**](ops/DOCKER_COMPOSE_GUIDE.md): Complete multi-container blueprint covering all 15 services, resource allocation, and persistent volumes.
- [**Kubernetes Hardening & Production Guide**](ops/KUBERNETES_HARDENING.md): Restricted Pod Security Standards, non-root execution, resource limits, and Prometheus ServiceMonitor configurations.
- [**Auxiliary Operations Daemon (Aux-Ops)**](ops/SELF_DISCOVERY_METRICS.md): Automated PostgreSQL schema bootstrap, Linux cgroup v1/v2 metrics harvesting, and Node.js event-loop lag sampling.

---

### 06. Audits, Verification & Roadmap
Independent evaluations, empirical black-box testing, and product milestones:
- [**Black-Box QA & Security Audit Report**](BLACK_BOX_SECURITY_AUDIT_REPORT.md): Complete 26-scenario verification report covering Release-Blocking Gates 1–3, SSRF adversarial corpus, and machine-readable evidence.
- [**Engineering Product Roadmap**](ROADMAP.md): Phased engineering milestones spanning eBPF kernel redirection, ONNX tensor models, and enterprise zero-trust mesh.
