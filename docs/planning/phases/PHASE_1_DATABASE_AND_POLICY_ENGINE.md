# Phase 1 Documentation: Database Foundation & In-Memory Policy Engine

**Phase Status:** ✅ **COMPLETED & VERIFIED**  
**Monorepo Packages Implemented:**
- `@x4g4t/tsconfig` (`packages/tsconfig`)
- `@x4g4t/db` (`packages/db`)
- `@x4g4t/policy-engine` (`packages/policy-engine`)

---

## 1. Overview of Phase 1 Deliverables

Phase 1 establishes the deterministic security core and transactional persistence foundation for X4G4T. It guarantees:
1. **Zero-Latency Policy Evaluation:** In-memory rule execution finishes in $<1\text{ms}$ on average, well beneath the $<15\text{ms}$ proxy SLA budget.
2. **Regulatory Privacy Architecture:** Built-in tables for GDPR Art. 17 / DPDP Sec. 12 Crypto-Shredding (`subject_encryption_keys`) and automated tenant retention TTLs (`retention_days`).
3. **Tamper-Evident Audit Logging:** ISO/IEC 27001 Control A.8.15 cryptographic hash chaining (`previous_record_hash` $\rightarrow$ `record_hash`).
4. **Data Sanitization:** Inline zero-latency regex scrubbing for PII and downstream authorization credentials.

---

## 2. Monorepo Package Breakdown

### A. Shared TypeScript Configuration (`packages/tsconfig`)
- **`base.json`**: Enforces strict mode (`noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`), NodeNext module resolution, and generates declaration source maps.

### B. Database Schema & Models (`packages/db`)
Managed using **Drizzle ORM** with PostgreSQL.

#### Core Enums
- `policy_action`: `["ALLOW", "BLOCK", "REQUIRE_APPROVAL"]`
- `rule_operator`: `["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL", "CONTAINS", "REGEX", "IN"]`
- `log_verdict`: `["PASSED", "BLOCKED", "HELD"]`
- `hitl_status`: `["PENDING", "APPROVED", "REJECTED"]`

#### Relational Entities
1. **`organizations`**
   - Tenancy root holding organization name, slug, Stripe customer identifier, billing status, and `retention_days` (default: 90) for data minimization.
2. **`api_keys`**
   - Hashed authentication tokens (`key_prefix` for display, `key_hash` for SHA-256 constant-time lookup).
3. **`policies`**
   - Tool-level guardrail policies targeting specific tool names (e.g., `issue_refund`) or wildcard (`*`).
4. **`policy_rules`**
   - Field dot-path constraints (e.g., `transaction.total >= 1000`).
5. **`execution_logs`**
   - Immutable audit trail storing `arguments` (JSONB), `verdict`, `latency_ms`, `is_pii_redacted`, `previous_record_hash`, and `record_hash`.
6. **`hitl_requests`**
   - Human-in-the-Loop review entities holding suspended actions pending operator decision.
7. **`subject_encryption_keys`**
   - Per-subject encryption keys for GDPR Article 17 and DPDP Section 12 crypto-shredding.

---

### C. In-Memory Policy Engine (`packages/policy-engine`)

#### 1. Deterministic Operators (`operators.ts`)
- **`extractFieldValue(payload, path)`**: Safely extracts properties from deeply nested JSON objects using dot notation (e.g. `order.customer.tier`).
- **`evaluateOperator(actual, operator, target)`**:
  - `EQUALS` / `NOT_EQUALS`: Type-safe string comparison.
  - `GREATER_THAN` / `LESS_THAN` / `GREATER_THAN_OR_EQUAL` / `LESS_THAN_OR_EQUAL`: Numeric comparison with strict `NaN` guards.
  - `CONTAINS`: Case-insensitive substring searching.
  - `REGEX`: Robust regex matching supporting standard strings, inline case-insensitivity `(?i)`, and `/pattern/flags` syntax without throwing syntax errors.
  - `IN`: Comma-delimited set matching with whitespace trimming.

#### 2. PII & Credential Sanitizer (`sanitizer.ts`)
- **`scrubString(str)`**: Masks email addresses, phone numbers, credit card PANs, IBANs, SSNs, and secret tokens (`sec_live_...`, `Bearer ...`).
- **`sanitizePayload(payload)`**: Recursively scrubs payloads before enqueuing to BullMQ or storing in Postgres.
- **`sanitizeHeaders(headers)`**: Replaces `Authorization`, `Cookie`, `X-Api-Key` headers with `[REDACTED_CREDENTIAL]`.

#### 3. Policy Evaluator & Tamper-Evident Hash Chaining (`evaluator.ts`)
- **`evaluateAgentExecution(policies, context)`**: Evaluates multi-rule policies with AND-semantics; records execution latency via `performance.now()`.
- **`computeLogRecordHash(record)`**:
  $$\text{SHA256}(\text{id} + \text{previousRecordHash} + \text{toolName} + \text{verdict} + \text{createdAt})$$
- **`verifyLogHashChain(records)`**: Validates log integrity across any sequential batch of records, detecting modified rows or broken chain pointers.

---

## 3. Rigorous Test Suite & Verification

The test suite runs under **Vitest 2.1.9** with 100% pass rate:

```bash
pnpm --filter @x4g4t/policy-engine test
```

### Test Results
```text
✓ test/evaluator.test.ts (11 tests)
  ✓ should ALLOW tool call when arguments remain within bounds
  ✓ should BLOCK tool call when single rule threshold is breached
  ✓ should correctly handle nested paths and trigger REQUIRE_APPROVAL
  ✓ should not trigger AND rule if one nested condition fails
  ✓ should BLOCK malicious queries via REGEX
  ✓ should match wildcard target tools with IN operator
  ✓ should evaluate in less than 1ms on average (<15ms SLA budget)
  ✓ ISO 27001 Cryptographic Log Hash Chaining (4 tests)
    ✓ should compute deterministic record hashes
    ✓ should verify an unbroken sequential chain of audit records
    ✓ should detect tamper when an audit record verdict is altered post-hoc
    ✓ should detect tamper when a link in previousRecordHash is severed

✓ test/operators.test.ts (20 tests)
  ✓ getNestedValue & extractFieldValue (5 tests)
  ✓ evaluateOperator - Null / Undefined Safety (1 test)
  ✓ evaluateOperator - EQUALS & NOT_EQUALS (3 tests)
  ✓ evaluateOperator - Numeric Comparisons (5 tests)
  ✓ evaluateOperator - CONTAINS (1 test)
  ✓ evaluateOperator - REGEX (4 tests)
  ✓ evaluateOperator - IN Operator (1 test)

✓ test/sanitizer.test.ts (5 tests)
  ✓ should scrub email addresses from strings
  ✓ should scrub credit card numbers and IBANs
  ✓ should scrub raw API tokens with known prefixes
  ✓ should recursively sanitize nested payload objects and arrays
  ✓ should scrub authorization headers from downstream requests

Test Files:  3 passed (3)
Tests:       36 passed (36)
Duration:    232ms
```

### Monorepo Build Verification
```bash
pnpm turbo run build test
```
```text
Tasks:    3 successful, 3 total
Time:     774ms
```

---

## 4. Documentation Index Update
This document is cataloged under the project documentation hierarchy in `docs/phases/PHASE_1_DATABASE_AND_POLICY_ENGINE.md`.

