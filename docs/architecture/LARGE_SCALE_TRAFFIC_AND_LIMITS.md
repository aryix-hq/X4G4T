# X4G4T: High-Throughput Enterprise Architecture & Scale Limits
### Engineering Blueprint for 100,000+ Requests Per Second (RPS) & Multi-Region Agent Pipelines

This document specifies the **production topology, capacity planning, bottleneck mitigation, and scale limits** required to scale X4G4T from a single-tenant prototype to an enterprise-grade platform processing hundreds of millions of daily agent tool executions.

---

## 0. System Sizing & Hardware Allocation Matrix (Containers & VMs)

To achieve predictable $<15\text{ms}$ gateway latency and prevent CPU throttling or out-of-memory (OOM) kills, use the following resource sizing matrix:

### Sizing Tiers by Traffic Volume

| Tier | Sustained Traffic | Peak Burst | Fastify Proxy (`apps/proxy`) | Next.js Web (`apps/web`) | Redis / ElastiCache | PostgreSQL / Aurora |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Dev / Sandbox** | 1 – 250 RPS | 500 RPS | 1 Container: 0.5 vCPU, 512MB RAM | 1 Container: 0.5 vCPU, 512MB RAM | 1 Node: 512MB RAM (Redis 7) | 1 vCPU, 2GB RAM (Shared / Neon) |
| **Tier 2: Production Standard** | 500 – 3,000 RPS | 5,000 RPS | 2–4 Pods: 1 vCPU, 1GB RAM per pod | 2 Pods: 1 vCPU, 1GB RAM | 2 Nodes: 2GB RAM (`cache.t4g.small`) | RDS `db.m6g.large`: 2 vCPU, 8GB, 1k IOPS |
| **Tier 3: Enterprise Scale** | 3,000 – 25,000 RPS | 40,000 RPS | 6–12 Pods: 2 vCPU, 2GB RAM per pod | 4 Pods: 2 vCPU, 2GB RAM | 3 Nodes: 6GB RAM (`cache.m6g.large`) | Aurora `db.r6g.xlarge`: 4 vCPU, 32GB, 3k IOPS |
| **Tier 4: Hyperscale Mesh** | 25,000 – 100,000+ RPS | 150,000+ RPS | 20–40 Pods: 4 vCPU, 4GB RAM per pod | 8–12 Pods: 4 vCPU, 4GB RAM | 6 Nodes: 16GB RAM (`cache.r6g.xlarge`) | Aurora Multi-AZ `db.r6g.4xlarge`: 16 vCPU, 128GB |

### Container Resource Limits (Kubernetes / ECS)

```yaml
# Recommended Production Kubernetes Resource Block (per Proxy Pod)
resources:
  requests:
    cpu: 1000m       # 1 full vCPU
    memory: 1024Mi    # 1 GB RAM
  limits:
    cpu: 2000m       # Burst up to 2 vCPU
    memory: 2048Mi    # Strict cap to prevent OOM
```

---

## 1. High-Scale Architectural Topology

At scale, the serverless model is replaced with **stateless persistent containers** deployed across multiple cloud availability zones or edge regions, backed by a **sharded Redis cluster** and **partitioned PostgreSQL**.

```
[ AI Agent Fleets (Global) ] ──> [ Anycast Global Accelerator / Cloudflare ]
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         ▼                                                 ▼
            [ Region 1: US-East (AWS/GCP) ]                   [ Region 2: EU-West (AWS/GCP) ]
        ┌───────────────────────────────────────┐         ┌───────────────────────────────────────┐
        │  NLB (Network Load Balancer)          │         │  NLB (Network Load Balancer)          │
        │                  │                    │         │                  │                    │
        │  ┌───────────────┴───────────────┐    │         │  ┌───────────────┴───────────────┐    │
        │  ▼                               ▼    │         │  ▼                               ▼    │
        │ [Fastify Proxy Pod 1..N] (ECS)        │         │ [Fastify Proxy Pod 1..N] (ECS)        │
        │  ├── In-Memory AST Policy Cache       │         │  ├── In-Memory AST Policy Cache       │
        │  ├── Local SHA-256 Auth Ring Cache    │         │  ├── Local SHA-256 Auth Ring Cache    │
        │  └── Non-blocking BullMQ Redis Push   │         │  └── Non-blocking BullMQ Redis Push   │
        └──────────────────┬────────────────────┘         └──────────────────┬────────────────────┘
                           │                                                 │
                           ▼                                                 ▼
             [ Redis Cluster (ElastiCache) ]                   [ Redis Cluster (ElastiCache) ]
             (Sharded Ingestion Queues)                        (Sharded Ingestion Queues)
                           │                                                 │
                           ▼                                                 ▼
             [ Log Consumer Workers (1..M) ]                   [ Log Consumer Workers (1..M) ]
             (Batch Inserts & Hash Chaining)                   (Batch Inserts & Hash Chaining)
                           │                                                 │
                           └────────────────────────┬────────────────────────┘
                                                    ▼
                                  [ AWS RDS Aurora PostgreSQL ]
                                  (PgBouncer Connection Pooling)
                                  ├── Writer Node (US-East)
                                  ├── Read Replica (EU-West)
                                  └── Partitioned execution_logs (By Month)
```

---

## 2. Component-by-Component Scale & Capacity Limits

### 1. Fastify Proxy Ingestion Tier (`apps/proxy`)

| Dimension | Single Node Capacity | Cluster Capacity (20 Nodes) | Bottleneck & Mitigation |
| :--- | :--- | :--- | :--- |
| **Throughput (RPS)** | 5,500 – 7,200 RPS | 100,000+ RPS | Event-loop block. Mitigated by pure synchronous AST and zero hot-path I/O. |
| **Memory Footprint** | 180MB baseline | 3.6GB total | Memory leak in key cache. Mitigated by strict LRU pruning (max 50,000 keys). |
| **CPU Utilization** | $\approx 0.15\text{ms}$ CPU time/req | $\le 65\%$ at 100k RPS | Horizontal Pod Autoscaler (HPA) targeting 70% CPU. |
| **Network Sockets** | 10,000 concurrent sockets | 200,000 sockets | Ephemeral port exhaustion. Mitigated by HTTP keep-alive downstream. |

#### Distributed In-Memory Cache Invalidation:
In a 20-node cluster, when an administrator updates a policy in the Next.js dashboard:
- The Web tier publishes an invalidation event to Redis Pub/Sub: `x4g4t:cache:invalidate`.
- All 20 proxy nodes subscribe to the channel and immediately evict their local compiled policy AST in $<2\text{ms}$, avoiding stale policy evaluation.

---

### 2. Redis & Asynchronous Telemetry Tier (`BullMQ`)

At 100,000 RPS, persisting audit logs directly to PostgreSQL would require 100,000 DB writes per second, crashing any relational database. BullMQ buffers and batches these writes.

| Metric | Target / Limit | Engineering Strategy |
| :--- | :--- | :--- |
| **Queue Ingestion Rate** | 100,000 jobs/sec | Redis pipeline `LPUSH` commands; $<1.5\text{ms}$ per batch. |
| **Redis Memory Sizing** | 32GB Cluster (3 nodes) | Payloads are sanitized strings; TTL of completed jobs capped at 1 hour. |
| **Batch Worker Draining**| 500 records per DB write | Log consumer workers read 500 items per tick and execute multi-row `INSERT`. |
| **Worker Scaling** | 1 worker per 5,000 RPS | 20 worker instances drain 100k RPS with zero queue backlog. |

---

### 3. PostgreSQL Database & Storage Scaling

#### Table Partitioning on `execution_logs`
At 100,000 RPS, the system generates $8.64\text{ billion}$ records per day.
To prevent B-Tree index degradation:
- `execution_logs` is partitioned by range on `created_at` (Monthly partitions).
- Queries for the live dashboard stream only scan the active month's partition.
- Dropping expired logs under **GDPR Art. 5(1)(e)** is an instantaneous `DROP TABLE execution_logs_2026_01` rather than a costly `DELETE` query with vacuum overhead.

```sql
-- Production Monthly Partitioning
CREATE TABLE execution_logs (
    id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments JSONB NOT NULL,
    verdict log_verdict NOT NULL,
    triggered_policy_id TEXT,
    latency_ms INTEGER NOT NULL,
    previous_record_hash TEXT,
    record_hash TEXT,
    is_pii_redacted TEXT DEFAULT 'true' NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE execution_logs_2026_09 PARTITION OF execution_logs
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
```

#### Connection Pooling via PgBouncer / RDS Proxy
- 20 Proxy instances + 20 Worker instances = thousands of concurrent database connections.
- **PgBouncer** is deployed in `transaction` pooling mode, capping active PostgreSQL connections to 100 on the database engine.

---

## 3. High-Traffic Latency Breakdown

```
Hot Path Breakdown at 100,000 RPS:
┌────────────────────────────────────────────────────────┐
│ Inbound Socket & TLS Termination:       1.2ms          │
│ In-Memory SHA-256 Key Cache Hit:        0.3ms          │
│ In-Memory Pure AST Policy Evaluation:   0.005ms (5µs)  │
│ Non-Blocking Redis Queue LPUSH:         1.8ms          │
│ Total X4G4T Firewall Overhead:       3.305ms        │
│ Downstream Target API (Stripe, etc):   45.0ms          │
│ Total Round-Trip Time:                 48.305ms        │
└────────────────────────────────────────────────────────┘
```
**Conclusion:** X4G4T adds only **$\approx 3.3\text{ms}$** of overhead, remaining well within the **$<15\text{ms}$** enterprise SLA even under peak load.

---

## 4. Auto-Scaling & Disaster Recovery Architecture

### Horizontal Pod Autoscaling (HPA) Formula
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: x4g4t-proxy-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: x4g4t-proxy
  minReplicas: 4
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: 4000
```

### High-Availability Failover Plan
1. **Multi-AZ Redis:** Primary with automatic failover to read replica in $<15\text{ seconds}$.
2. **PostgreSQL Multi-AZ:** Automated failover to standby replica with zero data loss ($RPO = 0$, $RTO < 30\text{s}$).
3. **Fail-Closed Guarantee:** If Redis or the database is temporarily unreachable, the Proxy continues evaluating guardrails using in-memory cached policies. If in-memory state cannot be validated, tool execution **fails closed** to prevent unauthorized mutations.

