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

### 3. Elasticsearch 8+ Enterprise Ingestion & ILM Architecture

To ingest and search millions of audit logs without indexing lag or memory exhaustion, Elasticsearch 8+ is deployed in a dedicated **Hot-Warm-Cold tiering topology**:

```
[ BullMQ / Vector / Log Consumer ]
                │
                ▼ (Bulk Indexing: 1,000 docs/batch)
┌────────────────────────────────────────────────────────┐
│ HOT TIER: High-Ingest Data Nodes (3-6 Nodes)           │
│ • Local NVMe SSD Storage (10,000+ IOPS)                │
│ • JVM Heap: 31 GB (Compressed OOPs boundary)           │
│ • Host RAM: 64 GB (50% OS filesystem cache)            │
│ • Index Buffer: 20% RAM (indices.memory.index_buffer)  │
│ • Refresh Interval: 30s (prevents merge starvation)    │
│ • Shard Sizing: 30 - 50 GB per primary shard           │
└──────────────────────────┬─────────────────────────────┘
                           │ (ILM Transition at 50GB or 7 Days)
                           ▼
┌────────────────────────────────────────────────────────┐
│ WARM TIER: Query & Forensic Nodes (2-4 Nodes)          │
│ • High-Density EBS / SSD Storage                       │
│ • Shrunk to 1 Replica, Force-Merged to 1 Segment       │
│ • Optimized for Dashboard Filtering & RegEx Searches   │
└──────────────────────────┬─────────────────────────────┘
                           │ (ILM Transition at 30 Days)
                           ▼
┌────────────────────────────────────────────────────────┐
│ COLD / FROZEN TIER: Long-Term Archive (S3 / GCS)       │
│ • Searchable Snapshots mounted directly from Cloud     │
│ • Retained until organization's retention_days window  │
│ • Automated Deletion under GDPR Art. 5(1)(e)           │
└────────────────────────────────────────────────────────┘
```

#### Elasticsearch Production Tuning Invariants:
1. **JVM Heap Cap:** Never exceed 31 GB (`-Xms31g -Xmx31g`). Allocating 32GB+ causes the JVM to drop 32-bit Compressed Object Pointers (OOPs), halving effective heap efficiency.
2. **Asynchronous Translog:** Configure `index.translog.durability: async` and `index.translog.sync_interval: 10s` for high-throughput bulk streams.
3. **Cluster Quorum:** Deploy 3 dedicated Master-Eligible nodes (`node.roles: [master]`) separate from data nodes to eliminate split-brain risk and GC stalls.

---

### 4. Redis Enterprise & Sharded Cluster Topology

Redis serves as both the ultra-fast atomic state store (kill switch, rate limits) and the Pub/Sub bus.

| Parameter | Recommended Setting | Architectural Rationale |
| :--- | :--- | :--- |
| **Topology** | 6-Node Redis Cluster (3 Primary, 3 Replica) | Sharded throughput across slots; zero single point of failure. |
| **Pub/Sub Client Buffer** | `client-output-buffer-limit pubsub 512mb 128mb 60` | Prevents slow proxy subscribers from getting disconnected during broadcast bursts. |
| **Maxmemory Policy** | `volatile-lru` | Protects persistent keys while safely evicting expired rate limit buckets. |
| **Replication Backlog** | `repl-backlog-size 512mb` | Allows temporary network partitions between AZs without full resync. |
| **Persistence** | RDB snapshots every 15m + AOF (`appendfsync everysec`) | Guarantees audit and rate-limit durability. |

---

### 5. Decoupled ML Intelligence Plane at Enterprise Scale

The standalone ML microservice (`x4g4t-ml-service` on port 5001) scales independently from the proxy:
1. **Zero Impact on Ingestion SLA:** The Fastify Proxy (`:4000`) never performs heavy array sorting, quantile estimation, or variance calculation. All ML tasks run in background pods.
2. **Read-Replica Query Routing:** The ML daemon queries PostgreSQL **Read Replicas** for historical execution samples, completely offloading analytical reads from the primary OLTP database.
3. **Horizontal Scaling:** When multiple ML pods are deployed, tenant mining jobs are distributed via Redis distributed locks (`redlock:mine:<org_id>`), ensuring only one pod analyzes a given organization at a time.

---

### 6. Bilateral Emergency Air-Gap Kill Switch at Hyperscale

In a multi-region deployment with hundreds of proxy pods:
1. **Distributed Event Fanout:** When an admin activates the kill switch with 2FA, the Control Plane sets `killswitch:org:<org_id>` in the primary Redis cluster and broadcasts `killswitch:invalidation` across all regions.
2. **Sub-Millisecond Pod Severance:** Every proxy pod's local Redis subscriber receives the message and flips an in-memory atomic boolean in $<1\mu\text{s}$.
3. **Zero Outbound Traffic:** Ingress requests immediately receive HTTP 503 `EMERGENCY_KILL_SWITCH_ACTIVE`, while pending outbound sockets to upstream models are forcefully destroyed with `socket.destroy()`.

---

## 3. High-Traffic Latency Breakdown

```
Hot Path Breakdown at 100,000 RPS:
┌────────────────────────────────────────────────────────┐
│ Inbound Socket & TLS Termination:       1.2ms          │
│ In-Memory SHA-256 Key Cache Hit:        0.3ms          │
│ In-Memory Pure AST Policy Evaluation:   0.005ms (5µs)  │
│ In-Flight Streaming DLP Scrubbing:      0.8ms          │
│ Non-Blocking Redis Queue LPUSH:         1.0ms          │
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
3. **Elasticsearch Auto-Rebalance:** Shard reallocation across healthy data nodes upon node failure with zero downtime.
4. **Fail-Closed Guarantee:** If Redis or the database is temporarily unreachable, the Proxy continues evaluating guardrails using in-memory cached policies. If in-memory state cannot be validated, tool execution **fails closed** to prevent unauthorized mutations.

