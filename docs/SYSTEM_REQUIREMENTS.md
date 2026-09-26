# X4G4T: System Requirements & Infrastructure Sizing Specification

This document provides the definitive engineering specifications for provisioning, deploying, and operating **X4G4T** across development, medium enterprise, and high-throughput multi-region production environments.

---

## 1. Architectural Overview & Latency SLA Budgets

X4G4T is architected as a **3-plane decoupled topology**:

```
+------------------------------------------------------------------------------------+
|                                    CONTROL PLANE                                   |
|               Next.js 15 App Router Console & REST API (Port 3000)                 |
|             RBAC Management • Policy Authoring • System Health Console             |
+------------------------------------------+-----------------------------------------+
                                           |
                                           v
+------------------------------------------------------------------------------------+
|                                     DATA PLANE                                     |
|                       Fastify Zero-Latency Proxy (Port 4000)                       |
|           Hot-Path AST Policy Enforcement • In-Flight DLP • MCP Router             |
|                 In-Memory Atomic Kill Switch • Redis Pub/Sub Hook                  |
+--------------------+-------------------------------------+-------------------------+
                     |                                     |
                     v (Async Fire-and-Forget)             v
+-----------------------------------------+   +--------------------------------------+
|              STORAGE PLANE              |   |          INTELLIGENCE PLANE          |
|  PostgreSQL 15+ (Relational / Config)   |   |   Fastify ML Mining Daemon (Port 5001)  |
|  Redis 7+ (Pub/Sub / Atomic Hot State)  |   |   Rolling Outlier Baselines (P99 x 1.15) |
|  Elasticsearch 8+ (Immutable Audits)    |   |   Policy Synthesis & Drift Analytics |
+-----------------------------------------+   +--------------------------------------+
```

### SLA Latency Budgets

| Execution Phase | Target (P50) | Target (P90) | Target (P99) | SLA Ceiling |
| :--- | :--- | :--- | :--- | :--- |
| **Kill Switch Atomic Check** | $<0.001\text{ms}$ | $<0.002\text{ms}$ | $<0.005\text{ms}$ | $0.1\text{ms}$ |
| **In-Memory AST Evaluation** | $0.05\text{ms}$ | $0.12\text{ms}$ | $0.25\text{ms}$ | $1.0\text{ms}$ |
| **In-Flight DLP Scrubbing** | $0.4\text{ms}$ | $0.9\text{ms}$ | $1.8\text{ms}$ | $3.5\text{ms}$ |
| **Proxy Gateway Overhead** | $0.8\text{ms}$ | $1.5\text{ms}$ | $2.5\text{ms}$ | $5.0\text{ms}$ |
| **End-to-End Proxy Pass-Through** | $2.5\text{ms}$ | $5.8\text{ms}$ | $11.2\text{ms}$ | $<15.0\text{ms}$ |

---

## 2. Infrastructure Sizing Matrix Across Deployment Tiers

| Component | Tier 1: Local Dev / Edge | Tier 2: Mid-Enterprise (<5k req/s) | Tier 3: High-Throughput (>50k req/s) |
| :--- | :--- | :--- | :--- |
| **Concurrent Agents** | $1 - 10$ | $50 - 500$ | $1,000 - 10,000+$ |
| **Proxy Instances (`:4000`)** | 1 process (Embedded) | 3 Replicas (HA Cluster) | 12 - 24 Replicas (Auto-scaled) |
| **Proxy vCPU / RAM** | 1 vCPU / 512 MB | 2 vCPU / 2 GB per pod | 4 vCPU / 4 GB per pod |
| **ML Service (`:5001`)** | Co-located Node process | 1 Replica (1 vCPU, 2 GB) | 2 Replicas (2 vCPU, 4 GB) |
| **Web Console (`:3000`)** | 1 process | 2 Replicas (1 vCPU, 1 GB) | 4 Replicas (2 vCPU, 2 GB) |
| **Redis 7+ Topology** | Single container (128 MB) | Sentinel / AWS ElastiCache (2 GB) | Redis Cluster (Sharded, 8+ GB) |
| **PostgreSQL 15+** | Single container (512 MB) | RDS / HA Replica (2 vCPU, 8 GB) | Multi-AZ Primary + 3 Read Replicas (32 GB) |
| **Elasticsearch 8+** | Single container (1 GB Heap) | 3-Node Cluster (8 GB Heap each) | Hot-Warm Tier (16 GB Heap each, NVMe) |
| **Total Cluster Memory** | $\ge 4\text{ GB}$ | $\ge 32\text{ GB}$ | $\ge 128\text{ GB}$ |
| **Minimum Storage IOPS** | 500 IOPS | 3,000 IOPS (gp3) | 10,000+ IOPS (io2 / Local NVMe) |
| **Network Interface (NIC)** | 1 Gbps | 10 Gbps Enhanced Networking | 25 - 100 Gbps (AWS ENA / GCP Tier 1) |

---

## 3. Detailed Component Sizing & Memory Allocations

### 1. Data Plane Proxy (`apps/proxy` on `:4000`)
- **Runtime:** Node.js 20+ LTS or 22 LTS with Fastify 5.x.
- **Node Memory Flags:** `--max-old-space-size=1536` (Tier 2) or `--max-old-space-size=3072` (Tier 3).
- **Concurrency & Threads:** Single Node.js event loop per container replica. Multiple replicas run in Kubernetes Pods behind an ingress controller (Envoy, Traefik, or AWS ALB) with round-robin or least-request routing.
- **Resource Requests & Limits (Kubernetes):**
  ```yaml
  resources:
    requests:
      cpu: "1000m"
      memory: "1024Mi"
    limits:
      cpu: "2000m"
      memory: "2048Mi"
  ```

### 2. Intelligence Plane ML Microservice (`apps/proxy/src/ml-server.ts` on `:5001`)
- **Runtime:** Standalone Node.js daemon.
- **Memory Flags:** `--max-old-space-size=2048`.
- **Workload Profile:** CPU-bound during periodic log-mining passes (every 5 to 15 minutes). Completely decoupled from the proxy event loop to prevent P99 proxy latency spikes.
- **Resource Requests & Limits:**
  ```yaml
  resources:
    requests:
      cpu: "500m"
      memory: "1024Mi"
    limits:
      cpu: "2000m"
      memory: "4096Mi"
  ```

### 3. Redis 7+ Cache & Pub/Sub Bus
- **Memory Footprint:** 
  - Kill Switch keys: $<1\text{ KB}$
  - API Key hash cache (5-min TTL): $\sim 150\text{ bytes} \times 10,000\text{ keys} \approx 1.5\text{ MB}$
  - BullMQ stream buffer: $200 - 500\text{ MB}$
- **Eviction Policy:** `volatile-lru` or `noeviction` for critical queues.
- **Persistence:** RDB snapshots enabled for disaster recovery; AOF set to `appendfsync everysec`.

### 4. PostgreSQL 15+ (Relational Configuration Plane)
- **Connections:** Fastify Proxy pools $\le 10$ connections per replica; Web Console pools $\le 10$ connections per replica. Use PgBouncer in transaction mode when total replicas exceed 20.
- **Tuning Parameters:**
  ```ini
  shared_buffers = 2GB              # 25% of total system RAM
  effective_cache_size = 6GB        # 75% of total system RAM
  maintenance_work_mem = 512MB
  work_mem = 16MB
  wal_buffers = 16MB
  max_connections = 200
  checkpoint_completion_target = 0.9
  ```

### 5. Elasticsearch 8+ (Audit Ledger & Analytics)
- **JVM Heap Allocation:** Set `ES_JAVA_OPTS="-Xms8g -Xmx8g"` (never allocate more than 31 GB or 50% of host RAM to maintain Compressed Object Pointers).
- **Index Lifecycle Management (ILM):**
  - **Hot Phase:** 0 - 7 days (Primary SSD, fast ingest).
  - **Warm Phase:** 8 - 30 days (Read-only, shrink shards).
  - **Cold / Delete Phase:** Purged at $N$ days as specified in `organizations.retention_days`.

---

## 4. Linux Kernel & Operating System Tuning

For bare-metal and high-performance Kubernetes worker nodes running the proxy:

```ini
# /etc/sysctl.d/99-x4g4t.conf

# Maximum open file descriptors
fs.file-max = 2097152

# Socket listen queue backlog
net.core.somaxconn = 65535

# TCP connection backlog
net.ipv4.tcp_max_syn_backlog = 65535

# Fast socket reuse
net.ipv4.tcp_tw_reuse = 1

# TCP buffer sizing (min, default, max)
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Increase maximum network packet backlog
net.core.netdev_max_backlog = 100000
```

### Process Limits (`/etc/security/limits.d/99-x4g4t.conf`):
```ini
* soft nofile 65536
* hard nofile 65536
* soft nproc  65536
* hard nproc  65536
```

---

## 5. Network Connectivity & Security Perimeter

1. **Ingress Invariants:**
   - HTTPS / TLS 1.3 terminated at edge ingress (Cloudflare, AWS ALB, Envoy).
   - Ingress to Fastify Proxy `:4000`: HTTP/1.1 and HTTP/2 supported.
   - Internal traffic to ML Microservice `:5001` restricted to VPC private subnet.
2. **Egress Invariants:**
   - Proxy requires outbound TCP/443 connectivity to external LLM providers (e.g. `api.openai.com`, `api.anthropic.com`) unless in sovereign air-gapped mode.
   - Outbound internal TCP access to on-premises Ollama (`:11434`) and vLLM (`:8000`) clusters.
3. **Emergency Air-Gap Severance:**
   - In the event of a triggered kill switch, all socket connections to outbound endpoints are dropped in $<1\text{ms}$.

