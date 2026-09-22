# X4G4T: API Reference & Protocol Contracts

This document contains the complete API reference for X4G4T, covering the Gateway Execution Endpoint, MCP Router, HITL Polling Endpoint, and Slack Webhook receiver.

---

## 1. Authentication & Common Headers

The X4G4T Centralized Gateway supports **Dual-Mode Authentication**:
1. **Static API Keys:** `Authorization: Bearer sec_live_<token>` (256-bit entropy SHA-256 hashed token).
2. **Enterprise IAM JWTs:** `Authorization: Bearer eyJ...` (standard OIDC/JWT issued by Clerk, WorkOS, Okta, AWS Cognito, Azure AD / Microsoft Entra ID).

| Header | Type | Description | Mandatory |
| :--- | :--- | :--- | :--- |
| `Authorization` | String | Format: `Bearer sec_live_<token>` or `Bearer <IAM_JWT>` | Yes |
| `X-Agent-Id` | String | Unique identifier for the calling agent (max 128 chars) | Yes |
| `x-iam-roles` | String | Comma-separated IAM roles (e.g. `engineering,finance-admin`) | No |
| `x-iam-groups` | String | Comma-separated IAM groups (e.g. `core-platform,security`) | No |
| `x-iam-user-id` | String | Authenticated IAM user identifier (e.g. `usr_123`) | No |
| `Idempotency-Key` | String | UUID v4 to prevent duplicate mutations | No |
| `Content-Type` | String | `application/json` | Yes |

---

## 2. Gateway Execution Endpoint

### `POST /v1/gateway/execute`
Intercepts an autonomous agent tool call, evaluates active security policies (including IAM role/group restrictions), vaults downstream credentials, proxies compliant calls to the target downstream service, and records execution audit telemetry.

#### Zero-Trust Credential Vaulting:
The calling agent passes `downstream_url` and optional `downstream_headers` (or X4G4T injects vaulted secrets). Downstream credentials are never exposed back to the LLM agent.

#### Request Body
```json
{
  "agent_id": "customer-support-agent-v2",
  "tool_name": "issue_refund",
  "arguments": {
    "amount": 150,
    "user_id": "usr_9921",
    "reason": "Damaged goods returned"
  },
  "downstream_url": "https://api.stripe.com/v1/refunds",
  "downstream_headers": {
    "Authorization": "Bearer rk_live_enterprise_key"
  }
}
```

#### Responses

##### `200 OK` (Policy Passed - Proxied Response)
Returns the raw response payload and status from the downstream target.

##### `202 Accepted` (Policy Action: `REQUIRE_APPROVAL` / HELD)
Returned when a tool execution triggers a high-impact policy requiring human intervention.
```json
{
  "status": "HELD",
  "hold_id": "c7a8e23b-5d91-4c12-9844-329b119102ab",
  "message": "Operation requires human intervention. Poll or wait for webhook resolution.",
  "retry_after_sec": 5
}
```

##### `422 Unprocessable Entity` (Policy Action: `BLOCK`)
Returned when an argument breaches an active deterministic rule constraint.
```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Tool argument 'amount' exceeded threshold limit of $250.",
    "details": {
      "tool": "issue_refund",
      "policy_id": "pol_c88219ab",
      "rule_id": "rule_11928374"
    }
  }
}
```

##### `504 Gateway Timeout`
Returned when the downstream target API fails to respond within the 8000ms deadline.
```json
{
  "error": {
    "code": "DOWNSTREAM_TIMEOUT",
    "message": "Downstream target exceeded 8000ms deadline."
  }
}
```

##### `502 Bad Gateway`
Returned when a network connectivity failure prevents reaching the downstream target.
```json
{
  "error": {
    "code": "BAD_GATEWAY",
    "message": "Failed connecting to downstream endpoint."
  }
}
```

---

## 3. Model Context Protocol (MCP) Router

### `POST /v1/gateway/mcp`
Inspects standard Model Context Protocol JSON-RPC 2.0 frames for `tools/call`. Pass-through lifecycle queries (`tools/list`, `initialize`) are routed directly upstream without policy evaluation.

#### Required Headers
- `Authorization: Bearer sec_live_...`
- `X-Target-MCP-URL: https://mcp-server.internal.corp/rpc`
- `X-Agent-Id: claude-desktop-or-cursor`

#### Request Body (`tools/call`)
```json
{
  "jsonrpc": "2.0",
  "id": 101,
  "method": "tools/call",
  "params": {
    "name": "run_sql_query",
    "arguments": {
      "query": "DROP TABLE customers;"
    }
  }
}
```

#### Responses

##### Blocked by Policy (`-32001`)
```json
{
  "jsonrpc": "2.0",
  "id": 101,
  "error": {
    "code": -32001,
    "message": "Execution blocked by policy: Triggered policy 'Catch Table Drops' for tool 'run_sql_query'",
    "data": {
      "tool": "run_sql_query",
      "policyId": "pol_sql_guard",
      "ruleId": "rule_drop_regex"
    }
  }
}
```

##### Held for Approval
```json
{
  "jsonrpc": "2.0",
  "id": 101,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[AgentGuard HELD] Action requires human verification. Reviewers alerted via Slack."
      }
    ],
    "isError": true
  }
}
```

---

## 4. Polling Endpoint for Suspended Agents

### `GET /v1/gateway/hitl/:holdId`
Agents suspended with a `202 Accepted` response poll this endpoint using their assigned `hold_id` until an operator resolves the task.

#### Response: Pending
```json
// HTTP 202 Accepted
{
  "status": "PENDING",
  "retry_after_sec": 5
}
```

#### Response: Resolved
```json
// HTTP 200 OK
{
  "status": "APPROVED",
  "reviewer": "U08219482",
  "resolved_at": "2026-09-19T10:15:32.112Z"
}
```

---

## 5. Slack Webhook Receiver

### `POST /api/slack/interactive`
Receives url-encoded Slack Block Kit interaction payloads when an operator clicks "Approve Execution" or "Reject / Terminate" on an alert card.

#### Response: In-Channel Card Replacement
```json
{
  "replace_original": true,
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Status:* ✅ *APPROVED*\n*Reviewer:* <@U08219482>\n*Hold ID:* `c7a8e23b-5d91-4c12-9844-329b119102ab`"
      }
    }
  ]
}
```

