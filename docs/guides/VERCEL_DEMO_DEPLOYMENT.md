# X4G4T: Complete Vercel Free-Tier Demo Deployment Guide
### Zero-Redis, Serverless Architecture with `@vercel/functions` & Neon PostgreSQL

This guide provides step-by-step instructions to deploy a fully functional **X4G4T evaluation demo** completely on **Vercel's Free Hobby Tier** paired with **Neon Serverless PostgreSQL** and **Clerk**, requiring **zero Redis or BullMQ infrastructure**.

---

## 1. Overview: How the Serverless Demo Works

In production, X4G4T uses a persistent Fastify container with Redis and BullMQ to achieve $<15\text{ms}$ latency and handle high-throughput agent loops. 

For **proof-of-concept (POC) demos, client walkthroughs, and developer evaluation**, you can run the entire platform within a single Next.js 15 application deployed on Vercel:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Vercel Serverless Architecture (Hobby / Free Tier)                      │
│                                                                         │
│  [ AI Agent Runtime ]                                                   │
│          │                                                              │
│          ▼ POST /api/v1/gateway/execute                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Next.js App Router Route Handler (apps/web)                       │  │
│  │                                                                   │  │
│  │  1. In-Memory Key Auth (SHA-256 with 5m Cache)                    │  │
│  │  2. Pure In-Memory Policy Evaluation (<1ms AST)                   │  │
│  │  3. Verdict: BLOCK (422), HELD (202), or ALLOW (Forward)          │  │
│  │  4. Asynchronous Audit Logging via @vercel/functions waitUntil() │  │
│  └──────────────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
      [ Downstream Target API ]             [ Neon Serverless Postgres ]
      (Stripe, Salesforce, etc.)            (Zero-Idle Free Database)
```

### The Magic: `@vercel/functions` `waitUntil()`
Instead of setting up and paying for an external Redis cluster to buffer audit logs, the Next.js serverless route handler uses Vercel's native `waitUntil()` API:

```typescript
import { waitUntil } from "@vercel/functions";

// Returns response immediately to the agent (<15ms evaluation)
// Neon DB write runs in the background before the serverless function suspends
waitUntil(
  db.insert(executionLogs).values({ ... })
);
```

---

## 2. Step 1: Provision Free Serverless PostgreSQL on Neon

1. Navigate to [Neon.tech](https://neon.tech) and create a free account.
2. Create a new project named `x4g4t-demo`.
3. In the Neon dashboard, copy your **Connection String (Pooled)**:
   ```text
   postgres://user:password@ep-cool-cloud-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Run the automated bootstrap script to initialize tables, enums, indexes, and seed baseline guardrails:
   ```bash
   cd X4G4T
   DATABASE_URL="<YOUR_NEON_CONNECTION_STRING>" pnpm db:bootstrap
   ```
   The script will print your demo organization slug and initial API key (`sec_live_...`).

---

## 3. Step 2: Configure Free Authentication on Clerk

1. Navigate to [Clerk.com](https://clerk.com) and create a free account.
2. Create an application named `X4G4T Demo`.
3. Select **Email** and **Google** as sign-in options.
4. From the Clerk dashboard (**API Keys** section), copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_...`)
   - `CLERK_SECRET_KEY` (`sk_test_...`)

---

## 4. Step 3: Deploy to Vercel (Free Tier)

### Method A: Deploy via Vercel Web Dashboard (Recommended)
1. Push your X4G4T repository to GitHub / GitLab.
2. Log into [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your repository and configure:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** Edit and set to `apps/web`.
4. In the **Environment Variables** section, add:

| Variable | Value |
| :--- | :--- |
| `DATABASE_URL` | `<Your Neon Connection String>` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `<Your Clerk Publishable Key>` |
| `CLERK_SECRET_KEY` | `<Your Clerk Secret Key>` |
| `DEFAULT_USER_ID` | `usr_demo_evaluator` |
| `NODE_ENV` | `production` |

5. Click **Deploy**. Vercel will build and deploy the app in under 90 seconds.

### Method B: Deploy via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to web application directory
cd apps/web

# Deploy to Vercel
vercel --prod
```

---

## 5. Step 4: Testing Your Deployed Demo Gateway

Once deployed, your live demo has two key interfaces:
- **Web Dashboard:** `https://<YOUR-VERCEL-DOMAIN>.vercel.app/dashboard`
- **Serverless API Gateway:** `https://<YOUR-VERCEL-DOMAIN>.vercel.app/api/v1/gateway/execute`

### 1. Generate an API Key
1. Open `https://<YOUR-VERCEL-DOMAIN>.vercel.app/dashboard/keys`.
2. Click **Create New Key** (e.g. `Demo-Agent-Key`).
3. Copy the revealed key: `sec_live_...`.

### 2. Configure a Safety Policy Rule
1. Open `https://<YOUR-VERCEL-DOMAIN>.vercel.app/dashboard/policies`.
2. Add a rule:
   - **Tool Name:** `issue_refund`
   - **Field Path:** `amount`
   - **Operator:** `GREATER_THAN`
   - **Target Value:** `250`
   - **Action:** `BLOCK`

### 3. Test with cURL (Agent Invocation)

#### A. Compliant Tool Call (Forwarded Downstream)
```bash
curl -X POST https://<YOUR-VERCEL-DOMAIN>.vercel.app/api/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "demo_agent",
    "tool_name": "issue_refund",
    "arguments": { "amount": 75, "customer_id": "cust_123" },
    "downstream_url": "https://httpbin.org/post"
  }'
```
**Response (HTTP 200):** Downstream response mirrored. Audit log written to Neon in background.

#### B. Prohibited Tool Call (Blocked at Firewall)
```bash
curl -X POST https://<YOUR-VERCEL-DOMAIN>.vercel.app/api/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "demo_agent",
    "tool_name": "issue_refund",
    "arguments": { "amount": 500, "customer_id": "cust_123" },
    "downstream_url": "https://httpbin.org/post"
  }'
```
**Response (HTTP 422):**
```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Execution blocked by policy '...'. Reason: Triggered policy 'Refund Cap' for tool 'issue_refund'",
    "details": {
      "tool": "issue_refund"
    }
  }
}
```

### 4. Inspect Real-Time Audit Logs
Navigate to `https://<YOUR-VERCEL-DOMAIN>.vercel.app/dashboard/logs`. Your execution records (both allowed and blocked) will appear within seconds, showing latency metrics and sanitized arguments.

---

## 6. Serverless Demo vs. High-Throughput Production

| Dimension | Vercel Free-Tier Demo | Production (Fastify on ECS / Fly.io) |
| :--- | :--- | :--- |
| **Compute Model** | Ephemeral Serverless Functions | Persistent Long-Running Node.js Containers |
| **Gateway Hot Path** | `POST /api/v1/gateway/execute` (Next.js) | `POST /v1/gateway/execute` (Fastify v4) |
| **Audit Logging** | `@vercel/functions` `waitUntil()` direct to Neon | Redis + BullMQ Asynchronous Batch Worker |
| **Cold Starts** | $\approx 200\text{ms}$ on cold invocation; $\approx 20\text{ms}$ warm | **Zero Cold Starts** (persistent memory ring) |
| **Total Ingestion Overhead**| $\approx 20\text{ms} - 45\text{ms}$ | **$<4.5\text{ms}$** (Strict $<15\text{ms}$ SLA) |
| **Concurrency Ceiling** | 100 concurrent executions (Vercel Hobby) | **10,000+ RPS** per cluster |
| **Infrastructure Cost** | **$0 / month (100% Free)** | Tiered cloud compute + managed Redis |
| **Best For** | Client Demos, Hackathons, POC Evaluations | Enterprise Mission-Critical Agent Pipelines |

