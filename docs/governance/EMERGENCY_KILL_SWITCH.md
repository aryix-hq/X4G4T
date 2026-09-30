# Emergency Air-Gap Kill Switch & Bilateral Severance

## 1. Zero-Trust Bilateral Drop Invariant

In the event of an active red-team breach, zero-day prompt injection compromise, or rogue agent behavior, security operators require an immediate, unambiguous kill mechanism:

- **Bilateral Enforcement:** When engaged, the kill switch drops both **inbound agent requests** and **outbound tool executions** instantly.
- **Fail-Closed Guarantee:** Every gateway route defaults to `HTTP 503 Service Unavailable` with error code `KILL_SWITCH_ACTIVE`.
- **Latency Budget:** In-memory kill switch verification executes in **$<0.01\text{ms}$** at the very top of the gateway request pipeline.

---

## 2. Distributed Synchronization & Local Memory Caching

To guarantee sub-millisecond evaluation across distributed gateway replicas:

```
  Next.js Console / Admin API
             │
      (2FA TOTP Verified)
             │
             ▼
  [Redis Distributed Key]
  SET killswitch:org:<orgId> ACTIVE
  PUBLISH killswitch:events "LOCKDOWN"
             │
             ├──────────────────────────┐
             ▼                          ▼
    [Proxy Node 01]            [Proxy Node 02]
    • Redis Pub/Sub listener   • Redis Pub/Sub listener
    • In-memory local cache    • In-memory local cache
    • Zero DB latency          • Zero DB latency
```

1. **Local Hot-Path Memory Cache:** The proxy checks an atomic in-memory Map before querying any network socket.
2. **Redis Distributed Pub/Sub:** Engaging the kill switch broadcasts an invalidation signal to all running Fastify proxy replicas.
3. **Partition Survivability:** If Redis becomes unreachable, the proxy preserves the last known lockdown state and defaults to fail-closed.

---

## 3. Sub-5ms Active Stream Severing

Unlike standard REST proxies that only block future requests, X4G4T tracks all currently open Server-Sent Events (SSE) connections in an active session registry:

- When the kill switch is triggered, `severAllActiveStreams()` iterates across all active sessions.
- Triggers `AbortController.abort()` on upstream sockets.
- Closes downstream client connections in **$\le 5\text{ms}$**, preventing any in-flight tokens from reaching the client.

---

## 4. Two-Factor Authentication (RFC 6238 TOTP) Enforcement

To prevent unauthorized tampering or denial-of-service by malicious actors:
- Engaging or lifting the kill switch requires a valid 6-digit Time-Based One-Time Password (TOTP) conforming to RFC 6238.
- Validated via `verifyTwoFactorCode(code, secret)`.
- Critical audit events are immediately dispatched to Kafka topic `x4g4t.audit.stream`.
