# X4G4T Policy Guide: Rules, Guardrails & Governance for AI Agents

Welcome to the **X4G4T Policy Guide**. This guide explains how to define, configure, and maintain defense-grade security policies for autonomous AI agents, coding assistants, and automated tool-calling pipelines.

Whether you are a security engineer, platform architect, or development lead, this document translates complex AST evaluation logic into intuitive, plain-English concepts.

---

## 1. How Policies Work: Real-World Analogies

To understand how X4G4T evaluates tool execution requests, think of five familiar everyday systems:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           THE X4G4T GAUNTLET                            │
│                                                                         │
│   Agent Request                                                         │
│        │                                                                │
│        ▼                                                                │
│   [ 1. Airport Scanner ]   ───► Evaluates tool arguments & AST rules    │
│        │                                                                │
│        ▼                                                                │
│   [ 2. Water Meter ]       ───► Enforces sliding-window rate limits     │
│        │                                                                │
│        ▼                                                                │
│   [ 3. Blackout Marker ]   ───► Scans & redacts sensitive secrets (DLP) │
│        │                                                                │
│        ▼                                                                │
│   [ 4. Manager's Signature]───► Holds high-risk actions for human review│
│        │                                                                │
│        ▼                                                                │
│   [ 5. Circuit Breaker ]   ───► Emergency kill-switch instant air-gap   │
│        │                                                                │
│        ▼                                                                │
│   Downstream Execution (OpenAI, Anthropic, Internal DB)                 │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Airport Security Scanner (Policy AST Engine):** Inspects the contents of every tool call luggage (arguments, parameters, and metadata) before it boards the downstream network.
2. **Water Meter (Sliding-Window Rate Limiter):** Measures usage over time (e.g., 100 calls per minute) to ensure an agent does not run away with an infinite recursive loop or blow corporate API budgets.
3. **Blackout Marker (DLP Secret Redaction):** Automatically detects sensitive tokens (AWS credentials, OpenAI keys, credit cards, SSNs) and blanks them out before transmission.
4. **Manager's Signature (Human-in-the-Loop Approvals):** When an agent wants to perform a high-stakes action (e.g., a wire transfer over $500), execution halts safely until a designated human approves via Slack or the Web Dashboard.
5. **Electrical Circuit Breaker (Global & Org Kill Switches):** In the event of a compromised agent or security incident, trips instantly in under 5ms, dropping all active streaming sessions and denying ingress.

---

## 2. Policy Modes: Active, Shadow, and Disabled

Every policy in X4G4T operates in one of three modes:

| Mode | Real-World Equivalent | What Happens |
| :--- | :--- | :--- |
| **`ENFORCE` (Active)** | Active Security Guard | The policy blocks or holds violating requests immediately. |
| **`SHADOW_LEARN` (Shadow)** | Security Trainee Taking Notes | The policy evaluates silently in the background. It records what it **would** have done (`SHADOW_BLOCKED`) to telemetry without interfering with live developer traffic. |
| **`DISABLED`** | Deactivated Alarm | The policy is completely bypassed during evaluation to conserve CPU cycles. |

---

## 3. Action Precedence: How Conflicts Are Resolved

When multiple policies apply to the same tool call, X4G4T applies **strict fail-closed precedence**:

$$\text{BLOCK} \succ \text{REQUIRE\_APPROVAL} \succ \text{ALLOW}$$

- If **any** active rule evaluates to `BLOCK`, the request is rejected immediately with HTTP 403 / 422.
- If no rules block, but at least one rule evaluates to `REQUIRE_APPROVAL`, the request enters a cryptographic hold (`202 Accepted`) awaiting human review.
- If all applicable rules evaluate to `ALLOW` (or no rules match), the request is forwarded downstream.

---

## 4. Real-World Policy Templates

Below are four battle-tested policy configurations you can deploy immediately.

### Template 1: Financial Wire & Refund Safeguard
**Objective:** Hold any customer refund or wire transfer greater than \$500 for supervisor sign-off.

```json
{
  "name": "Refund Cap Protection",
  "targetTool": "issue_refund",
  "actionOnMatch": "REQUIRE_APPROVAL",
  "mode": "ACTIVE",
  "matchLogic": "AND",
  "rules": [
    {
      "fieldPath": "amount",
      "operator": "GREATER_THAN",
      "targetValue": "500"
    }
  ]
}
```

### Template 2: Destructive Database Guard
**Objective:** Block agents from issuing `DROP TABLE`, `TRUNCATE`, or `ALTER TABLE` commands against production databases.

```json
{
  "name": "Destructive SQL Blocker",
  "targetTool": "execute_sql_query",
  "actionOnMatch": "BLOCK",
  "mode": "ACTIVE",
  "matchLogic": "OR",
  "rules": [
    {
      "fieldPath": "query",
      "operator": "REGEX",
      "targetValue": "(?i)\\b(DROP|TRUNCATE|ALTER)\\s+(TABLE|DATABASE|SCHEMA)\\b"
    },
    {
      "fieldPath": "query",
      "operator": "REGEX",
      "targetValue": "(?i)\\bDELETE\\s+FROM\\s+\\w+\\s*(;|$)"
    }
  ]
}
```

### Template 3: Secret File & Environment Exfiltration Guard
**Objective:** Prevent code-generation agents from reading sensitive system paths or credentials.

```json
{
  "name": "Sensitive File Exfiltration Shield",
  "targetTool": "read_file",
  "actionOnMatch": "BLOCK",
  "mode": "ACTIVE",
  "matchLogic": "OR",
  "rules": [
    {
      "fieldPath": "path,file_path",
      "operator": "REGEX",
      "targetValue": "(\\.env|id_rsa|id_ed25519|/etc/passwd|/etc/shadow|\\.aws/credentials)"
    }
  ]
}
```

### Template 4: Country Sanctions & Geographic Guard
**Objective:** Automatically reject financial transactions or resource provisioning targeted at sanctioned jurisdictions.

```json
{
  "name": "Sanctioned Countries Ingress Filter",
  "targetTool": "transfer_funds",
  "actionOnMatch": "BLOCK",
  "mode": "ACTIVE",
  "matchLogic": "AND",
  "rules": [
    {
      "fieldPath": "recipient_country",
      "operator": "IN",
      "targetValue": "KP,IR,SY,CU"
    }
  ]
}
```

---

## 5. Supported Rule Operators

| Operator | Comparison Type | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `EQUALS` | String / Strict Equality | `admin` | Exact match comparison |
| `NOT_EQUALS` | Inversion Equality | `guest` | Matches if attribute differs |
| `GREATER_THAN` | Numeric Comparison | `500` | True if numeric argument $> 500$ |
| `LESS_THAN` | Numeric Comparison | `10` | True if numeric argument $< 10$ |
| `GTE` / `GREATER_THAN_OR_EQUAL` | Numeric Comparison | `100` | Greater than or equal to |
| `LTE` / `LESS_THAN_OR_EQUAL` | Numeric Comparison | `50` | Less than or equal to |
| `CONTAINS` | Substring Match | `secret` | Case-insensitive substring scan |
| `REGEX` | Regular Expression | `(?i)password` | Pattern-based evaluation with ReDoS protection |
| `IN` | Comma-delimited Set | `US,CA,GB,DE` | Set membership verification |

---

## 6. Best Practices for Production Governance

1. **Start in `SHADOW_LEARN` Mode:** When introducing a new guardrail, run it in shadow mode for 7 days. Inspect Graylog telemetry and the ML Mining dashboard to verify you don't break legitimate workflows.
2. **Use Compound Logic (`matchLogic`):** Set `matchLogic: "OR"` when blocking multiple independent risk patterns, and `matchLogic: "AND"` when constraining multiple attributes simultaneously.
3. **Always Configure Timeouts on HITL:** Approvals hold execution requests in memory for up to 15 minutes. Ensure your Slack notification channel is staffed with active on-call reviewers.
