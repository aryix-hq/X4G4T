# System Topology & Service Architecture

## 1. Architectural Model: 3-Plane Decoupling

X4G4T is architected around strict separation of concerns into three specialized computing planes:

```
                       ┌────────────────────────────────────────────────────────┐
                       │          X4G4T DATA PLANE: FASTIFY PROXY (:4000)       │
   Inbound AI Agents   │                                                        │      Protected Egress
 ┌───────────────────┐ │  ┌──────────────────────────────────────────────────┐  │     ┌───────────────────┐
 │ Cursor / Windsurf │ │  │ 1. Bilateral Air-Gap Kill Switch Check (<0.01ms) │  │ ──► │ Production SQL DB │
 └─────────┬─────────┘ │  ├──────────────────────────────────────────────────┤  │     └───────────────────┘
           │           │  │ 2. Dual-Mode Auth (API Keys & IAM JWT Tokens)    │  │
 ┌─────────┴─────────┐ │  ├──────────────────────────────────────────────────┤  │     ┌───────────────────┐
 │ Claude Desktop    │ │  │ 3. In-Flight DLP Token Scrubbing & AST Evaluator │  │ ──► │ Payment Gateways  │
 │ (MCP tools/call)  │ ┼─►│    - Enforce ACTIVE rules (<0.2ms evaluation)    │  │     └───────────────────┘
 └─────────┬─────────┘ │  │    - Evaluate SHADOW_LEARN rules (non-blocking)  │  │
           │           │  ├──────────────────────────────────────────────────┤  │     ┌───────────────────┐
 ┌─────────┴─────────┐ │  │ 4. Zero-Trust Credential Vaulting (Key Swap)     │  │ ──► │ Ollama / vLLM /   │
 │ LangChain / CrewAI│ │  ├──────────────────────────────────────────────────┤  │     │ Internal LLMs     │
 └─────────┬─────────┘ │  │ 5. SSRF Boundary Enforcement (RFC 1918 Isolation)│  │     └───────────────────┘
           │           │  ├──────────────────────────────────────────────────┤  │
 ┌─────────┴─────────┐ │  │ 6. Non-Blocking Event Streaming (Kafka / Redis) │  │     ┌───────────────────┐
 │ Direct REST API   │ │  └────────────────────────┬─────────────────────────┘  │ ──► │ Cloud LLMs        │
 └───────────────────┘ └───────────────────────────┼────────────────────────────┘     │ (Gemini, OpenAI)  │
                                                   │                                  └───────────────────┘
                           ┌───────────────────────┴────────────────────────┐
                           ▼                                                ▼
          ┌─────────────────────────────────┐              ┌─────────────────────────────────┐
          │ INTELLIGENCE PLANE (:5001)      │              │ CONTROL PLANE (:3000) & AUX-OPS │
          │ ├── Asynchronous Log Miner      │              │ ├── Next.js 15 Web Dashboard    │
          │ ├── Rolling P99 Quantile Bounds │              │ ├── Multi-Channel HITL Approvals│
          │ └── Policy Recommendation Queue │              │ ├── Master 2FA Kill Switch Bar  │
          │                                 │              │ └── Aux-Ops Daemon (:5050)      │
          └─────────────────────────────────┘              │     - Schema Auto-Migrations    │
                                                           │     - Cgroup Resource Harvester │
                                                           └─────────────────────────────────┘
```

---

## 2. Component Directory & Network Topology

| Component | Default Port | Technology | Primary Function | Failure Mode |
| :--- | :---: | :--- | :--- | :--- |
| **`x4g4t-proxy`** | `4000` | Fastify / Node.js 22 | Data plane reverse proxy; policy evaluation; DLP masking | Fail-closed (`503 Service Unavailable`) |
| **`x4g4t-web`** | `3000` | Next.js 15 (React 19) | Governance dashboard; policy authoring; HITL triage | Control-plane outage only (data plane unaffected) |
| **`x4g4t-aux-ops`** | `5050` | Node.js Daemon | Auto-database migrations; cgroup & proc metrics harvesting | Non-blocking telemetry omission |
| **`x4g4t-ml-service`** | `5001` | Node.js Fastify Microservice | Ingests execution histories; calculates P99 policy thresholds | Out-of-band; zero impact on proxy hot-path |
| **`postgres`** | `5432` | PostgreSQL 16 | System of record; compiled policies; execution logs | Memory cache fallback (`setDbClient` cached state) |
| **`redis`** | `6379` | Redis 7 Alpine | Rate limit tokens; distributed kill switch; streaming buffer | Local memory fallback (`clearInMemoryRateLimits`) |
| **`kafka`** | `9092` | Apache Kafka 3.7 (KRaft) | Distributed log streaming topic `x4g4t.audit.stream` | Local ring buffer & Redis Streams fallback |
| **`graylog`** | `9000` / `12201` | Graylog 6 + Mongo 6 | Enterprise SIEM; GELF UDP log ingestion | Asynchronous dropped packet; zero proxy latency |
| **`elasticsearch`** | `9200` | Elasticsearch 7.10 | Telemetry indexer; log retention; time-rotated indexes | Asynchronous retry buffer |

---

## 3. High-Assurance Boundaries & Isolation

### A. Network Segmentation
- All intra-service communication runs across an isolated Docker bridge network (`x4g4t-network`).
- External AI clients can communicate exclusively with port `:4000` (Proxy Data Plane) and port `:3000` (Web UI).
- Internal datastores (`postgres:5432`, `redis:6379`, `mongodb:27017`, `elasticsearch:9200`) do not bind to public interfaces in production.

### B. In-Memory Resiliency
- In the event of a total network partition between the proxy and PostgreSQL, the proxy serves cached, pre-compiled AST policies directly from memory.
- If Redis becomes unreachable, sliding-window rate limit counters fall back to in-process atomic token buckets to prevent service disruptions.
