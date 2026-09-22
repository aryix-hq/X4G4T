# X4G4T Turn-Key Docker Compose Stack

X4G4T ships with a single-command, zero-dependency, production-grade **Turn-Key Docker Compose Stack**. Whether you are evaluating locally, deploying in an air-gapped environment, or spinning up a staging sandbox, the entire microservice topology initializes with full service health cascades, automated database seeding, metrics scraping, and pre-provisioned Grafana dashboards in under 30 seconds.

---

## 1. Architectural Overview

The stack orchestrates **7 interconnected services** over an isolated internal Docker bridge network (`x4g4t-network`), ensuring zero external ports are required other than the designated host ingress points.

```mermaid
graph TD
    User["SecOps Admin / Developer"] -->|Port 3000: Web Dashboard| Web["Next.js Web Control Plane<br/>(x4g4t-web)"]
    AIClient["AI Agents / Claude Code / Cursor / MCP"] -->|Port 4000: Gateway Ingress| Proxy["Fastify Proxy AI Firewall<br/>(x4g4t-proxy)"]
    SecEng["Security Engineer"] -->|Port 3001: Grafana UI| Grafana["Grafana 10.4.2<br/>(x4g4t-grafana)"]

    subgraph "X4G4T Turn-Key Stack"
        Proxy -->|Read Policies & Seed| Postgres[("PostgreSQL 16 Alpine<br/>Port 5432")]
        Proxy -->|Sliding Window Lua| Redis[("Redis 7 Alpine<br/>Port 6379")]
        Proxy -->|Fire-and-Forget Daily Logs| ES[("Elasticsearch 8.13<br/>Port 9200")]
        Proxy -->|Vaulted Key Injection| UpstreamLLM["Upstream LLMs (OpenAI, Gemini, Anthropic)"]

        Web -->|CRUD Policies & IAM| Postgres
        Web -->|Internal Policy Sync| Proxy

        Prometheus["Prometheus 2.51<br/>Port 9090"] -->|Scrapes /metrics (5s)| Proxy
        Grafana -->|PromQL Queries| Prometheus
        Grafana -->|Lucene / Index Query| ES
    end
```

---

## 2. Container Topology & Port Allocations

| Service Name | Container Name | Image | Host Port | Internal Port | Primary Responsibility |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | `x4g4t-postgres` | `postgres:16-alpine` | `5432` | `5432` | Tenant isolations, API keys, compiled AST policies, HITL approval holds, audit tables. Auto-seeds `docker/postgres/init.sql`. |
| **Redis** | `x4g4t-redis` | `redis:7-alpine` | `6379` | `6379` | High-frequency sliding-window rate limiting (`eval` Lua script), BullMQ asynchronous background queue. |
| **Elasticsearch** | `x4g4t-elasticsearch` | `docker.elastic.co/elasticsearch/elasticsearch:8.13.4` | `9200` | `9200` | Cold immutable audit sink with automated daily index rotation (`x4g4t-logs-YYYY.MM.DD`). |
| **Prometheus** | `x4g4t-prometheus` | `prom/prometheus:v2.51.2` | `9090` | `9090` | Real-time scraper polling Fastify proxy `/metrics` at 5s intervals. |
| **Grafana** | `x4g4t-grafana` | `grafana/grafana:10.4.2` | `3001` | `3000` | Auto-provisioned dashboards for latency percentiles, DLP redactions, token injection rates, and operational gauges. |
| **Fastify Proxy** | `x4g4t-proxy` | `x4g4t-proxy:latest` | `4000` | `4000` | Sub-millisecond AI policy firewall, SSRF protection, DLP sanitizer, MCP frame inspector, upstream key injector. |
| **Web UI** | `x4g4t-web` | `x4g4t-web:latest` | `3000` | `3000` | Next.js 14 App Router enterprise control plane with Clerk/RBAC authentication and human-in-the-loop triage console. |

---

## 3. Healthchecks & Startup Dependency Cascade

To prevent race conditions during cold boots, X4G4T enforces strict healthcheck dependencies using Docker Compose `depends_on: { condition: service_healthy }`:

```mermaid
graph TD
    Postgres["postgres (pg_isready)"] -->|service_healthy| Proxy["proxy (Fastify Gateway)"]
    Redis["redis (redis-cli ping)"] -->|service_healthy| Proxy
    ES["elasticsearch (cluster health)"] -->|service_healthy| Proxy

    Proxy -->|service_started| Prometheus["prometheus"]
    Proxy -->|service_started| Web["web (Next.js Dashboard)"]

    Prometheus -->|service_started| Grafana["grafana"]
    ES -->|service_healthy| Grafana
```

### Healthcheck Definitions
1. **PostgreSQL**:
   ```yaml
   test: ["CMD-SHELL", "pg_isready -U postgres -d x4g4t"]
   interval: 5s
   timeout: 3s
   retries: 5
   ```
2. **Redis**:
   ```yaml
   test: ["CMD", "redis-cli", "ping"]
   interval: 5s
   timeout: 3s
   retries: 5
   ```
3. **Elasticsearch**:
   ```yaml
   test: ["CMD-SHELL", "curl -s http://localhost:9200/_cluster/health | grep -q 'green\\|yellow'"]
   interval: 10s
   timeout: 5s
   retries: 5
   ```

---

## 4. Volume Persistence & Data Retention

Five named volumes guarantee zero data loss during container upgrades or reboots:

```yaml
volumes:
  postgres_data:       # Stores SQL tables, schema migrations, and user credentials
  redis_data:          # Stores in-flight rate limit counters & queue states
  elasticsearch_data:  # Stores daily-partitioned Lucene audit indices
  prometheus_data:     # Stores 15-day default TSDB metric time-series blocks
  grafana_data:        # Stores dashboard preferences and local Grafana session state
```

---

## 5. Quickstart & Deployment Instructions

### 5.1 Prerequisites
- Docker Engine 24.0+
- Docker Compose v2.20+
- 4 GB Available Host RAM (Elasticsearch runs at 512MB heap)

### 5.2 Launch Stack
Run the following command from the root of the repository:

```bash
# Clone and enter repo
git clone https://github.com/aryix-hq/X4G4T.git
cd X4G4T

# Start all 7 services in detached mode
docker compose up -d
```

### 5.3 Verify Boot Status
Check the status of all containers:
```bash
docker compose ps
```
All containers should display state `Up (healthy)`.

### 5.4 Test Gateway Health
```bash
# Verify proxy health
curl -s http://localhost:4000/health
# Response: {"status":"ok","timestamp":"...","uptime":...}

# Verify Prometheus metrics endpoint
curl -s http://localhost:4000/metrics | grep x4g4t
```

---

## 6. Accessing User Interfaces

| Destination | URL | Credentials |
| :--- | :--- | :--- |
| **X4G4T Web Control Plane** | [http://localhost:3000](http://localhost:3000) | Single Sign-On / Clerk configured or direct sandbox mode |
| **Observability (Grafana)** | [http://localhost:3001](http://localhost:3001) | Anonymous Admin enabled (or `admin` / `admin`) |
| **Prometheus Raw Metrics** | [http://localhost:9090](http://localhost:9090) | No auth (internal network) |
| **Elasticsearch Cluster Health** | [http://localhost:9200/_cluster/health](http://localhost:9200/_cluster/health) | No auth (internal network) |
| **Fastify Gateway Ingress** | [http://localhost:4000/v1/gateway/execute](http://localhost:4000/v1/gateway/execute) | Header: `Authorization: Bearer sec_live_x4g4t_demo` |

---

## 7. Configuration Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/x4g4t` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `ELASTICSEARCH_URL` | `http://elasticsearch:9200` | Elasticsearch host URI |
| `ELASTICSEARCH_INDEX` | `x4g4t-logs` | Base index prefix |
| `ELASTICSEARCH_INDEX_ROTATION` | `daily` | Rotation pattern (`daily`, `none`) |
| `ADMIN_GROUPS` | `X4G4T-Admins,Administrators,admins,secops` | Comma-delimited IAM groups for admin access |
| `DEVELOPER_GROUPS` | `X4G4T-Developers,Developers,engineers` | Comma-delimited IAM groups for developer access |
| `OPENAI_API_KEY` | *(Optional)* | Upstream key injected when client targets `api.openai.com` |
| `ANTHROPIC_API_KEY` | *(Optional)* | Upstream key injected when client targets `api.anthropic.com` |
| `GEMINI_API_KEY` | *(Optional)* | Upstream key injected when client targets `generativelanguage.googleapis.com` |
| `SLACK_HITL_WEBHOOK_URL` | *(Optional)* | Webhook for Human-in-the-Loop interactive approval buttons |

---

## 8. Teardown & Maintenance

```bash
# Stop containers without wiping persistent volumes
docker compose down

# Stop containers and destroy all volumes (full clean reset)
docker compose down -v
```

