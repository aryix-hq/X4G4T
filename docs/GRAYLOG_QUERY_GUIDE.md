# Graylog 6.0 Security Telemetry & Policy Query Guide

This operational guide provides the exact Lucene query syntax and instructions for debugging guardrail policies, shadow learning mode evaluations, and caller telemetry in Graylog 6.0.

---

## 1. Graylog Architecture & Telemetry Pipeline

X4G4T ingests every incoming agent execution, LLM call, and container runtime event into Graylog via high-throughput GELF streams:

```
[ Client Pod / Agent ] ──▶ [ X4G4T Proxy (:4000) ] ──▶ [ Evaluator (<1ms) ]
                                    │
                                    ├──▶ [ GELF UDP Forwarder (:5150) ] ──▶ [ Graylog Server (:9000 / UDP :12201) ]
                                    │                                                      │
                                    └──▶ [ Kafka Topic: x4g4t.audit.stream ]               ▼
                                                                                   [ OpenSearch 2.13 (:9200) ]
```

* **Graylog Web Console**: `http://localhost:9000`
* **Default Credentials**: `admin` / `admin`
* **Search API Endpoint**: `GET /api/search/universal/relative`
* **GELF Input Port**: UDP `12201`

---

## 2. Indexed Policy & Audit Schema Fields

Graylog strips leading underscores from GELF fields upon indexing. You can query against any of the following fields in the Graylog search bar:

| Field Name | Type | Description | Example Values |
| :--- | :--- | :--- | :--- |
| `verdict` | String | Execution security disposition | `PASSED`, `BLOCKED`, `HELD` |
| `mode` | String | Rule operational enforcement mode | `ACTIVE`, `SHADOW_LEARN`, `DISABLED` |
| `tool_name` | String | Target agent tool or LLM action | `issue_refund`, `run_sql_query`, `cloud_instance_provision`, `llm_generate` |
| `triggered_policy_id` | String | ID of the guardrail policy matched | `pol_refund_ceiling`, `pol_sql_guard`, `pol_ad6256a3` |
| `policy_name` | String | Human-readable policy title | `Enforce Max Refund Threshold ($250)` |
| `status_code` | Integer | HTTP response status code | `200` (Allowed), `422` (Blocked), `503` (Air-gap Kill Switch) |
| `agent_id` | String | Autonomous agent client ID | `autonomous_client_pod`, `finance-bot` |
| `client_ip` | String | Originating client IP address | `192.168.1.150`, `172.64.150.54` |
| `client_hostname` | String | Hostname of caller workstation | `proxy`, `agent-workstation-01` |
| `user_email` | String | Authenticated principal identity | `key_seed_default`, `developer@company.com` |
| `latency_ms` | Number | Microsecond proxy evaluation duration | `4`, `9`, `12` |
| `arguments` | String/JSON | Sanitized tool execution payload | `{"amount": 500, "currency": "USD"}` |
| `source` | String | Telemetry emitter identity | `x4g4t-gateway`, `x4g4t-proxy` |
| `container_name` | String | Docker container name | `x4g4t-proxy`, `b1201d87bad0_x4g4t-ml-service` |

---

## 3. Practical Copy-Pasteable Graylog Lucene Queries

### A. Debugging Allowed vs. Blocked Requests

#### 1. Find all blocked violations (HTTP 422):
```lucene
verdict:BLOCKED
```
*Or by HTTP status code:*
```lucene
status_code:422
```

#### 2. Find all passed / compliant executions (HTTP 200):
```lucene
verdict:PASSED
```

#### 3. Find Human-in-the-Loop (HITL) held executions:
```lucene
verdict:HELD
```

---

### B. Debugging Shadow Learning Mode

In Shadow Learning Mode, policies evaluate live traffic counterfactually without blocking the agent. Graylog captures these events with `mode:SHADOW_LEARN`:

#### 1. View all evaluations evaluated in Shadow Learning Mode:
```lucene
mode:SHADOW_LEARN
```

#### 2. Identify requests that **would have been blocked** if promoted to active:
```lucene
mode:SHADOW_LEARN AND verdict:BLOCKED
```

#### 3. Trace shadow evaluations for a specific tool:
```lucene
mode:SHADOW_LEARN AND tool_name:issue_refund
```

#### 4. Filter shadow evaluations by candidate policy ID:
```lucene
mode:SHADOW_LEARN AND triggered_policy_id:"pol_shadow_cloud_cap"
```

---

### C. Querying by Policy ID & Policy Name

#### 1. Query by unique policy ID:
```lucene
triggered_policy_id:"pol_sql_guard" OR policy_id:"pol_sql_guard"
```

#### 2. Query by exact phrase or wildcard:
```lucene
triggered_policy_id:"pol_*"
```

#### 3. Find all events matching a policy name:
```lucene
policy_name:"*Refund Threshold*"
```

---

### D. Network, Subnet & Identity Forensic Audits

#### 1. Trace all requests originating from a specific IP:
```lucene
client_ip:"192.168.1.150"
```

#### 2. Trace all requests originating from an IP subnet (CIDR / Wildcard):
```lucene
client_ip:192.168.1.*
```

#### 3. Trace actions performed by a specific user / email:
```lucene
user_email:"key_seed_default"
```

#### 4. Trace high-latency proxy invocations (>10ms):
```lucene
latency_ms:>10
```

---

### E. Emergency Air-Gap Kill Switch Telemetry

When the master bilateral air-gap kill switch is engaged, proxy drops all ingress/egress with HTTP 503:

#### 1. Find all requests severed by the kill switch:
```lucene
status_code:503 OR message:"*AI_LOCKDOWN_ACTIVE*"
```

---

### F. Combined Complex Security Queries

#### 1. High-value refund attempts originating from untrusted networks:
```lucene
tool_name:issue_refund AND verdict:BLOCKED AND NOT client_ip:192.168.1.*
```

#### 2. Destructive SQL attempts blocked across all agents:
```lucene
tool_name:run_sql_query AND verdict:BLOCKED
```

---

## 4. Launching Graylog Directly from X4G4T UI

The X4G4T dashboard features integrated shortcuts that pre-populate the exact Graylog search query:

1. **Policies Tab (`/dashboard/policies`)**: Click the cyan **`Graylog Trail`** button on any policy card to open Graylog 6.0 with `triggered_policy_id:"<id>" OR policy_id:"<id>"`.
2. **Learning Mode Tab (`/dashboard/policies`)**: Click **`Search in Graylog`** on any shadow rule or **`Execute in Graylog Console`** in the query sandbox.
3. **Advanced Policy Creator**: Click **`Test in Graylog`** next to the AST syntax preview to run your generated boolean Lucene query.
4. **Audit Logs Stream (`/dashboard/logs`)**: Click **`Open in Graylog Web Console`** or use the quick filter buttons to inspect universal relative streams.

---

## 5. Direct Graylog URL Format Reference

You can construct direct deep links to Graylog search:

```
http://localhost:9000/search?q=<ENCODED_LUCENE_QUERY>&rangetype=relative&relative=86400
```

* `rangetype=relative`: Uses sliding window relative time.
* `relative=86400`: 24-hour lookback window (or `3600` for 1 hour, `604800` for 7 days).
* `q`: URL-encoded Lucene query string.
