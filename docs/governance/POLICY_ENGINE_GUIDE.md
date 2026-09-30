# Policy Engine Reference & Operator Guide

## 1. Abstract Syntax Tree (AST) Evaluator Overview

The **X4G4T Policy Engine** (`@x4g4t/policy-engine`) is an ultra-fast, deterministic evaluation engine designed to run entirely in process memory. It evaluates complex guardrails against structured tool call arguments in **<0.2 milliseconds**.

---

## 2. Policy Data Structure

Policies are authored as declarative JSON objects and compiled into optimized evaluation graphs:

```typescript
export interface CompiledPolicy {
  id: string;
  name: string;
  targetTool: string; // e.g. "database_query", "run_terminal_command", or "*"
  actionOnMatch: "BLOCK" | "REQUIRE_APPROVAL";
  rules: PolicyRule[];
  rateLimit?: RateLimitConfig;
}

export interface PolicyRule {
  id: string;
  fieldPath: string; // Deep dot-path (e.g., "query", "metadata.amount")
  operator: PolicyOperator;
  targetValue: unknown;
}
```

---

## 3. Supported Rule Operators

| Operator | Type | Description | Example Target Value |
| :--- | :--- | :--- | :--- |
| `EQUALS` | Primitive | Strict equality comparison | `"production"` |
| `NOT_EQUALS` | Primitive | Inverse equality check | `"test"` |
| `CONTAINS` | String/Array | Substring or array item containment | `"DROP TABLE"` |
| `REGEX` | String Pattern | Regular expression matching (case-insensitive flag `(?i)` supported) | `"(?i)(DROP\|TRUNCATE)\s+TABLE"` |
| `NUMERIC_GT` | Numeric | Greater than ($>$) comparison | `10000` |
| `NUMERIC_LT` | Numeric | Less than ($<$) comparison | `5` |
| `NUMERIC_GTE`| Numeric | Greater than or equal to ($\ge$) | `500` |
| `NUMERIC_LTE`| Numeric | Less than or equal to ($\le$) | `100` |
| `IN_LIST` | Set Membership | Value must exist in specified array | `["SELECT", "SHOW", "DESCRIBE"]` |
| `NOT_IN_LIST`| Set Exclusion | Value must NOT exist in specified array | `["DROP", "DELETE", "TRUNCATE"]` |
| `COMPOUND_AND`| Boolean Logic | All sub-rules must match | Sub-rules array |
| `COMPOUND_OR` | Boolean Logic | At least one sub-rule must match | Sub-rules array |

---

## 4. Deep Dot-Path Extraction

The policy engine resolves deeply nested object paths and array elements without throwing runtime exceptions:

- **Nested Object Paths:** `transaction.metadata.recipient.account_id`
- **Array Indices:** `batch_requests.0.payment_amount`
- **Missing / Undefined Paths:** Evaluates safely to `undefined` without throwing `TypeError`, defaulting to non-match.

---

## 5. Sliding-Window Rate Limiting

X4G4T implements a high-precision sliding-window rate limiter (backed by Redis `ZADD`/`ZREMRANGEBYSCORE` or local atomic token buckets):

```typescript
export interface RateLimitConfig {
  maxRequests: number; // e.g. 100 requests
  windowSeconds: number; // e.g. 60 seconds
  scope: "ORG" | "AGENT" | "TOOL";
}
```

### RFC 6585 Headers
When an agent exceeds its quota, the gateway rejects the request with **HTTP 429 Too Many Requests** and returns standard compliance headers:
- `Retry-After: 42`
- `X-RateLimit-Limit: 100`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: 1790763400`
