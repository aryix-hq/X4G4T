# Phase 2 Documentation: The Fastify Proxy Ingestion Engine (The Firewall Hot Path)

**Phase Status:** ✅ **COMPLETED & VERIFIED**  
**Monorepo Package Implemented:**
- `@x4g4t/proxy` (`apps/proxy`)

---

## 1. Overview of Phase 2 Deliverables

Phase 2 implements the high-throughput, low-overhead HTTP ingestion firewall sitting inline between AI agent runtimes and downstream enterprise APIs. It guarantees:
1. **Low Latency Processing:** Zero synchronous database writes on the hot path; policies cached in-memory with 60-second TTL; API tokens cached with 5-minute TTL.
2. **Deterministic Interception:** Intercepts `POST /v1/gateway/execute` calls, runs pure in-memory AST evaluations, and enforces:
   - `BLOCK` $\rightarrow$ Immediate `422 Unprocessable Entity` with `POLICY_VIOLATION` details.
   - `REQUIRE_APPROVAL` $\rightarrow$ Immediate `202 Accepted` with `hold_id` and retry poll interval.
   - `ALLOW` $\rightarrow$ Proxies payload to `downstream_url` and returns upstream response.
3. **Resilient Circuit Breaking:** Outbound HTTP client enforces an explicit 8000ms `AbortController` timeout, returning `504 Gateway Timeout` on downstream unresponsiveness.
4. **Asynchronous Telemetry Dispatch:** Emits audit logs to BullMQ (`audit-logs`) in Redis without delaying agent response cycles.

---

## 2. Component Architecture & Implementation Details

```text
apps/proxy/
├── src/
│   ├── plugins/
│   │   └── auth.ts          # Bearer token validation with SHA-256 caching
│   ├── routes/
│   │   └── execute.ts       # POST /v1/gateway/execute handler
│   ├── services/
│   │   ├── gateway.ts       # Downstream forwarder & in-memory policy cache
│   │   └── queue.ts         # Resilient BullMQ queue producer
│   └── index.ts             # Fastify app factory & bootstrap
├── test/
│   └── execute.test.ts      # 9 integration tests via app.inject()
├── package.json
└── tsconfig.json
```

### A. Authentication Plugin (`src/plugins/auth.ts`)
- Decorates Fastify with `fastify.authenticate`.
- Extracts `Authorization: Bearer sec_live_...` from incoming headers.
- Hashes token using SHA-256 and checks in-memory `tokenCache` (5-minute TTL).
- Queries `apiKeys` table on cache miss and verifies against `deletedAt IS NULL`.
- Attaches `request.orgId` and `request.keyId` to the request context.
- Exports `setMockApiKey` and `clearTokenCache` for deterministic, zero-database unit and integration testing.

### B. Gateway Service & In-Memory Policy Cache (`src/services/gateway.ts`)
- **Policy Cache:** Stores pre-compiled `CompiledPolicy[]` per organization with a 60-second TTL.
- **Downstream Forwarder:** Outbound `fetch` wrapped with an `AbortController` capped at 8000ms.
- Extracts response headers and parses JSON or text response seamlessly.

### C. BullMQ Queue Producer (`src/services/queue.ts`)
- Manages an isolated `ioredis` connection configured with `lazyConnect: true` and `enableOfflineQueue: false`.
- Dispatches audit logs asynchronously to the `audit-logs` queue with `removeOnComplete: true` and `removeOnFail: 1000`.
- Catches connection errors gracefully to ensure telemetry issues never block downstream tool execution.

### D. Execution Route Handler (`src/routes/execute.ts`)
- **Schema Validation:** Strictly parses incoming JSON payloads against `ExecutePayloadSchema`:
  ```typescript
  {
    agent_id: string (1-128 chars),
    tool_name: string (1-64 chars),
    arguments: Record<string, unknown>,
    downstream_url: string (valid URL),
    downstream_headers: Record<string, string> (optional)
  }
  ```
- **PII Scrubbing:** Calls `sanitizePayload(arguments)` from `@x4g4t/policy-engine` to redact personal data before logging.
- **Verdict Resolution:**
  - `BLOCK`: Returns HTTP 422 with structured violation metadata.
  - `REQUIRE_APPROVAL`: Returns HTTP 202 with `status: "HELD"`, `hold_id: UUID`, and `retry_after_sec: 5`.
  - `ALLOW`: Proxies to downstream target and returns upstream status and body.
  - `DOWNSTREAM_TIMEOUT`: Returns HTTP 504 on 8000ms deadline breach.
  - `BAD_GATEWAY`: Returns HTTP 502 on network connection failure.

---

## 3. Integration Testing & Verification

The integration test suite tests the complete Fastify request pipeline in-process using `app.inject()`:

```bash
pnpm --filter @x4g4t/proxy test
```

### Test Results
```text
✓ test/execute.test.ts (9 tests)
  ✓ Fastify Proxy Ingestion Engine (/v1/gateway/execute)
    ✓ should return 200 on /healthz
    ✓ should reject requests without Bearer authorization (401 UNAUTHORIZED)
    ✓ should reject requests with invalid/revoked API keys (401 INVALID_API_KEY)
    ✓ should reject malformed payloads with 400 BAD_REQUEST
    ✓ should BLOCK dangerous tool calls breaching threshold (422 POLICY_VIOLATION)
    ✓ should HOLD high-impact tool calls requiring human approval (202 Accepted)
    ✓ should ALLOW compliant tool calls and forward downstream (200 OK)
    ✓ should return 504 DOWNSTREAM_TIMEOUT when target exceeds 8000ms deadline
    ✓ should return 502 BAD_GATEWAY when downstream connection fails

Test Files:  1 passed (1)
Tests:       9 passed (9)
Duration:    802ms
```

---

## 4. Full Monorepo Build & Test Verification

```bash
pnpm turbo run build test
```
```text
Tasks:    5 successful, 5 total
Cached:   0 cached, 5 total
Time:     1.686s
```

All 4 packages (`@x4g4t/tsconfig`, `@x4g4t/db`, `@x4g4t/policy-engine`, `@x4g4t/proxy`) compile with strict TypeScript checks and pass 45 total automated unit and integration tests.

