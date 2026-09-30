# How X4G4T Works: Architecture & Data Flow for Non-Engineers

> **The Elevator Pitch:**  
> Think of your AI coding agent (like Cursor, Claude Code, Windsurf, or Devin) as a brilliant but reckless intern with a company credit card and master keys to the office. **X4G4T is the security checkpoint, legal team, and financial manager sitting right outside their office door.** Every single action the intern attempts must pass through X4G4T before it touches your real database, payment gateway, or customer data.

---

## 🧭 Everyday Analogies: The Concepts Behind X4G4T

To understand X4G4T, you do not need a computer science degree. Here is how each major part works using everyday situations:

| Technical Term | Everyday Analogy | What It Actually Does |
| :--- | :--- | :--- |
| **The Proxy Gateway** | **Airport Security Scanner** | Inspects every bag (tool request) passing through before allowing anyone onto the plane (production network). |
| **Data Loss Prevention (DLP)** | **Blackout Marker (Redaction)** | Automatically blacks out credit cards, passwords, and social security numbers before an AI can leak them. |
| **Rate Limiting** | **Water Meter / Utility Quota** | Prevents an AI agent from running in an infinite loop and running up a \$50,000 cloud bill or crashing your servers. |
| **Human-in-the-Loop (HITL)** | **Manager's Signature on an Invoice** | Pauses sensitive actions (e.g. paying \$10,000 or dropping a database) until a human manager clicks "Approve" in Slack. |
| **Shadow / Learning Mode** | **Trainee Guard with a Clipboard** | Watches live traffic and writes down what *would* have been blocked, without stopping any actual work. |
| **Fail-Closed / Circuit Breaker**| **Home Electrical Fuse Box** | If the power surges or water leaks on the wires, the fuse trips immediately to cut power rather than letting the house burn down. |
| **SSE Stream Severing** | **Cutting the Microphone Cord** | If an AI starts speaking forbidden secrets in real time, X4G4T cuts the wire in under 5 milliseconds. |

---

## 🔄 The Life of an AI Tool Request (Step-by-Step)

Here is what happens in the **fraction of a millisecond** (less than 1/5th of a millisecond!) when an AI agent wants to execute a task:

```
┌─────────────────┐       ┌─────────────────────────────────────────────────────────┐       ┌──────────────────────┐
│                 │       │               X4G4T SECURITY GATEWAY                    │       │                      │
│   AI Agent      │       │                                                         │       │  Destination Target  │
│  (Cursor,       │──────►│ 1. Verify Identity (Safe Token ➔ Real Vault Key)        │──────►│  (Stripe, Postgres,  │
│   Claude Code,  │       │ 2. Safety Rules Check (< 0.2ms AST Engine)              │       │   GitHub, Internal   │
│   Devin, Cline) │◄──────│ 3. Blackout Marker Scrubbing (DLP Secret Redaction)     │◄──────│   Microservices)     │
│                 │       │ 4. Verdict: [ALLOW] or [BLOCK] or [REQUIRE_APPROVAL]    │       │                      │
└─────────────────┘       └────────────────────────────┬────────────────────────────┘       └──────────────────────┘
                                                       │
                                          (If high-risk action)
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │ Human Manager Sign- │
                                            │ off (Slack / Web)   │
                                            └─────────────────────┘
```

### Step 1: The AI Agent Decides to Take Action
Your AI coding assistant decides to run a tool—for example, refunding a customer, deleting an old record, or running a terminal command.

### Step 2: The Agent Calls the X4G4T Gateway
Instead of talking directly to Stripe or AWS, the agent is configured to send its request to X4G4T (`http://localhost:4000/v1/gateway/execute`).

### Step 3: Identity & Credential Swap (The Safe Badge Exchange)
- The agent does **not** know your real company production keys.
- It presents a lightweight dummy token (like `sec_live_x4g4t_demo`).
- X4G4T verifies that the agent has permission to run this tool, retrieves the real encrypted key from its secure vault, and injects it downstream. If the agent gets hacked or tricked by prompt injection, the hacker gets only a useless local token.

### Step 4: The In-Memory Policy Engine Check (< 0.2ms)
X4G4T inspects the tool request against your company's safety rules:
- *Is the refund amount greater than \$500?*
- *Is the SQL query trying to `DROP TABLE` or `TRUNCATE`?*
- *Is the tool attempting to contact internal metadata addresses (SSRF prevention)?*

This evaluation happens in pure memory in **less than 200 microseconds**, adding zero noticeable delay to the AI's response time.

### Step 5: Data Loss Prevention (DLP) Redaction
Before the payload leaves or enters:
- Credit card numbers (validated with the Luhn checksum) are blacked out (`[REDACTED_CC]`).
- Social Security Numbers, API keys, and private passwords are scrubbed.

### Step 6: The Three Possible Verdicts
1. **ALLOW**: Everything is clean and compliant. The request is forwarded immediately to the destination, and the response is returned to the AI.
2. **BLOCK**: A rule was violated (e.g. attempting to delete production tables). The request is stopped in its tracks. A clean `403 Forbidden` error explaining why the action was denied is returned to the AI.
3. **REQUIRE_APPROVAL (HITL)**: A sensitive action was requested (e.g. paying \$5,000). The request is paused. A notification is sent to a manager's Slack or the Web Dashboard. The AI is politely told: *"Your request is on hold pending human manager review."* Once the manager clicks **Approve**, the proxy completes the action. If rejected or 15 minutes pass without approval, the operation is canceled.

### Step 7: Tamper-Evident Flight Recorder Logging
Every action, millisecond latency, client IP, tool argument, and verdict is signed with a cryptographic SHA-256 tamper-evident hash and stored in the audit logs. No one—not even an administrator—can secretly alter history.

---

## 🧩 What Each System Component Does

X4G4T runs as a lightweight, coordinated set of services. Here is what each piece of the system handles:

```
                               ┌─────────────────────────────────┐
                               │       X4G4T Web Dashboard       │
                               │   (Manage rules, approve holds) │
                               └────────────────┬────────────────┘
                                                │
                                                ▼
┌───────────────────────────┐      ┌─────────────────────────┐      ┌───────────────────────────┐
│     Fastify Proxy         │◄────►│   PostgreSQL Database   │◄────►│        Redis Cache        │
│ (The High-Speed Bouncer)  │      │ (Permanent Rule Storage)│      │  (Sliding Window Quotas)  │
└─────────────┬─────────────┘      └─────────────────────────┘      └───────────────────────────┘
              │
              ├───────────────────────────────────┐
              ▼                                   ▼
┌───────────────────────────┐       ┌───────────────────────────┐
│   Graylog & Elasticsearch │       │     Aux-Ops & ML-Miner    │
│ (Black-Box Flight Log)    │       │ (AI Policy Recommendations)
└───────────────────────────┘       └───────────────────────────┘
```

1. **Proxy Gateway (`apps/proxy`)**:
   - The front-line bouncer. Built on ultra-fast Fastify and Node.js. Handles real-time traffic, validates keys, runs policies, and streams responses.
2. **Database (`packages/db` / PostgreSQL)**:
   - The permanent records archive. Stores safety policies, tenant configurations, API key hashes, and human approval audit trails.
3. **Redis Cache (`redis`)**:
   - The high-speed memory clock. Enforces rate limits (e.g. "Max 100 requests per minute per developer") without slowing down database disks.
4. **Web Control Plane (`apps/web`)**:
   - The visual dashboard. Allows security leads and managers to create policies using simple forms, view live traffic charts, approve Slack holds, and inspect audit logs.
5. **Graylog & Elasticsearch (`docker/graylog`)**:
   - The compliance search engine. Stores every log line in a searchable archive so auditors can prove SOC 2 and ISO 27001 compliance.
6. **Aux-Ops & ML-Miner (`apps/aux-ops`, `apps/proxy/src/workers/ml-miner.ts`)**:
   - The background analyst. Analyzes millions of historical agent requests to discover normal traffic patterns and recommend new safety rules automatically.

---

## 🛡️ What Happens When Things Break? (Resilience & Fail-Closed)

In mission-critical security systems, there are two ways a firewall can fail:
1. **Fail-Open (Dangerous)**: If the security server crashes, traffic is allowed through freely. *This is like an airport metal detector breaking and the guards just waving everyone onto the airplanes without inspection.*
2. **Fail-Closed (Defense-Grade)**: If the security server cannot confirm that a request is 100% safe, it defaults to **DENYING ALL TRAFFIC (`503 Service Unavailable` or `BLOCK`)**. *This is like the airport closing the security gates until the scanner is fixed.*

### How X4G4T Guarantees Fail-Closed Defense:
- **Database Outage?** X4G4T caches active policies in local memory. If the database goes completely dark, X4G4T continues enforcing existing safety rules. If it cannot read the rules, it denies the request.
- **Redis Down?** If the rate-limiting cache becomes unreachable, X4G4T falls back to a fail-closed posture, preventing runaway agent loops from overwhelming external APIs.
- **Mid-Flight Leakage (SSE Severing)?** If an AI assistant begins generating an answer that streams credit cards or private database dumps token by token, X4G4T detects the leak in real time, terminates the HTTP stream within **5 milliseconds**, and ensures the sensitive data is cut off at the root.
- **Lockdown Mode (The Emergency Kill-Switch)**: In the event of an active cyber incident, clicking **Engage Lockdown** in the dashboard blocks 100% of outbound tool executions in **0.00ms** across all agents enterprise-wide.
