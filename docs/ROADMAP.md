# X4G4T Engineering Product Roadmap

This document outlines the strategic, engineering-led architectural roadmap for **X4G4T** (`@aryix-hq/x4g4t`). Our objective is to establish the industry standard for zero-latency, defense-grade AI agent governance and policy enforcement.

---

## 🗺️ Milestone Overview

```
  2026 Q4                                2027 Q1 - Q2                         2027 Q3 - Q4
┌─────────────────────────────────┐   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│ PHASE 1: Hardening & Breadth    │──▶│ PHASE 2: Advanced ML & Defense  │──▶│ PHASE 3: Zero-Trust Mesh        │
│ • eBPF Linux Network Redirect   │   │ • ONNX Prompt Injection Tensor  │   │ • Cloud KMS / HSM Envelope Vault│
│ • Full MCP Bi-Directional Valid │   │ • Adaptive Anomaly Quarantine   │   │ • SOC 2 & CC EAL4+ Audit Kit    │
│ • OpenSearch / Grafana Dashboards│  │ • Multi-Region Raft Consensus   │   │ • SPIFFE/SPIRE Agent mTLS Mesh  │
│ • Dynamic Agent Token Budgets   │   │ • Counterfactual Drift Mining   │   │ • Decentralized Attestation     │
└─────────────────────────────────┘   └─────────────────────────────────┘   └─────────────────────────────────┘
```

---

## Phase 1: Near-Term (Q4 2026 — Hardening & Ecosystem Breadth)

Focus: Eliminating developer setup friction, expanding protocol support, and introducing granular financial guardrails.

1. **Automated eBPF Network Redirection (Zero-Configuration Linux Workstation Interception):**
   - Implement an eBPF TC (Traffic Control) / `cgroup/connect4` hook that automatically intercepts all outbound HTTP/HTTPS requests from designated developer processes without requiring manual proxy configuration or environment variables.
   - Transparently routes traffic through X4G4T on loopback interface `:4000`.

2. **Native MCP Protocol Inspector (Full JSON-RPC 2.0 Bi-Directional Validation):**
   - Provide protocol-level parsing of all MCP methods (`tools/list`, `tools/call`, `prompts/get`, `resources/read`).
   - Validate both request arguments and tool response payloads against strict JSON schema definitions with semantic error translation (`-32001 Policy Violation`).

3. **Pre-Built OpenSearch & Grafana Telemetry Dashboards:**
   - Ship production-ready Grafana dashboards visualizing Aux-Ops container metrics, event-loop lag quantiles, and AST evaluation histograms.
   - Provide pre-indexed OpenSearch/Graylog stream dashboards for threat-hunting SecOps analysts.

4. **Dynamic Fine-Grained Token Budget Caps:**
   - Track cumulative token spend per agent ID and developer session across rolling hourly and daily windows.
   - Enforce hard automated cut-offs (`HTTP 402 Payment Required` / `BUDGET_EXCEEDED`) when an autonomous agent exceeds its assigned financial threshold.

---

## Phase 2: Medium-Term (Q1–Q2 2027 — Advanced ML & Autonomous Defense)

Focus: Upgrading from heuristic/regex guardrails to ultra-fast embedded machine learning models.

1. **Sub-Millisecond On-the-Fly Prompt Injection Classification (ONNX Runtime):**
   - Integrate an embedded ONNX Runtime inference session running inside isolated Fastify worker threads.
   - Screen inbound prompt vectors and multi-modal tool inputs using quantized sub-10M parameter transformer embeddings in $<1\text{ms}$.
   - Detect indirect prompt injection (e.g. invisible instructions hidden inside downloaded HTML or code snippets).

2. **Adaptive Anomaly Quarantine:**
   - Continuously score live agent parameter distributions against historical baselines synthesized by the Intelligence Plane.
   - If an agent exhibits rapid parameter drift (e.g. sudden 10x surge in database row queries), the engine dynamically generates a temporary, high-restriction quarantine policy requiring HITL approval for all actions.

3. **Multi-Region Distributed Redis Pub/Sub with Raft Consensus:**
   - Enable globally distributed X4G4T gateway clusters across US, EU, and APAC with sub-second policy replication.
   - Implement Raft-backed leader election for distributed rate-limiting and global air-gap kill switch synchronization.

---

## Phase 3: Long-Term (Q3–Q4 2027 — Enterprise Zero-Trust Mesh)

Focus: Cryptographic hardware isolation, compliance certification, and autonomous agent workload identities.

1. **Cloud KMS & Hardware Security Module (HSM) Envelope Encryption:**
   - Integrate AWS KMS, Google Cloud KMS, and Azure Key Vault for envelope encryption of enterprise master keys.
   - Secret keys are decrypted only in secure enclave memory at the moment of downstream forward and are immediately zeroized.

2. **Compliance Automation Kit (SOC 2 Type II & Common Criteria EAL4+):**
   - Automated evidence collection scripts generating cryptographic proofs of tamper-evident logging, fail-closed enforcement, and access controls.
   - Ready-to-file security architecture binders for enterprise procurement and security audits.

3. **Decentralized Agent-to-Agent Workload Attestation (SPIFFE/SPIRE & mTLS):**
   - Issue short-lived cryptographic X.509 SVID certificates to autonomous agents via SPIFFE/SPIRE.
   - Enable zero-trust mutual TLS (mTLS) for agent-to-agent and agent-to-gateway interactions, preventing man-in-the-middle attacks in distributed multi-agent swarms.
