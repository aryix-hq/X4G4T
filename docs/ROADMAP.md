# X4G4T Strategic Product Roadmap

This document outlines the engineering and product execution roadmap for **X4G4T** (`@aryix-hq/x4g4t`), establishing it as:
$$\text{\bf The open-source runtime authorization and enforcement layer for AI agents and MCP tools.}$$

For the comprehensive product blueprint, ICP analysis, and commercialization model, refer to [docs/planning/STRATEGIC_PRODUCT_BLUEPRINT.md](planning/STRATEGIC_PRODUCT_BLUEPRINT.md).

---

## 🗺️ Milestone Overview

```
      2026 Q4                        2027 Q1                        2027 Q2                    2027 Q3 - Q4
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ PHASE 1: Zero Friction   │──▶│ PHASE 2: Identity & SDKs │──▶│ PHASE 3: Benchmark Moat  │──▶│ PHASE 4: Fleet Scale     │
│ • 5-min MCP Drop-in CLI  │   │ • 6-Tuple Agent Identity │   │ • 1,000+ Attack Corpus   │   │ • Central Fleet Manager  │
│ • Policy-as-Code YAML    │   │ • Embedded Python SDK    │   │ • OWASP Agentic Top 10   │   │ • GitOps Policy Sync     │
│ • x4g4t test / explain   │   │ • LangGraph / CrewAI     │   │ • Slack / Teams HITL     │   │ • Cryptographic WORM     │
│ • GitHub Actions CI      │   │ • Session Scope Stepping │   │ • Automated Drift Mining │   │ • SOC2 / HIPAA Audit Binders│
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

---

## Phase 1: Near-Term (Q4 2026 — Zero-Friction Developer Adoption)

**Primary Objective**: A developer can install X4G4T and protect an existing MCP server in under 5 minutes without changing application architecture.

1. **Standalone Zero-Configuration MCP Interceptor CLI (`@x4g4t/cli`)**:
   - `npx @x4g4t/cli mcp --target http://localhost:8080/sse --policy policy.yaml`
   - Automated injection of guardrails into Cursor (`~/.cursor/mcp.json`) and Claude Desktop (`claude_desktop_config.json`).
   - Protocol-aware JSON-RPC 2.0 error mapping with standard `-32001 Policy Violation` response payloads.

2. **Declarative Policy-as-Code Engine (`x4g4t.yaml`)**:
   - Standardized YAML schema for role-based tool permissions, argument constraints, regex guards, and DLP redactions.
   - Zero-allocation compilation into pure TypeScript AST evaluators executing in $<200\mu\text{s}$.

3. **Developer CLI Testing Suite (`x4g4t test` & `x4g4t explain`)**:
   - `x4g4t lint`: Static syntax and schema validation of policy manifests.
   - `x4g4t test`: Offline unit-test runner evaluating simulated tool call fixtures against policies without network dependencies.
   - `x4g4t explain`: Detailed decision breakdown of why a given payload resulted in `ALLOW`, `BLOCK`, `REDACT`, or `HELD`.
   - Pre-built GitHub Action to enforce policy compliance on every PR.

---

## Phase 2: Medium-Term (Q1 2027 — Contextual Agent Identity & Framework SDKs)

**Primary Objective**: Shift from static tool checks to full contextual authorization across major agent frameworks.

1. **The 6-Tuple Contextual Agent Identity Matrix**:
   - Dynamic binding across:
     $$\langle \text{Human Identity}, \text{Agent Identity}, \text{Session / Chain}, \text{Tool}, \text{Target Data}, \text{Operation / Intent} \rangle$$
   - Verification of identity assertions against Clerk, Okta, OIDC, and SPIFFE SVID tokens.
   - Per-session scope step-up prevention, eliminating confused-deputy attacks.

2. **Universal In-Process Language SDKs (`@x4g4t/sdk` & Python `x4g4t`)**:
   - Embedded native Python library (`pip install x4g4t`) allowing direct in-memory policy evaluation inside LangGraph, CrewAI, AutoGen, and Semantic Kernel.
   - Zero-overhead in-process interception without mandatory external proxy containers.

3. **Dynamic Agent Spend & Token Budgets**:
   - Rolling hourly and daily token and financial expenditure caps per agent ID.
   - Automated rate-limiting and soft/hard limits (`HTTP 429` / `HTTP 402 BUDGET_EXCEEDED`).

---

## Phase 3: Expansion (Q2 2027 — The Adversarial Benchmark Moat)

**Primary Objective**: Build the world's most rigorous open-source adversarial agent security test corpus, establishing independent credibility.

1. **The X4G4T Agent Security Benchmark (ASB)**:
   - 1,000+ open-source reproducible attack scenarios covering:
     - **MCP & Tool Boundary**: Tool poisoning, rug pulls, schema injection, parameter hallucination.
     - **Data Exfiltration & DLP**: Entropy bypasses, multi-chunk exfiltration, Base64/hex smuggling.
     - **Network & SSRF**: DNS rebinding, cloud metadata (`169.254.169.254`), IPv6 escapes.
     - **Authorization**: Confused-deputy exploitation, role impersonation, approval race conditions.
   - Direct quarterly compliance mapping to the **OWASP 2026 Agentic AI Top 10**.

2. **Multi-Channel Stateful Human-in-the-Loop (HITL) Dispatcher**:
   - 1-click approvals and rejections via Slack Block Kit and Microsoft Teams adaptive cards.
   - Cryptographically signed approval tokens with expiration timeouts and fallback policies.

3. **Autonomous Counterfactual Drift Mining**:
   - Non-blocking shadow mode monitoring of live tool executions.
   - Automated distribution mining suggesting conservative bounds ($P99 \times 1.15$) for emerging agent behaviors.

---

## Phase 4: Long-Term (Q3–Q4 2027 — Enterprise Commercial Fleet Scale)

**Primary Objective**: Transition from single-node deployments to multi-tenant, enterprise-wide fleet governance.

1. **Centralized Fleet Control Plane**:
   - Single-pane-of-glass dashboard managing 10,000+ distributed proxy nodes across hybrid cloud and Kubernetes clusters.
   - Real-time agent inventory, active tool registry, and live blast-radius mapping.

2. **GitOps Centralized Policy Synchronization**:
   - Declarative policy distribution with sub-second replication across edge nodes.
   - Automated canary rollouts and instant rollback triggers on anomalous block rates.

3. **Cryptographic WORM Compliance Storage**:
   - Tamper-evident, hash-chained audit logging with AWS S3 Object Lock and 7-year immutable retention.
   - Pre-packaged SOC2 Type II, HIPAA, PCI-DSS, and EU AI Act compliance evidence binders.

4. **Enterprise SIEM & Telemetry Connectors**:
   - Native real-time streaming into Splunk, Datadog, Elastic Cloud, and Graylog SIEM.

---

## 🎯 North Star Metrics

| Metric | Year 1 Target | Year 2 Target | Target Outcome |
| :--- | :---: | :---: | :--- |
| **Active Protected Agents** | 100 | 10,000 | Industry standard runtime boundary |
| **Monthly Enforced Tool Calls** | 10M | 1B | Ultra-low latency edge validation |
| **Deterministic Decisions Rendered** | 100% | 100% | Zero hallucinated pass-throughs |
