# Pipeline, SSE Streaming & Real-Time Tracing

## 1. Hot-Path Request Lifecycle & Pipeline Invariants

Every request passing through X4G4T executes through a strictly ordered, deterministic pipeline designed for sub-millisecond execution:

```
  Inbound Tool Call (POST /v1/gateway/execute or /v1/gateway/llm/*)
    │
    ├─▶ [Stage 1: Ingress Authentication (<0.05ms)]
    │     ├── API Key SHA-256 hash check with crypto.timingSafeEqual
    │     └── IAM JWT token signature & claims verification
    │
    ├─▶ [Stage 2: Emergency Kill Switch Barrier (<0.01ms)]
    │     ├── Check in-memory Global Lockdown flag
    │     └── Check Org-scoped Kill Switch state
    │     └── If engaged: Drop traffic with HTTP 503 KILL_SWITCH_ACTIVE
    │
    ├─▶ [Stage 3: Sliding-Window Rate Limiting (<0.10ms)]
    │     ├── Redis atomic sliding-window counter (with local fallback)
    │     └── If quota exceeded: Return HTTP 429 RATE_LIMIT_EXCEEDED
    │
    ├─▶ [Stage 4: Identity & Network Context Extraction (<0.02ms)]
    │     ├── Extract Client IP (X-Forwarded-For, X-Real-IP, socket)
    │     ├── Extract User Email & Identity (Clerk JWT or X-User-Email)
    │     ├── Extract Client Hostname (X-Client-Hostname) & Session ID
    │     └── Resolve destination downstream host
    │
    ├─▶ [Stage 5: SSRF Boundary Validation (<0.05ms)]
    │     ├── Reject Loopback (127.0.0.1, [::1])
    │     ├── Reject Cloud Metadata (169.254.169.254, [fd00:ec2::254])
    │     ├── Reject RFC 1918 Private Ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    │     └── Reject Decimal/Hex IP encodings and Wildcard DNS rebinding
    │
    ├─▶ [Stage 6: In-Flight DLP Sanitization (<0.10ms)]
    │     ├── Shannon entropy scanning (detect high-entropy keys >= 4.5)
    │     ├── Luhn Mod-10 credit card validation & redaction
    │     └── Unicode NFKC normalization and zero-width char stripping
    │
    ├─▶ [Stage 7: In-Memory AST Policy Evaluation (<0.20ms)]
    │     ├── Evaluate dot-path field extractors
    │     ├── Compare against operators (EQUALS, REGEX, NUMERIC, ENUM)
    │     └── Determine Verdict: ALLOW, BLOCK, or REQUIRE_APPROVAL
    │
    ├─▶ [Stage 8: Upstream Forwarding & Key Injection]
    │     ├── Strip agent dummy token
    │     ├── Inject enterprise production vault key
    │     └── Forward sanitized payload downstream
    │
    └─▶ [Stage 9: Asynchronous Telemetry & Audit Dispatch]
          ├── Emit AuditStreamEvent to Kafka (x4g4t.audit.stream)
          ├── Push to Redis Stream (x4g4t:buffer:audit)
          └── Ship GELF 1.1 frame to Graylog over UDP :12201
```

---

## 2. Server-Sent Events (SSE) Token Streaming & TTFT

When an agent requests a streaming response (`stream: true` on `/v1/gateway/execute` or streaming LLM completions), X4G4T operates as a transparent, state-aware proxy:

### Time to First Token (TTFT) Metrics
1. **$T_0$ (Client Request Initiated):** The exact moment the client opens the HTTP connection.
2. **$\Delta T_{\text{policy}}$ (Policy Engine Resolution):** Time taken to authenticate, evaluate AST policies, and verify DLP before contacting the upstream server (guaranteed $\le 15\text{ms}$, typically $<1\text{ms}$).
3. **TTFT (Time to First Token):** The duration from $T_0$ until the first SSE chunk (`data: {"choices": ...}`) is received from the upstream model and forwarded to the client.
4. **$T_{\text{end}}$ (Stream Completion):** Total duration of the token generation session.

### Active Session Tracking & Mid-Flight Severing
X4G4T maintains an in-memory registry of active streaming connections:
- Each streaming connection registers an `ActiveStreamSession` linked to an `AbortController`.
- **Emergency Severing:** If an emergency kill switch is triggered or a DLP breach is detected in the stream, `severAllActiveStreams()` executes across all active streams within **$\le 5\text{ms}$**, instantly aborting the upstream connection and severing the client socket with zero residual token leakage.

---

## 3. End-to-End Identity Traceability on Long-Lived Connections

On long-lived SSE connections and multi-turn agent sessions, X4G4T maintains cryptographic identity binding across the entire lifecycle:

```typescript
export interface ExecutionContext {
  orgId: string;
  agentId: string;
  iam: {
    userId: string;
    roles: string[];
    groups: string[];
    userEmail?: string;
    userName?: string;
  };
  network: {
    sourceIp: string;
    destinationHost: string;
    clientHostname?: string;
    sessionId?: string;
  };
}
```

- **Client IP Extraction:** Reliably resolves original caller IP from reverse proxy headers (`X-Forwarded-For`, `X-Real-IP`) or raw socket connections.
- **Enterprise Session ID:** The `X-Session-ID` header binds multiple consecutive tool calls to a single unified agent trajectory.
- **Auditable User Attribution:** Even when autonomous agents execute unattended tasks, every emitted Kafka event ties the action back to the human developer or service account who provisioned the session.
