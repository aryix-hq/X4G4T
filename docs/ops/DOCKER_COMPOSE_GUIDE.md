# Docker Compose Infrastructure Reference

## 1. Multi-Container Stack Architecture

X4G4T's `docker-compose.yml` provides a production-modeled reference deployment spanning 15 specialized containers:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           X4G4T COMPOSE STACK                          │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 1. Core Data Plane & Storage:                                          │
  │    • x4g4t-proxy (:4000)        - Fastify zero-latency reverse proxy   │
  │    • x4g4t-web (:3000)          - Next.js 15 governance dashboard      │
  │    • x4g4t-postgres (:5432)     - PostgreSQL 16 persistence store      │
  │    • x4g4t-redis (:6379)        - Redis 7 cache & distributed locks    │
  │    • x4g4t-aux-ops (:5050)      - DB bootstrap & cgroup monitoring     │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 2. Telemetry, Streaming & SIEM:                                        │
  │    • x4g4t-kafka (:9092)        - Apache Kafka 3.7 event streaming     │
  │    • x4g4t-graylog (:9000)      - Centralized GELF log SIEM console    │
  │    • x4g4t-mongodb (:27017)     - Graylog configuration datastore      │
  │    • x4g4t-elasticsearch (:9200)- Telemetry search & log indexer       │
  │    • x4g4t-graylog-forwarder    - GELF sidecar log forwarder           │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 3. Observability & Autonomous Intelligence:                            │
  │    • x4g4t-ml-service (:5001)   - Out-of-band ML policy mining daemon  │
  │    • x4g4t-prometheus (:9090)   - Time-series metrics engine           │
  │    • x4g4t-grafana (:3001)      - Pre-built telemetry visualizer       │
  │    • x4g4t-cadvisor (:8080)     - Container hardware metrics           │
  │    • x4g4t-client-simulator     - Autonomous mock drill generator      │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service Profiles & Resource Allocation

| Service | Internal Port | Host Port | RAM Allocation | Primary Health Check |
| :--- | :---: | :---: | :---: | :--- |
| `postgres` | `5432` | `5432` | 256MB | `pg_isready -U postgres` |
| `redis` | `6379` | `6379` | 128MB | `redis-cli ping` |
| `proxy` | `4000` | `4000` | 256MB | `curl -f http://localhost:4000/healthz` |
| `web` | `3000` | `3000` | 256MB | `curl -f http://localhost:3000/api/metrics` |
| `aux-ops` | `5050` | `5050` | 64MB | `curl -f http://localhost:5050/healthz` |
| `ml-service`| `5001`| `5001` | 128MB | `curl -f http://localhost:5001/healthz` |
| `kafka` | `9092` | `9092` | 512MB | Native TCP port bind |
| `graylog` | `9000` | `9000` | 1024MB | Native HTTP API check |
| `elasticsearch` | `9200` | `9200` | 1024MB | `curl -f http://localhost:9200/_cluster/health` |
| `prometheus`| `9090`| `9090` | 256MB | Native HTTP check |
| `grafana` | `3000` | `3001` | 128MB | `curl -f http://localhost:3000/api/health` |

---

## 3. Persistent Volumes

- `postgres_data`: Stores policy graphs, API keys, and audit logs.
- `redis_data`: Retains sliding window counters and distributed kill switch locks.
- `kafka_data`: Holds partitioned log stream topics (`x4g4t.audit.stream`).
- `graylog_data` / `elasticsearch_data`: Long-term indexed log storage.
- `prometheus_data` / `grafana_data`: Prometheus time-series database.

---

## 4. Operational Commands

```bash
# Start Core Tier 1 Services
docker compose up -d postgres redis proxy web aux-ops

# Start Full Enterprise Stack
docker compose up -d

# Tail live gateway logs
docker compose logs -f proxy

# View real-time container resource usage
docker compose stats
```
