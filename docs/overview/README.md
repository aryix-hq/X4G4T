# X4G4T: Overview & Value Proposition

> **Zero-latency, headless policy firewall and Data Leakage Prevention (DLP) proxy for AI agents and Model Context Protocol (MCP) servers.**

---

## 1. Executive Summary

As enterprise adoption of autonomous AI coding assistants (Cursor, Claude Code, Windsurf, Devin, Cline) and autonomous agent frameworks (LangChain, CrewAI, AutoGen) accelerates, security teams face a critical vulnerability: **autonomous agents operate with high-level ambient permissions, execute shell commands, query SQL databases, and call external APIs with minimal deterministic guardrails.**

**X4G4T** (`@aryix-hq/x4g4t`) solves this challenge by placing an ultra-low-latency (<0.2ms), fail-closed security gateway between AI agents and upstream tools, databases, or cloud LLMs.

---

## 2. Everyday Analogy: The Autonomous Agent Conundrum

Think of an AI coding agent as a brilliant, hyper-fast intern who has been given master keycards to your server room, root database access, and a corporate credit card. While the intern is exceptionally productive, they can be easily manipulated by prompt injection, make catastrophic mistakes (such as running `DROP TABLE users;`), or accidentally leak AWS credentials into a third-party chat prompt.

| Technical Component | Everyday Analogy | Security Function |
| :--- | :--- | :--- |
| **Proxy Gateway** | **Airport Security Scanner** | Inspects every inbound request and outbound tool call before granting entry to your production environment. |
| **In-Memory AST Policy Engine** | **Legal Compliance Check (<0.2ms)** | Deterministically validates parameters, prevents destructive operations, and checks bounds. |
| **Data Loss Prevention (DLP)** | **Blackout Marker (Redaction)** | In-flight masking of credit cards (Luhn Mod-10), SSNs, API tokens, and AWS access keys before egress. |
| **Rate Limiting & Quota** | **Utility Meter / Circuit Breaker** | Prevents runaway agent loops from exhausting cloud budgets or launching accidental DDoS attacks. |
| **Human-in-the-Loop (HITL)** | **Manager's Sign-Off Stamp** | Suspends high-risk or ambiguous actions in real time until authorized via Slack or Web Dashboard. |
| **Bilateral Kill Switch** | **Emergency Air-Gap Lever** | Immediately drops all AI ingress/egress in <1ms upon suspected breach or red-team exfiltration alert. |

---

## 3. High-Level Architecture Summary

```
                      ┌──────────────────────────────────────────────┐
                      │          X4G4T SECURITY GATEWAY (:4000)       │
  Polyglot AI Agents  │                                              │      Downstream Protected Targets
┌───────────────────┐ │  ┌────────────────────────────────────────┐  │     ┌────────────────────────────┐
│ Cursor / Windsurf │ │  │ 1. Emergency Kill Switch Check (<0.01ms)│  │ ──► │ Production Databases (SQL) │
└─────────┬─────────┘ │  ├────────────────────────────────────────┤  │     └────────────────────────────┘
          │           │  │ 2. Dual-Mode Auth & Identity Tracing   │  │
┌─────────┴─────────┐ │  ├────────────────────────────────────────┤  │     ┌────────────────────────────┐
│ Claude Desktop    │ │  │ 3. AST Policy Bounds (<0.2ms evaluation)│  │ ──► │ Payment Gateways (Stripe)  │
│ (tools/call)      │ ┼─►│    - ACTIVE Guardrails (BLOCK/HELD)    │  │     └────────────────────────────┘
└─────────┬─────────┘ │  │    - SHADOW Learning Mode (Zero Drift) │  │
          │           │  ├────────────────────────────────────────┤  │     ┌────────────────────────────┐
┌─────────┴─────────┐ │  │ 4. In-Flight DLP Sanitization & Vault   │  │ ──► │ Local Inference (Ollama)   │
│ LangChain / Auto  │ │  ├────────────────────────────────────────┤  │     └────────────────────────────┘
└─────────┬─────────┘ │  │ 5. SSRF Boundary Guard (RFC 1918)      │  │
          │           │  ├────────────────────────────────────────┤  │     ┌────────────────────────────┐
┌─────────┴─────────┐ │  │ 6. Async Kafka & Telemetry Streaming   │  │ ──► │ Cloud Models (Gemini/OpenAI)│
│ MCP JSON-RPC      │ │  └────────────────────────────────────────┘  │     └────────────────────────────┘
└───────────────────┘ └──────────────────────────────────────────────┘
```

---

## 4. Key Value Propositions

1. **Sub-Millisecond Policy Evaluation (<0.2ms):**  
   Evaluates Abstract Syntax Tree (AST) policies in pure memory without external database lookups in the hot path. AI agents experience zero perceptible latency overhead.
2. **Reverse Key Vaulting (Credential Isolation):**  
   Developers and AI agents only hold dummy local tokens (`sec_live_dev_...`). X4G4T securely stores enterprise API keys in an isolated vault and injects them only upon successful policy validation.
3. **Comprehensive Data Leakage Prevention (DLP):**  
   Full in-flight scanning for high-entropy secrets (Shannon entropy $\ge 4.5$), credit cards, SSNs, and custom PII with zero-width character stripping and Unicode NFKC normalization.
4. **Adversarial SSRF Boundary:**  
   Strict isolation preventing agents from accessing AWS/GCP instance metadata endpoints (`169.254.169.254`, `[fd00:ec2::254]`), RFC 1918 private subnets, decimal/hex IP encodings, or wildcard DNS rebinding domains.
5. **Decoupled Telemetry Streaming:**  
   Every event streams to Apache Kafka topic `x4g4t.audit.stream` with automatic fallback to Redis Streams and Graylog GELF, ensuring an immutable forensic trail.
