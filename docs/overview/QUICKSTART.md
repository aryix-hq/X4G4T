# Quickstart: 3-Minute Local Deployment

Get X4G4T up and running locally in under three minutes using Docker Compose.

---

## 1. Prerequisites

- **Docker & Docker Compose** (Docker Desktop on macOS/Windows, or Docker Engine on Linux)
- **Node.js 20+** and **pnpm 12.4.2** (only required if developing locally without containers)
- **curl** or **Postman** for issuing test requests

---

## 2. Choosing Your Deployment Tier

X4G4T features a **2-Tier Architecture** to accommodate local developer laptops as well as full enterprise telemetry stacks:

```
  ┌─────────────────────────────────────────────────────────────┐
  │ TIER 1: Core Gateway & Guardrails (~350MB RAM) [Default]    │
  │ • Fastify Reverse Proxy (:4000)                             │
  │ • Next.js Control Plane Dashboard (:3000)                   │
  │ • Redis 7 In-Memory Cache (:6379)                           │
  │ • PostgreSQL 16 Database (:5432)                            │
  │ • Aux-Ops System Daemon (:5050)                             │
  └─────────────────────────────────────────────────────────────┘
                                 │ + Optional Profile
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ TIER 2: Enterprise Telemetry & ML (Requires ~4GB RAM)       │
  │ • Apache Kafka 3.7 KRaft Mode (:9092)                       │
  │ • Graylog 6 & MongoDB 6 (:9000, :12201 UDP GELF)            │
  │ • Elasticsearch 7.10 (:9200)                                │
  │ • Prometheus (:9090) & Grafana (:3001)                      │
  │ • ML Policy Mining Daemon (:5001)                           │
  └─────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-Step Installation

### Step 1: Clone the Repository & Configure Environment
```bash
git clone https://github.com/aryix-hq/X4G4T.git
cd X4G4T

# Copy the standardized environment configuration
cp .env.docker.example .env
```

### Step 2: Launch the Tier 1 Stack
```bash
# Start the Core Gateway services in the background
docker compose up -d postgres redis proxy web aux-ops
```

Verify service readiness:
```bash
# Check Proxy health status
curl -i http://localhost:4000/healthz

# Response: HTTP/200 OK {"status":"healthy"}
```

Access the Next.js Control Plane Web Dashboard in your browser:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 4. Testing Your First Policy Guardrail

Issue a test request to the execution gateway using the built-in development API key:

### Test A: Legitimate Read-Only Query (Expected: `ALLOW`)
```bash
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_dev_key_12345678901234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "cursor_coding_agent",
    "tool_name": "database_query",
    "arguments": {
      "query": "SELECT id, name FROM users LIMIT 10;"
    }
  }'
```

**Expected Response (`HTTP 200 OK`):**
```json
{
  "verdict": "ALLOW",
  "latencyMs": 1,
  "toolName": "database_query",
  "message": "Tool execution passed all active policy guardrails."
}
```

---

### Test B: Destructive Query Attempt (Expected: `POLICY_VIOLATION`)
```bash
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_dev_key_12345678901234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "cursor_coding_agent",
    "tool_name": "database_query",
    "arguments": {
      "query": "DROP TABLE users;"
    }
  }'
```

**Expected Response (`HTTP 422 Unprocessable Entity`):**
```json
{
  "verdict": "BLOCK",
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Execution blocked by policy rule 'Destructive SQL Prevention'."
  }
}
```

---

## 5. Launching Tier 2 (Enterprise Telemetry & Kafka)

When deploying to a staging/production VM with at least 8GB RAM, activate the complete telemetry infrastructure:

```bash
docker compose up -d
```

This starts Apache Kafka (KRaft mode on `:9092`), Elasticsearch (`:9200`), Graylog (`:9000`), Prometheus (`:9090`), and Grafana (`:3001`).
