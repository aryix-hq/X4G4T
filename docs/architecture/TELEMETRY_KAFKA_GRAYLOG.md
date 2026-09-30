# Distributed Telemetry: Apache Kafka, Redis Streams & Graylog GELF

## 1. Overview & Dual-Bus Architecture

Enterprise AI governance requires immutable, high-throughput audit logging that cannot be dropped during upstream database maintenance or network partitions. X4G4T implements a dual-bus telemetry pipeline:

```
                  ┌────────────────────────────────────────┐
                  │      X4G4T FASTIFY PROXY ENGINE        │
                  │       (POST /v1/gateway/execute)       │
                  └───────────────────┬────────────────────┘
                                      │
                         Asynchronous Fire-and-Forget
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
  ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
  │ Apache Kafka Bus  │     │ Redis Stream      │     │ Graylog GELF 1.1  │
  │ Topic:            │     │ Key:              │     │ UDP Port:         │
  │ x4g4t.audit.stream│     │ x4g4t:buffer:audit│     │ :12201            │
  └─────────┬─────────┘     └─────────┬─────────┘     └─────────┬─────────┘
            │                         │                         │
            ▼                         ▼                         ▼
   Enterprise Data Lake       In-Memory Fallback       Live Security SIEM
    (Snowflake / S3)         & Fastify Consumers     (Threat Hunting Console)
```

---

## 2. Apache Kafka Telemetry Pipeline

### Topic Specification
- **Primary Audit Topic:** `x4g4t.audit.stream`
- **Partitioning Strategy:** Keyed by `orgId`. This guarantees strict per-organization chronological order while distributing load evenly across multiple Kafka broker partitions.
- **Replication Factor:** Default `1` for single-node development; configured for `3` with `min.insync.replicas=2` in multi-node Kubernetes clusters.

### Kafka Audit Event Payload Schema
Every tool execution event dispatched to `x4g4t.audit.stream` conforms to the following JSON schema:

```json
{
  "eventId": "evt_9a8b7c6d-e5f4-4321-8765-abcdef012345",
  "orgId": "org_enterprise_defense",
  "agentId": "cursor_coding_agent",
  "userEmail": "engineer.alice@company.com",
  "userName": "Alice Chen",
  "clientIp": "192.168.1.150",
  "clientHostname": "macbook-pro-alice.local",
  "sessionId": "sess_agent_refactor_001",
  "toolName": "database_query",
  "arguments": {
    "sql": "SELECT id, email, status FROM users WHERE role = 'admin';"
  },
  "verdict": "PASSED",
  "triggeredPolicyId": null,
  "isStreaming": false,
  "timeToFirstTokenMs": 14,
  "totalTokens": 182,
  "latencyMs": 2,
  "timestamp": "2026-09-30T10:15:30.450Z"
}
```

---

## 3. Backpressure & Outage Resilience (Redis Stream Fallback)

If the Apache Kafka broker cluster is unreachable or undergoes maintenance:
1. **Zero Data Loss Invariant:** The proxy immediately redirects audit events to Redis Streams under key `x4g4t:buffer:audit`.
2. **Atomic Ring Buffering:** Events are capped at `MAXLEN ~ 100000` to prevent memory exhaustion while retaining up to 100,000 backlogged events.
3. **Local In-Memory Cache:** In isolated test or developer environments without active Redis or Kafka, the proxy maintains a local 1,000-event ring buffer accessible via `getRecentAuditStreamEvents()`.

---

## 4. Graylog REST API & GELF UDP Transport

For live security incident response (SIEM), X4G4T emits GELF 1.1 formatted UDP packets to Graylog on port `12201`:

### GELF 1.1 Packet Structure
```json
{
  "version": "1.1",
  "host": "x4g4t-proxy-node-01",
  "short_message": "[cursor_coding_agent] database_query -> PASSED (ACTIVE)",
  "full_message": "{\"eventId\":\"evt_123\",\"verdict\":\"PASSED\",...}",
  "timestamp": 1790763330.45,
  "level": 6,
  "_org_id": "org_enterprise_defense",
  "_agent_id": "cursor_coding_agent",
  "_tool_name": "database_query",
  "_verdict": "PASSED",
  "_client_ip": "192.168.1.150",
  "_user_email": "engineer.alice@company.com",
  "_latency_ms": 2,
  "_status_code": 200
}
```

### Graylog REST API Polling in Web Dashboard
The Next.js governance dashboard (`apps/web/lib/graylog.ts`) communicates directly with the Graylog REST API:
- `GET /api/system/metrics`: Harvests 1-second rate metrics (`org.graylog2.throughput.input.1-sec-rate`, `output.1-sec-rate`).
- `GET /api/search/universal/relative`: Powers real-time search queries across agent logs with filtering by `_agent_id`, `_verdict`, or `_user_email`.
