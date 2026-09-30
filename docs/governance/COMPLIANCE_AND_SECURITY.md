# X4G4T: Enterprise Security, Compliance & Regulatory Vetting
**Standards Coverage:** ISO/IEC 27001:2022, ISO/IEC 42001:2023, GDPR (EU 2016/679), India DPDP Act 2023, SOC 2 Type II, OWASP Top 10 for LLMs  
**Authoritative Scorecard:** [COMPLIANCE_SCORECARD.md](COMPLIANCE_SCORECARD.md)

---

## 1. Executive Vetting Summary

X4G4T functions as a critical security control plane. However, because it sits directly in the data flow of state-changing autonomous actions and stores transaction arguments, it is subject to rigorous regulatory and security scrutiny.

### Overall Compliance Posture
| Framework / Standard | Status Before Vetting | Required Remediation | Post-Remediation Status |
| :--- | :--- | :--- | :--- |
| **ISO/IEC 27001:2022 (ISMS)** | ⚠️ Partially Compliant | Add Cryptographic Log Hash Chaining, Secret Masking, Row-Level Isolation | 🛡️ Fully Compliant |
| **ISO/IEC 42001:2023 (AI Systems)** | ✅ Aligned | Formalize Agent Autonomy Blast-Radius Bounds & Safety Interventions | 🛡️ Industry Benchmark |
| **GDPR (EU 2016/679)** | ❌ Non-Compliant Risk | Resolve Immutability vs. Art. 17 (Right to Erasure) via Crypto-Shredding & PII Redaction | 🛡️ Fully Compliant |
| **India DPDP Act 2023** | ❌ Non-Compliant Risk | Purpose limitation, Data Principal erasure, mandatory breach notification controls | 🛡️ Fully Compliant |
| **OWASP Top 10 for LLMs / Agents** | ✅ High Alignment | Add Downstream Credential Stripping and Header Injection Prevention | 🛡️ Bullet-Proof |

---

## 2. Deep-Dive Legal & Regulatory Analysis

### A. GDPR (EU General Data Protection Regulation)
#### 1. The Immutability Paradox: Article 17 ("Right to be Forgotten") vs. Immutable Audit Logs
- **The Conflict:** GDPR Article 17 grants individuals the right to have their personal data erased without undue delay. Conversely, SOC 2 and ISO 27001 (A.8.15) require immutable, tamper-evident audit trails. If an agent executes `issue_refund(user_id: "usr_123", email: "alice@company.com", iban: "DE89...")`, writing this raw payload to an append-only, non-deletable `execution_logs` table creates an irreversible GDPR violation.
- **Remediation Architecture (Dual-Mechanism):**
  1. **Inline Zero-Latency PII Masking/Redaction:** Provide built-in regex/transformer masking before enqueuing to Redis/Postgres (e.g., masking emails, credit cards, IBANs, phone numbers into `[REDACTED_PII]`).
  2. **Cryptographic Erasure ("Crypto-Shredding"):** For arguments containing personal identity identifiers, encrypt the payload arguments column using a Tenant/Subject Key derived via HMAC-SHA256 (`Key_subject = KDF(MasterKey, UserID)`). Upon receiving an Art. 17 erasure request, destroy `Key_subject`. The audit metadata (timestamp, agent ID, tool name, verdict, latency) remains intact for compliance, but the personal data payload becomes mathematical noise (provably unrecoverable).

#### 2. Article 5(1)(c) - Data Minimization
- Never persist uninspected payloads wholesale. X4G4T must only store the fields necessary for policy evaluation, forensic auditability, and dispute resolution.

#### 3. Article 25 - Data Protection by Design and by Default
- Automated data retention TTLs: Organizations can define strict TTL retention schedules (e.g., 7 days, 30 days, 90 days), after which background BullMQ jobs prune expired logs automatically.
- Multi-tenancy isolation: No tenant can query or leak another tenant's log records or policy configurations.

---

### B. India DPDP Act 2023 (Digital Personal Data Protection Act)
#### 1. Section 8(5) & Section 8(6) - Reasonable Security Safeguards & Breach Notification
- **Obligation:** Data Fiduciaries must implement reasonable security safeguards to prevent personal data breaches under threat of statutory penalties up to ₹250 Crore (~$30M USD). In the event of a breach, intimation must be given to the Data Protection Board of India and affected Data Principals.
- **X4G4T Implementation:** 
  - All communication over TLS 1.3.
  - API keys hashed with SHA-256 with cryptographically secure salts.
  - Zero plain-text token persistence.

#### 2. Section 12 - Right to Correction and Erasure of Personal Data
- In alignment with GDPR Art. 17, personal data within tool call payloads must be erasable upon request of the Data Principal without corrupting system integrity. The Crypto-Shredding architecture satisfies Section 12 in full.

#### 3. Section 6 - Consent & Purpose Limitation
- X4G4T policies can enforce **Purpose Verification**: verifying that an agent tool call matches the authorized scope and purpose granted by the human principal.

---

### C. ISO/IEC 27001:2022 (Information Security Controls)
| Control | ISO Requirement | X4G4T Architecture Implementation |
| :--- | :--- | :--- |
| **A.5.15** | Access Control | Role-Based Access Control (RBAC) separating Super Admin, SecOps, Reviewers, and Auditors. |
| **A.8.12** | Data Leakage Prevention | Strict scrubbing of downstream authorization tokens and sensitive argument fields. |
| **A.8.15** | Logging | Cryptographic hash chaining (each log entry hashes the previous entry's hash) ensuring tamper-evidence. |
| **A.8.20** | Network Security | Reverse proxy sits in DMZ / VPC; downstream egress restricted via configurable domain whitelists. |
| **A.8.24** | Use of Cryptography | Modern cryptographic standards: AES-256-GCM for encrypted fields, SHA-256 for token hashing. |

---

### D. ISO/IEC 42001:2023 (Artificial Intelligence Management System)
ISO 42001 is the world's first AI management system standard. X4G4T is built precisely to serve as a technical control for ISO 42001:
- **Control B.6.2 (AI System Impact Assessment):** Evaluates whether an agent's proposed action falls into a high-consequence category.
- **Control B.7.4 (Human Oversight & Autonomy Limits):** The Human-in-the-Loop (HITL) mechanism suspends unverified high-impact actions and requires explicit human authorization before state mutations occur.
- **Control B.9.3 (Traceability of AI Decision-Making):** Full causal chain capture: Model Name + Agent ID + Prompt Hash + Exact Tool Input + Evaluator Decision + Downstream HTTP Status.

---

## 3. Threat Modeling & Vulnerability Hardening (STRIDE / OWASP LLM)

### 1. Downstream Credential Exposure Risk
- **Threat:** In the original draft, the agent runtime sends `downstream_headers: { "Authorization": "Bearer rk_live_..." }` in the HTTP body. If this raw body is logged to `execution_logs` or Redis, downstream API keys are exposed to anyone with log read access.
- **Hardening:**
  - `apps/proxy` must strictly redact the `Authorization` header and known credential fields from all logs before enqueuing to BullMQ.
  - Only non-sensitive headers (e.g., `Content-Type`, `X-Request-Id`) may be recorded in telemetry.

### 2. Multi-Tenant Side-Channel & Key Collision
- **Threat:** If an attacker discovers or forges an API key, or if an SQL query lacks tenant filtering, cross-tenant log or policy exfiltration can occur.
- **Hardening:**
  - PostgreSQL **Row-Level Security (RLS)** enabled on all tenant tables (`policies`, `api_keys`, `execution_logs`, `hitl_requests`).
  - Token hashing uses SHA-256 on the full unmasked secret (`sec_live_<32 bytes>`); index lookups are guaranteed constant-time.

### 3. Replay Attacks & Idempotency Bypass
- **Threat:** Malicious actors intercept an agent's valid tool call and replay it multiple times to drain resources or repeatedly execute payments.
- **Hardening:**
  - Support `Idempotency-Key` headers stored in Redis with a 24-hour TTL.
  - Replayed requests return cached verdicts and responses without re-invoking downstream APIs.

### 4. Tamper-Evident Hash Chaining
- **Threat:** A rogue database administrator or compromised DB credential alters audit records to cover up an agent compromise.
- **Hardening:**
  - Each `execution_logs` row includes `previous_record_hash` and `record_hash` computed as:
    $$\text{record\_hash} = \text{SHA256}(\text{id} + \text{previous\_record\_hash} + \text{tool\_name} + \text{verdict} + \text{timestamp})$$
  - Any unauthorized modification breaks the cryptographic chain and triggers SIEM alerts.

---

## 4. Phase 1 Architecture Adjustments for Bullet-Proof Compliance

Before implementing Phase 1, the following enhancements are incorporated into `@x4g4t/db` and `@x4g4t/policy-engine`:

1. **Schema Additions (`packages/db/src/schema/index.ts`):**
   - Add `previousRecordHash: text("previous_record_hash")` and `recordHash: text("record_hash")` to `execution_logs`.
   - Add `isPiiRedacted: text("is_pii_redacted").default("true")` to `execution_logs`.
   - Add `retentionDays: integer("retention_days").default(90)` to `organizations`.
2. **Policy Engine Additions (`packages/policy-engine`):**
   - Built-in PII detection & masking helpers (`sanitizePayload(payload)`).
   - Downstream header sanitizer (`sanitizeHeaders(headers)`).
3. **Data Protection Policy (`packages/db`):**
   - Crypto-shredding key registry table or pseudonymized subject ID mapping to enable single-click GDPR Art. 17 / DPDP Sec. 12 data deletion.

