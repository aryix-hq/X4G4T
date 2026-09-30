# Architectural Evolution: Graylog, GELF Forwarding & Telemetry Streaming

## 1. Executive Summary & Git History Forensics

This document records the architectural evolution and root-cause analysis regarding Graylog log forwarding, client simulation, and the telemetry ingestion pipeline within **X4G4T** (`@aryix-hq/x4g4t`).

### Git Forensics Findings
A comprehensive Git commit inspection (`git log --all --full-history -- "**/graylog*"`, `git log -S "graylog"`, and `git log --diff-filter=D --summary`) reveals the following historical trajectory:

1. **v0.1.0 Initial Commit (`0631502`):**
   - Focused primarily on core proxy routing, AST policy evaluation, and basic PostgreSQL/Redis audit storage.
   - Graylog and auxiliary forwarder containers were not yet part of the repository scaffolding.

2. **v0.2.0 Enterprise Expansion (`fdd9d4a` & `609f9b3`):**
   - Added enterprise-scale microservices: `apps/graylog-forwarder`, `apps/client-simulator`, and `apps/aux-ops`.
   - Introduced Apache Kafka (KRaft mode 3.7.0), MongoDB 6, and Graylog 6 containers to `docker-compose.yml`.
   - Implemented direct in-engine GELF dispatch via `packages/policy-engine/src/log-exporter.ts` (`sendGelfToGraylog`).
   - Implemented live Graylog REST API polling in `apps/web/lib/graylog.ts`.

3. **CI & Operational Hardening (`d71610c` & `9dad31b`):**
   - The full 15-container Docker Compose stack required **>4GB–6GB of RAM** (Elasticsearch JVM heap, Graylog Java server, MongoDB, Kafka, Postgres, and Redis).
   - In CI environments (GitHub Actions ubuntu-latest runners) and local developer laptops, spinning up a live Elasticsearch/Graylog cluster introduced significant resource contention, Docker image build timeouts, and flakiness.
   - Consequently, the repository transitioned to a **2-Tier Architecture**:
     - **Tier 1 (Core Guardrail):** Fastify Proxy + Next.js Control Plane + Redis + Postgres (~350MB RAM).
     - **Tier 2 (Enterprise Telemetry):** Kafka + Graylog + Elasticsearch + Prometheus + Grafana (opt-in enterprise profiles).

---

## 2. Why the Dedicated Forwarder Container Was Subsumed

The dedicated `graylog-forwarder` container was originally envisioned as a Docker socket log-tailing sidecar. However, it was superseded by two architectural patterns:

### A. Direct In-Process GELF Transport
Instead of writing logs to container `stdout` and relying on an external sidecar to scrape `/var/run/docker.sock`, `packages/policy-engine/src/log-exporter.ts` dispatches structured GELF 1.1 payloads over UDP port 12201 directly from the Fastify proxy process:
- **Sub-millisecond Non-blocking Egress:** Dispatched via Node.js native `dgram` socket without blocking event-loop execution.
- **Rich Context Preservation:** GELF messages directly carry high-cardinality metadata (`_org_id`, `_agent_id`, `_tool_name`, `_verdict`, `_client_ip`, `_user_email`, `_arguments`, and `_latency_ms`) that container log scrapers cannot easily extract.

### B. High-Throughput Distributed Telemetry via Apache Kafka
For enterprise scale, log ingestion moved to Apache Kafka on topic `x4g4t.audit.stream`:
- High write throughput (>50,000 events/sec) with native backpressure.
- Downstream log consumers (Graylog Kafka input, Elasticsearch Logstash pipeline, SIEM connectors) consume directly from the partitioned Kafka stream.
- In environments without active Kafka brokers, the gateway falls back closed to in-memory/Redis stream buffers.

---

## 3. Lightweight Local Testing: `tools/simulators/graylog-emitter.ts`

To enable local developer verification without forcing engineers to maintain a 4GB Elasticsearch + Graylog Java cluster on their machines, X4G4T provides a standalone zero-dependency simulator:

**Location:** `tools/simulators/graylog-emitter.ts`

### Capabilities
1. **Receiver Mode (Local GELF Sink):**
   - Listens on UDP port `12201`.
   - Automatically inflates uncompressed, zlib, or gzip-compressed GELF 1.1 packets.
   - Formats and displays real-time security events with colorized status badges and timing metrics.
   - Run via:
     ```bash
     pnpm --filter @x4g4t/proxy exec tsx tools/simulators/graylog-emitter.ts --listen
     ```

2. **Emitter Mode (Synthetic Traffic Generator):**
   - Emits synthetic GELF 1.1 payloads (`ALLOW`, `BLOCKED`, `REQUIRE_APPROVAL`) directly to target GELF endpoints to test log forwarder pipelines.
   - Run via:
     ```bash
     pnpm --filter @x4g4t/proxy exec tsx tools/simulators/graylog-emitter.ts --emit --count=10
     ```

---

## 4. Summary Matrix

| Capability | Legacy Docker Sidecar | Current Architecture |
| :--- | :--- | :--- |
| **GELF Delivery** | Scrapes `/var/run/docker.sock` | Direct UDP GELF 1.1 in `log-exporter.ts` |
| **Stream Transport** | None | Apache Kafka `x4g4t.audit.stream` (KRaft) |
| **Local Verification** | Requires 4GB live Graylog + ES + Mongo | Lightweight `tools/simulators/graylog-emitter.ts` |
| **Resource Overhead** | Heavy (Multiple Java/JVM containers) | Near zero (<20MB memory for simulator) |
| **Telemetry Richness** | Unstructured text regex parsing | Native structured JSON fields with IAM & Network contexts |
