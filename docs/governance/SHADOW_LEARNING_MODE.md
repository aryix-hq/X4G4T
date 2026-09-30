# Shadow Mode & Autonomous Policy Mining

## 1. Counterfactual Non-Interference Principle

Deploying strict security policies into production risks breaking mission-critical autonomous agent workflows. To eliminate false-positive operational downtime, X4G4T features **Shadow / Learning Mode**:

- **Evaluation Invariant:** When a policy is configured in `mode: "SHADOW"`, the policy engine evaluates inbound tool calls against the rule graph in parallel with the hot-path.
- **Counterfactual Telemetry:** If a rule matches, the gateway **never** drops or halts live traffic. Instead, the request proceeds downstream normally (`ALLOW`), while a counterfactual event (`verdict: "SHADOW_BLOCKED"`) is emitted to the audit log.
- **Zero Live Interference:** SecOps teams can observe policy impact over days or weeks before flipping the switch to `ACTIVE`.

---

## 2. ML Policy Mining Engine (:5001)

The **X4G4T Intelligence Plane** runs as an out-of-band microservice (`apps/proxy/src/workers/ml-miner.ts` and port `:5001`):

```
  Live Execution Traffic
         │
         ▼
  [Data Plane Proxy] ──▶ Records sample buffers to Redis / Memory
                                    │
                                    ▼
                      [ML Mining Daemon (:5001)]
                                    │
     ┌──────────────────────────────┼──────────────────────────────┐
     ▼                              ▼                              ▼
 [Quantile Math]            [Categorical Frequency]       [Drift Detection]
 Calculate P50, P90, P99    Discover valid enums          Flag anomalous parameter
 distribution of arguments  and string whitelists         variations
     │                              │                              │
     └──────────────────────────────┼──────────────────────────────┘
                                    │
                                    ▼
                    [Auto-Synthesized Candidate Policy]
                    "Ceiling Rule: P99 x 1.15 Limit"
```

### Statistical Rule Synthesis
1. **Numeric Parameter Ceilings:**  
   Computes the 99th percentile ($P_{99}$) of numeric fields (e.g., `refund_amount`, `transfer_tokens`) over rolling 7-day windows and synthesizes a guardrail:
   $$\text{Threshold}_{\text{safe}} = P_{99} \times 1.15$$
2. **Discrete Enum Whitelists:**  
   Collects discrete string values passed to tool parameters (e.g., `table_name`, `environment`) and generates `IN_LIST` policies allowing only verified safe values.
3. **Draft Promotion:**  
   Recommended policies appear in the Next.js Web Console (`/dashboard/policies`) where administrators can review, simulate, and approve them with one click.
