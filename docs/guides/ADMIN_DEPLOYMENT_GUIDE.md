# X4G4T: Administrator & Infrastructure Deployment Guide

This guide provides step-by-step instructions for DevOps, SREs, and Platform Engineers to deploy, configure, and maintain **X4G4T** across all major cloud providers and on-premises/air-gapped environments:

1. [Architecture Overview & Prerequisites](#1-architecture-overview--prerequisites)
2. [Hardware Specifications, Sizing Matrix & Traffic Capacity](#2-hardware-specifications-sizing-matrix--traffic-capacity)
3. [Environment Configuration Matrix](#3-environment-configuration-matrix)
4. [Deploying to Vercel (Control Plane UI)](#4-deploying-to-vercel-control-plane-ui)
5. [Deploying to AWS (ECS Fargate + RDS + ElastiCache)](#5-deploying-to-aws-ecs-fargate--rds--elasticache)
6. [Deploying to Google Cloud Platform (GCP Cloud Run + Cloud SQL)](#6-deploying-to-google-cloud-platform-gcp-cloud-run--cloud-sql)
7. [Deploying to Microsoft Azure (Container Apps + Azure Database for PostgreSQL)](#7-deploying-to-microsoft-azure-container-apps--azure-database-for-postgresql)
8. [Deploying In-House / On-Premises / Air-Gapped (Docker Compose & Kubernetes)](#8-deploying-in-house--on-premises--air-gapped)
9. [Comprehensive Scaling Guide (Horizontal, Vertical & OS Tuning)](#9-comprehensive-scaling-guide-horizontal-vertical--os-tuning)
10. [Zero-Downtime Upgrades, Monitoring & Health Checks](#10-zero-downtime-upgrades-monitoring--health-checks)
11. [Operational Safety Mechanisms & Admin Procedures](#11-operational-safety-mechanisms--admin-procedures)

---

## 1. Architecture Overview & Prerequisites

X4G4T comprises four primary components:
1. **Proxy Ingestion Gateway (`apps/proxy`):** Stateless, low-latency Fastify v4 HTTP & MCP server listening on port `4000`.
2. **Background Log & HITL Worker (`apps/proxy/src/workers/log-consumer.ts`):** BullMQ worker processing audit logs, computing ISO 27001 hash chains, and sending Slack Block Kit alerts.
3. **Control Plane & UI (`apps/web`):** Next.js 15 App Router application listening on port `3000`.
4. **Data Infrastructure:**
   - **PostgreSQL (15+):** Relational state, tenant isolation, policies, audit hash chains.
   - **Redis (6.2+):** High-throughput queue for asynchronous telemetry and rate limiting.

```
                  ┌────────────────────────────────────────┐
                  │          Internet / Ingress            │
                  └───────────────────┬────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │ Next.js Web UI (:3000)    │             │ Fastify Proxy (:4000)     │
   │ (Vercel / Container)      │             │ (ECS / Cloud Run / K8s)   │
   └─────────────┬─────────────┘             └─────────────┬─────────────┘
                 │                                         │
                 │                                         ▼
                 │                           ┌───────────────────────────┐
                 │                           │ BullMQ Redis Queue        │
                 │                           └─────────────┬─────────────┘
                 │                                         │
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │ PostgreSQL (Neon/RDS/SQL) │ <────────── │ Log Consumer Worker       │
   └───────────────────────────┘             └───────────────────────────┘
```

---

## 2. Hardware Specifications, Sizing Matrix & Traffic Capacity

X4G4T is engineered for ultra-low latency ($<15\text{ms}$ end-to-end gateway overhead, $<0.15\,\mu\text{s}$ pure policy AST evaluation). To achieve peak throughput and prevent thread starvation or socket exhaustion, select the hardware profile matching your expected traffic profile:

### 2.1 Sizing & Resource Recommendation Matrix

| Tier | Target Workload | Sustained Traffic (RPS) | Peak Burst (RPS) | Fastify Proxy (`apps/proxy`) | Web Dashboard (`apps/web`) | Redis / ElastiCache | PostgreSQL / Aurora |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Dev / Sandbox / POC** | Internal testing, single agent prototypes | 1 – 250 RPS | 500 RPS | **1 Container / Pod**<br>0.5 vCPU, 512MB RAM | **1 Pod / Vercel**<br>0.5 vCPU, 512MB RAM | 1 Node (Standalone)<br>512MB RAM (Redis 7) | 1 Node (Shared/Neon)<br>1 vCPU, 2GB RAM |
| **Tier 2: Production Standard** | Mid-market SaaS, 10–50 concurrent agents | 500 – 3,000 RPS | 5,000 RPS | **2–4 Pods (HPA)**<br>1 vCPU, 1GB RAM per pod | **2 Pods / Vercel**<br>1 vCPU, 1GB RAM | 2 Nodes (Primary/Replica)<br>2GB RAM (`cache.t4g.small`) | RDS `db.m6g.large`<br>2 vCPU, 8GB RAM, 1000 IOPS |
| **Tier 3: Enterprise High-Throughput** | Multi-team fleets, 50–500 autonomous agents | 3,000 – 25,000 RPS | 40,000 RPS | **6–12 Pods (HPA)**<br>2 vCPU, 2GB RAM per pod | **4 Pods (HPA)**<br>2 vCPU, 2GB RAM | 3-Node Cluster Sharded<br>6GB RAM (`cache.m6g.large`) | Aurora `db.r6g.xlarge`<br>4 vCPU, 32GB RAM, 3000 IOPS |
| **Tier 4: Hyperscale / Financial-Grade** | Global AI agent mesh, 1000+ parallel agents | 25,000 – 100,000+ RPS | 150,000+ RPS | **20–40 Pods (Multi-AZ/Region)**<br>4 vCPU, 4GB RAM per pod | **8–12 Pods (Multi-AZ)**<br>4 vCPU, 4GB RAM | 6-Node Redis Cluster<br>16GB RAM (`cache.r6g.xlarge`) | Aurora Multi-AZ `db.r6g.4xlarge`<br>16 vCPU, 128GB RAM, 10k IOPS |

---

### 2.2 Component Resource Breakdown & Performance Limits

#### 1. Fastify Proxy Ingestion Gateway (`apps/proxy`)
- **Single Container Capacity:**
  - **1 vCPU + 1GB RAM:** Delivers **5,500 – 7,200 RPS** with P50 latency of **0.059ms** and P99 latency of **1.11ms**.
  - **2 vCPU + 2GB RAM:** Delivers **12,000 – 15,000 RPS** when utilizing Node.js cluster mode (2 worker processes).
- **Memory Allocation:**
  - Baseline idle memory: ~120MB – 180MB.
  - Active traffic footprint: ~350MB – 650MB with 50,000 cached API keys and 500 compiled policy ASTs in memory.
  - Set Node.js garbage collection target: `--max-old-space-size=1536` for 2GB containers.
- **Concurrent TCP Connections:**
  - Standard container: 10,000 simultaneous keep-alive agent sockets.
  - Tune Linux socket limits (`somaxconn=65535`, `ulimit -n 65536`).

#### 2. Control Plane UI & Administration (`apps/web`)
- **Resource Footprint:**
  - Next.js 15 App Router server-side rendering and Server Actions.
  - Typically requires 0.5 – 1 vCPU and 512MB – 1GB RAM per container.
  - Traffic: Low to moderate (primarily administrative sessions, policy management, HITL approvals, and dashboard telemetry viewing).

#### 3. Background Log & HITL Consumer Worker (`apps/proxy/src/workers/log-consumer.ts`)
- **Resource Footprint:**
  - Consumes jobs from Redis `audit-logs` queue in configurable batches (default: 500 records/batch).
  - 1 vCPU + 1GB RAM worker processes **10,000 – 15,000 log records/second**.
  - Scales linearly by increasing worker replica count (1 worker per 5,000 – 10,000 RPS).

#### 4. Redis Queue & Cache Layer
- **Memory Sizing Formula:**
  $$\text{Redis RAM} = (\text{Peak RPS} \times \text{Average Payload Size (1.5KB)} \times \text{Buffer Duration (60s)}) \times 2.0 \text{ (Overhead)}$$
  - At 10,000 RPS: $10,000 \times 1.5\text{KB} \times 60\text{s} = 900\text{MB} \times 2.0 \approx \mathbf{1.8\text{GB RAM}}$.
  - At 100,000 RPS: $\approx \mathbf{18\text{GB RAM}}$ (Recommended: 32GB cluster).

#### 5. PostgreSQL Database
- **Connection Sizing:**
  - Always deploy **PgBouncer** or connection pooling (Neon pooler / AWS RDS Proxy) between application containers and PostgreSQL.
  - Proxy nodes use pooled connections (max 10 connections per proxy pod).
- **Storage & IOPS:**
  - Baseline: 100GB SSD (gp3 on AWS) with minimum 3,000 IOPS.
  - High-Scale: Provisioned IOPS (io2) or Aurora Serverless v2 with auto-partitioning on `execution_logs` by month.

---

## 3. Environment Configuration Matrix

The following environment variables are required across environments:

| Variable Name | Required By | Description | Example Value |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | Web, Proxy, Worker | PostgreSQL connection string | `postgres://user:pass@ep-xyz.postgres.database.azure.com:5432/x4g4t?sslmode=require` |
| `REDIS_URL` | Proxy, Worker | Redis connection URL | `redis://default:token@redis-cluster.internal:6379` |
| `PORT` | Proxy | Fastify listening port (default: 4000) | `4000` |
| `IAM_PROVIDER` | Web, Proxy | Active IAM provider (`auto`, `clerk`, `workos`, `oidc`, `cognito`, `azure_ad`, `local`) | `auto` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Web | Clerk Authentication public key | `pk_live_...` |
| `CLERK_SECRET_KEY` | Web | Clerk Authentication secret key | `sk_live_...` |
| `SLACK_HITL_WEBHOOK_URL` | Worker, Proxy | Incoming Slack webhook for HITL cards | `https://hooks.slack.com/services/T.../B.../X...` |
| `SLACK_SIGNING_SECRET` | Web | Slack secret for interactive button webhook | `a1b2c3d4e5f6...` |
| `SMTP_HOST` | Web, Proxy | SMTP server hostname for approval emails | `smtp.sendgrid.net` |
| `SMTP_PORT` | Web, Proxy | SMTP server port (587, 465, 25) | `587` |
| `SMTP_USER` | Web, Proxy | SMTP authentication username | `apikey` |
| `SMTP_PASS` | Web, Proxy | SMTP authentication password/secret | `SG.xxxxxxxx` |
| `ADMIN_EMAIL` | Web, Proxy | Security admin email for approval alerts | `secops@company.com` |
| `ELASTICSEARCH_URL` | Web, Proxy | Elasticsearch cluster endpoint | `https://es-cluster.internal:9200` |
| `ELASTICSEARCH_INDEX` | Web, Proxy | Target index name (default: x4g4t-logs) | `x4g4t-logs` |
| `ELASTICSEARCH_API_KEY` | Web, Proxy | Elasticsearch API Key | `VnVhQ2Z...` |
| `EXTERNAL_LOG_WEBHOOK_URL` | Web, Proxy | Generic SIEM webhook (Datadog, Splunk, Loki) | `https://http-intake.logs.datadoghq.com/...` |
| `NODE_ENV` | All | Application environment | `production` |

### Database Initialization & Bootstrap
Before launching application containers, initialize your PostgreSQL instance (Neon, Amazon RDS, GCP Cloud SQL, Azure Database, or local Postgres) using the automated bootstrap script:
```bash
# Set your target database connection string
export DATABASE_URL="postgres://user:password@host:5432/x4g4t?sslmode=require"

# Run database bootstrap & seed baseline policies
pnpm db:bootstrap
```
The bootstrap script idempotently:
1. Creates custom PostgreSQL enums (`policy_action`, `rule_operator`, `log_verdict`, `hitl_status`).
2. Provisions all 7 relational tables and strategic B-Tree / composite indexes.
3. Seeds default organization (`acme-corp-demo`) and baseline guardrail policies (`BLOCK` refunds $> \$250$, `REQUIRE_APPROVAL` wires $\ge \$10,000$, `BLOCK` destructive SQL).
4. Generates an initial production API key (`sec_live_...`).

---

## 4. Deploying to Vercel (Control Plane UI)

The Next.js 15 dashboard (`apps/web`) is optimized for deployment on Vercel.

### Step-by-Step Instructions:
1. **Import Repository:** Link your Git repository in the Vercel dashboard.
2. **Root Directory:** Set **Root Directory** to `apps/web`.
3. **Build & Development Settings:**
   - **Framework Preset:** Next.js
   - **Build Command:** `pnpm turbo run build --filter=@x4g4t/web...` (or enable Turborepo integration in Vercel).
   - **Install Command:** `pnpm install`
4. **Environment Variables:**
   - Add `DATABASE_URL`
   - Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Add `CLERK_SECRET_KEY`
   - Add `SLACK_SIGNING_SECRET`
5. **Deploy:** Click **Deploy**. Vercel will build the edge/node routes and deploy the dashboard.

---

## 5. Deploying to AWS (ECS Fargate + RDS + ElastiCache)

For high-throughput, low-latency enterprise setups on AWS, deploy the Fastify Proxy container to **Amazon ECS Fargate** behind an Application Load Balancer (ALB).

### 1. Build and Push Container Image to Amazon ECR
```bash
# Authenticate with Amazon ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build the Proxy container using the multi-stage Dockerfile
docker build -t x4g4t-proxy:latest -f apps/proxy/Dockerfile .

# Tag and push
docker tag x4g4t-proxy:latest <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/x4g4t-proxy:latest
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/x4g4t-proxy:latest
```

### 2. Infrastructure Setup
- **Amazon RDS for PostgreSQL:** Provision a Multi-AZ `db.r6g.large` instance.
- **Amazon ElastiCache for Redis:** Provision a 2-node replication group in the same VPC/subnets.
- **AWS Secrets Manager:** Store `DATABASE_URL`, `REDIS_URL`, and `SLACK_HITL_WEBHOOK_URL`.

### 3. ECS Task Definition (`task-definition.json`)
```json
{
  "family": "x4g4t-proxy",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "proxy",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/x4g4t-proxy:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 4000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "4000" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:x4g4t/db" },
        { "name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:x4g4t/redis" },
        { "name": "SLACK_HITL_WEBHOOK_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:<ACCOUNT_ID>:secret:x4g4t/slack" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:4000/healthz || exit 1"],
        "interval": 15,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 10
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/x4g4t-proxy",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 4. Create ECS Service & Target Group
- Create an ALB Target Group with HTTP health check path `/healthz`.
- Register the ECS Fargate service with minimum 2 tasks across multiple Availability Zones.

---

## 6. Deploying to Google Cloud Platform (GCP Cloud Run + Cloud SQL)

Google Cloud Run provides serverless container execution with automatic scaling and zero idle costs.

### 1. Build and Push to Artifact Registry
```bash
# Configure auth
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push
docker build -t us-central1-docker.pkg.dev/<PROJECT_ID>/x4g4t/proxy:latest -f apps/proxy/Dockerfile .
docker push us-central1-docker.pkg.dev/<PROJECT_ID>/x4g4t/proxy:latest
```

### 2. Deploy to Cloud Run
```bash
gcloud run deploy x4g4t-proxy \
  --image=us-central1-docker.pkg.dev/<PROJECT_ID>/x4g4t/proxy:latest \
  --platform=managed \
  --region=us-central1 \
  --port=4000 \
  --min-instances=1 \
  --max-instances=20 \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=250 \
  --timeout=15s \
  --vpc-connector=x4g4t-vpc-connector \
  --set-env-vars=NODE_ENV=production \
  --set-secrets=DATABASE_URL=x4g4t-db-url:latest,REDIS_URL=x4g4t-redis-url:latest,SLACK_HITL_WEBHOOK_URL=x4g4t-slack-url:latest \
  --allow-unauthenticated
```

---

## 7. Deploying to Microsoft Azure (Container Apps + Azure Database for PostgreSQL)

Azure Container Apps (ACA) provides serverless microservices backed by Kubernetes without cluster management overhead.

### 1. Build and Push to Azure Container Registry (ACR)
```bash
az acr login --name <REGISTRY_NAME>

docker build -t <REGISTRY_NAME>.azurecr.io/x4g4t-proxy:latest -f apps/proxy/Dockerfile .
docker push <REGISTRY_NAME>.azurecr.io/x4g4t-proxy:latest
```

### 2. Provision with Azure CLI
```bash
# Create Container App Environment
az containerapp env create \
  --name x4g4t-env \
  --resource-group x4g4t-rg \
  --location eastus

# Deploy Proxy Container App
az containerapp create \
  --name x4g4t-proxy \
  --resource-group x4g4t-rg \
  --environment x4g4t-env \
  --image <REGISTRY_NAME>.azurecr.io/x4g4t-proxy:latest \
  --target-port 4000 \
  --ingress external \
  --min-replicas 2 \
  --max-replicas 15 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --secrets \
  db-url="postgres://user:pass@x4g4t-db.postgres.database.azure.com:5432/x4g4t?sslmode=require" \
  redis-url="redis://:key@x4g4t-redis.redis.cache.windows.net:6380?ssl=true" \
  slack-url="https://hooks.slack.com/services/..." \
  --env-vars \
  NODE_ENV=production \
  PORT=4000 \
  DATABASE_URL=secretref:db-url \
  REDIS_URL=secretref:redis-url \
  SLACK_HITL_WEBHOOK_URL=secretref:slack-url
```

---

## 8. Deploying In-House / On-Premises / Air-Gapped

For defense, banking, healthcare, or sovereign cloud environments requiring complete network isolation and no external SaaS dependencies.

### Production Docker Compose (`docker-compose.prod.yml`)

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: x4g4t
      POSTGRES_USER: x4g4t_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U x4g4t_admin -d x4g4t"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - x4g4t_internal

  redis:
    image: redis:7-alpine
    restart: always
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - x4g4t_internal

  proxy:
    image: x4g4t-proxy:latest
    restart: always
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgres://x4g4t_admin:${DB_PASSWORD}@postgres:5432/x4g4t
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      SLACK_HITL_WEBHOOK_URL: ${SLACK_HITL_WEBHOOK_URL:-}
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - x4g4t_internal
      - x4g4t_public

  web:
    image: x4g4t-web:latest
    restart: always
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://x4g4t_admin:${DB_PASSWORD}@postgres:5432/x4g4t
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - x4g4t_internal
      - x4g4t_public

volumes:
  postgres_data:
  redis_data:

networks:
  x4g4t_internal:
    internal: true
  x4g4t_public:
```

### Kubernetes Manifest (`k8s-deployment.yaml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: x4g4t-proxy
  namespace: x4g4t
  labels:
    app: x4g4t-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: x4g4t-proxy
  template:
    metadata:
      labels:
        app: x4g4t-proxy
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: proxy
        image: x4g4t-proxy:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 4000
        envFrom:
        - secretRef:
            name: x4g4t-secrets
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2048Mi
        livenessProbe:
          httpGet:
            path: /healthz
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /healthz
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: x4g4t-proxy-svc
  namespace: x4g4t
spec:
  selector:
    app: x4g4t-proxy
  ports:
  - port: 80
    targetPort: 4000
  type: ClusterIP
```

---

## 9. Comprehensive Scaling Guide (Horizontal, Vertical & OS Tuning)

### 9.1 Horizontal Scaling Architecture

X4G4T proxy pods are strictly **stateless**. Scaling horizontally from 2 pods to 50+ pods requires zero session affinity or sticky connections:

```
                                  ┌─────────────────────────────┐
                                  │   Application Load Balancer │
                                  │   (AWS ALB / GCP HTTPS LB)  │
                                  └──────────────┬──────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   ▼                             ▼                             ▼
        ┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
        │ Fastify Proxy Pod 1 │       │ Fastify Proxy Pod 2 │       │ Fastify Proxy Pod N │
        │ (1 vCPU, 1GB RAM)   │       │ (1 vCPU, 1GB RAM)   │       │ (1 vCPU, 1GB RAM)   │
        └──────────┬──────────┘       └──────────┬──────────┘       └──────────┬──────────┘
                   │                             │                             │
                   └─────────────────────────────┼─────────────────────────────┘
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │ Redis Cluster (BullMQ)      │
                                  │ ├── Sharded Ingest Queues   │
                                  │ └── Pub/Sub Cache Eviction  │
                                  └─────────────────────────────┘
```

#### 1. Kubernetes Horizontal Pod Autoscaler (HPA) Manifest
Save as `k8s-hpa.yaml`:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: x4g4t-proxy-hpa
  namespace: x4g4t
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: x4g4t-proxy
  minReplicas: 3
  maxReplicas: 30
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

#### 2. Distributed In-Memory Cache Invalidation
When an administrator modifies a policy or engages Global AI Lockdown in the portal:
- The Web tier publishes an invalidation event to Redis: `x4g4t:cache:invalidate`.
- All proxy pods subscribe to `x4g4t:cache:invalidate` and evict their local AST cache in $<2\text{ms}$.
- This guarantees microsecond-level synchronization across 50+ pods without polling or database reads.

---

### 9.2 Vertical Scaling & Node.js Runtime Tuning

When deploying on large multi-core VMs or bare-metal instances (e.g. AWS `c6g.4xlarge` 16 vCPU / 32GB RAM):

#### 1. Node.js Multi-Core Utilization (Cluster / PM2)
Because Node.js executes JavaScript on a single thread, run one Fastify worker process per physical CPU core:
```bash
# Using PM2 to cluster across all available CPU cores
pm2 start dist/index.js --name x4g4t-proxy -i max --max-memory-restart 1800M
```

#### 2. V8 Garbage Collection & Memory Flags
```bash
# Set in container Dockerfile or deployment environment
NODE_OPTIONS="--max-old-space-size=1536 --optimize-for-size --gc-interval=100"
```

#### 3. Linux Kernel & Socket Performance Tuning (`/etc/sysctl.conf`)
High-throughput proxies handling tens of thousands of concurrent agent sockets require Linux kernel parameter adjustments:
```ini
# Increase socket listen backlog for burst traffic
net.core.somaxconn = 65535

# Increase maximum incoming socket backlog
net.core.netdev_max_backlog = 65535

# Enable fast reuse of TIME_WAIT sockets for outbound downstream calls
net.ipv4.tcp_tw_reuse = 1

# Expand ephemeral port range for outgoing proxy connections
net.ipv4.ip_local_port_range = 1024 65535

# Decrease TCP keepalive time to reclaim dead agent sockets faster
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5

# Increase maximum open file descriptors
fs.file-max = 2097152
```
Apply via `sysctl -p`. In Docker/Kubernetes, set `securityContext.sysctls` or via DaemonSet.

#### 4. File Descriptor Limits (`/etc/security/limits.conf`)
```text
* soft nofile 65536
* hard nofile 65536
```

---

## 10. Zero-Downtime Upgrades, Monitoring & Health Checks

### Health Check Endpoints
- **Proxy Liveness & Readiness:** `GET /healthz` returns HTTP 200 `{"status": "ok"}`.
- Response time is $<2\text{ms}$.

### Rolling Updates
Because the Proxy Gateway maintains all policy ASTs and auth tokens in an in-memory TTL cache and streams audit logs asynchronously to Redis, instances are completely stateless:
1. Issue a rolling deployment in Kubernetes/ECS with `maxSurge: 25%` and `maxUnavailable: 0`.
2. New pods immediately begin serving traffic without cold-start warmup delays.
3. Drain terminating instances gracefully with `SIGTERM` (Fastify automatically completes in-flight requests within 10 seconds).

### Prometheus & Observability Metrics

X4G4T exposes standard Prometheus metrics format (`text/plain; version=0.0.4`) across both the Proxy Gateway and the Web Control Plane:

#### Endpoints
- **Proxy Gateway:** `GET http://<proxy-host>:4000/metrics`
- **Web Control Plane:** `GET http://<web-host>:3000/api/metrics`

#### Exposed Metrics Catalog
| Metric Name | Type | Description |
| :--- | :--- | :--- |
| `http_requests_total{method, route, status}` | Counter | Total number of HTTP requests processed by gateway |
| `http_request_duration_seconds` | Histogram | Total round-trip latency of HTTP requests in seconds |
| `policy_evaluation_duration_seconds` | Histogram | In-memory AST guardrail evaluation latency in seconds |
| `downstream_forward_duration_seconds` | Histogram | Outbound downstream LLM/target forward latency in seconds |
| `hitl_requests_total` | Counter | Total number of Human-in-the-Loop holds triggered |
| `x4g4t_global_ai_lockdown_active` | Gauge | Emergency kill-switch state (1 = active/blocked, 0 = operational) |
| `x4g4t_policy_freeze_active` | Gauge | Policy editing freeze state (1 = frozen, 0 = editable) |
| `process_uptime_seconds` | Gauge | Node.js process uptime in seconds |
| `process_resident_memory_bytes` | Gauge | Process resident memory size (RSS) in bytes |
| `process_heap_used_bytes` | Gauge | V8 heap memory consumed in bytes |

#### Prometheus Scrape Configuration (`prometheus.yml`)
```yaml
scrape_configs:
  - job_name: "x4g4t-proxy"
    scrape_interval: 10s
    scrape_timeout: 5s
    static_configs:
      - targets: ["x4g4t-proxy.internal:4000"]
    metrics_path: "/metrics"

  - job_name: "x4g4t-web"
    scrape_interval: 30s
    scrape_timeout: 10s
    static_configs:
      - targets: ["x4g4t-web.internal:3000"]
    metrics_path: "/api/metrics"
```

---

## 11. Operational Safety Mechanisms & Admin Procedures

### 11.1 Emergency Global AI Lockdown Kill-Switch
The Global AI Lockdown is a fail-safe circuit breaker that immediately halts all autonomous agent tool executions and LLM proxy requests across the enterprise:
- **How to Engage:** In the Admin Portal, navigate to **Guardrail Policies** and click **"Engage Emergency Lockdown"**, or call `toggleGlobalAiLockdownAction(true, reason)`.
- **Gateway Behavior:** All incoming requests to `/v1/gateway/execute` (both Fastify proxy on :4000 and Next.js serverless route on :3000) are rejected in $<0.1\text{ms}$ with `HTTP 503 Service Unavailable` (`AI_LOCKDOWN_ACTIVE`).
- **Telemetry:** The gauge `x4g4t_global_ai_lockdown_active` switches to `1`. Blocked requests are audited to Elasticsearch.
- **How to Disengage:** Click **"Deactivate Lockdown"** in the portal to instantly restore normal gateway processing without restarting containers.

### 11.2 Policy Edit Freeze Mode (SecOps Configuration Lock)
During scheduled maintenance windows, system upgrades, or compliance audits (e.g. SOC2, ISO 27001):
- **How to Freeze:** Navigate to **Guardrail Policies** and click **"Freeze Policy Editing"**, or call `togglePolicyFreezeAction(true, reason)`.
- **System Behavior:** All policy modifications, rule additions, toggles, and library deployments are blocked (returns `HTTP 423 Locked`). Existing guardrails continue enforcing runtime traffic normally.
- **Telemetry:** The gauge `x4g4t_policy_freeze_active` switches to `1`.

### 11.3 Developer Support & Exemption Requests
To maintain strict Separation of Duties while preventing developer friction:
- Developers cannot configure LLMs or approve/reject HITL holds.
- Developers can navigate to **Approvals -> Support & Exemption Requests** and click **"Raise Support Request"** to submit a ticket for tool access, policy exemptions, model whitelisting, or quota increases.
- SecOps Administrators review pending requests in the portal and resolve them (`APPROVED` or `DECLINED`) with reviewer audit notes.

### 11.4 Production Hardening Checklist & Vulnerability Mitigation

Before deploying X4G4T into customer-facing or mission-critical production environments, verify that each hardening control is active:

| Category | Security Control | Configuration | Verification |
| :--- | :--- | :--- | :--- |
| **SSRF Defense** | Block Cloud IMDS (`169.254.169.254`, `metadata.google.internal`) & Private Subnets | `ALLOW_LOCAL_DOWNSTREAM=false`<br>`NODE_ENV=production` | Test with `http://169.254.169.254/latest/meta-data` & expect HTTP `400 (SSRF_BLOCKED)`. |
| **IAM Anti-Spoofing** | Reject untrusted client headers (`X-IAM-Roles`, `X-IAM-Groups`, `X-IAM-User-Id`) | Enforced by default in proxy gateway & serverless routes. | Pass `X-IAM-Roles: admin` with standard API key; confirm roles remain unescalated. |
| **JWT Verification** | Enforce HMAC-SHA256 signature checks on IAM session tokens | `ENFORCE_JWT_SIGNATURE=true`<br>`IAM_JWT_SECRET=<strong-64char-secret>` | Unsigned or tampered tokens return HTTP `401 (INVALID_IAM_TOKEN)`. |
| **Policy Engine** | Enforce Deny-Always-Wins semantics (`BLOCK` > `REQUIRE_APPROVAL` > `ALLOW`) | Built into AST policy evaluator. | Conflicting policies resolve to highest restriction. |
| **Key Vaulting** | Zero-Trust Key Substitution at proxy boundary | Configure provider keys via Admin Portal Vault; keys are masked in UI and injected at gateway. | Verify developer API keys (`sec_live_...`) are stripped and replaced with provider master key. |
| **HITL Loop** | Polling Resolution for Held Tool Executions | Admin approval executes tool downstream and caches response for `GET /v1/gateway/hitl/:holdId`. | Polling returns HTTP `200` with `{ "status": "APPROVED", "response": { ... } }`. |
| **Workspace Scope** | Shared Enterprise Organization Scoping | Set `ENTERPRISE_ORG_SLUG=enterprise-corp` or `DEFAULT_ORG_SLUG=enterprise-corp`. | Admins and developers access identical policies and keys. |
| **ReDoS Guard** | Input length caps on regex evaluation ($<512$ pattern, $<10,000$ string) | Built into regex operator. | Malicious backtracking regexes fail closed safely. |
| **Sign-Up Policy** | Self-Registration Strictly Disabled | Enforced across middleware and UI. | Any `/sign-up` request is redirected to `/sign-in`. Public sign-up is permanently disabled. |

### 11.5 Enterprise IAM Identity Provisioning & Strict Sign-Up Disabled Policy

X4G4T strictly functions as an **authentication consumer** and **inline policy firewall**, not an Identity Provider (IDP).
- **No Self-Registration**: Public sign-up (`/sign-up`) is permanently disabled by design.
- **Enterprise Provisioning**: User accounts, roles (`admin` vs `developer`), and group memberships are centrally provisioned via corporate IAM (Clerk, WorkOS, OIDC, AWS Cognito, Azure AD) or SCIM directory sync.
- **Middleware & UI Enforcement**: Any attempt to access `/sign-up` is automatically redirected to `/sign-in`. All sign-up actions and links are hidden from authentication cards.



