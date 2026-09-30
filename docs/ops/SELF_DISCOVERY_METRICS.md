# Auxiliary Operations: Self-Discovery, Cgroups & Telemetry

## 1. Overview of the Aux-Ops Microservice (:5050)

The **Auxiliary Operations Service** (`apps/aux-ops/src/index.ts`) is a lightweight background daemon that eliminates manual maintenance and operational toil in X4G4T deployments:

1. **Automated Database Schema Migration:** Bootstraps and evolves the PostgreSQL schema automatically on container boot.
2. **Dynamic Cgroups & Container Telemetry:** Directly harvests Linux cgroups v1 and v2 kernel statistics without requiring Docker socket access.
3. **Event-Loop Lag Sampling:** Samples Node.js microtask queue latency to detect event-loop starvation before it impacts request processing.
4. **Service Node TCP Auto-Discovery:** Performs active health checks across all 12 cluster services every 10 seconds.

---

## 2. Automated Schema Bootstrap

On startup, Aux-Ops checks the database connection string (`DATABASE_URL`). If `AUTO_MIGRATE !== "false"`:
- Validates the existence of core tables: `organizations`, `api_keys`, `policies`, `policy_rules`, `execution_logs`, `hitl_requests`, and `upstream_providers`.
- Automatically executes pending schema migrations and creates performance indexes.
- Developers never need to manually run `drizzle-kit push` or seed scripts.

---

## 3. Kernel Cgroup & Proc Metrics Harvesting

Aux-Ops reads directly from the Linux kernel virtual filesystem:

- **Cgroups v2:** `/sys/fs/cgroup/cpu.stat` (CPU usage microseconds), `/sys/fs/cgroup/memory.current` (RSS memory), `/sys/fs/cgroup/memory.max` (memory limits).
- **Cgroups v1 Fallback:** Reads `/sys/fs/cgroup/cpu/cpuacct.usage` and `/sys/fs/cgroup/memory/memory.usage_in_bytes`.
- **System Memory Percent:** Computes real-time container memory saturation relative to its configured quota.

---

## 4. Node.js Event-Loop Lag Sampling

To guarantee that the Fastify proxy does not experience event-loop freezing:
- Aux-Ops samples timer drift every 100 milliseconds:
  $$\text{Lag} = \text{Actual Time} - \text{Scheduled Time}$$
- Maintains a rolling window of 600 samples.
- Calculates exact quantiles:
  - $P_{50}$ (Median lag, typically $<1\text{ms}$)
  - $P_{90}$ (90th percentile, typically $<2\text{ms}$)
  - $P_{99}$ (99th percentile, alerted if $>15\text{ms}$)

---

## 5. TCP Service Node Auto-Discovery

Aux-Ops pings all services defined in `MONITORED_SERVICES`:
`proxy:4000,web:3000,ml-service:5001,postgres:5432,redis:6379,elasticsearch:9200,graylog:9000,kafka:9092,aux-ops:5050,grafana:3000,prometheus:9090,client-simulator:4500`

Exposed at endpoint:
```bash
curl http://localhost:5050/telemetry
```

Returns unified cluster health, hardware utilization, and connection state in a single JSON payload.
