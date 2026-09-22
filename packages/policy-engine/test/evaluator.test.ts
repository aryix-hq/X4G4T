import { describe, it, expect } from "vitest";
import {
  evaluateAgentExecution,
  computeLogRecordHash,
  verifyLogHashChain
} from "../src/evaluator.js";
import { CompiledPolicy, LogRecordToHash } from "../src/types.js";

describe("Policy Engine Evaluation", () => {
  const mockPolicies: CompiledPolicy[] = [
    {
      id: "pol_refund_limit",
      name: "Max Refund Cap",
      targetTool: "issue_refund",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_amount_gt_250",
          fieldPath: "amount",
          operator: "GREATER_THAN",
          targetValue: "250"
        }
      ]
    },
    {
      id: "pol_hitl_payout",
      name: "Require Approval For Large Vendor Payout",
      targetTool: "vendor_payout",
      actionOnMatch: "REQUIRE_APPROVAL",
      rules: [
        {
          id: "rule_nested_total",
          fieldPath: "transaction.total",
          operator: "GREATER_THAN_OR_EQUAL",
          targetValue: "1000"
        },
        {
          id: "rule_currency",
          fieldPath: "transaction.currency",
          operator: "EQUALS",
          targetValue: "USD"
        }
      ]
    },
    {
      id: "pol_sql_guard",
      name: "Catch Table Drops",
      targetTool: "run_sql_query",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_drop_regex",
          fieldPath: "query",
          operator: "REGEX",
          targetValue: "(?i)DROP\\s+TABLE"
        }
      ]
    },
    {
      id: "pol_role_restriction",
      name: "Restrict Sensitive Roles",
      targetTool: "*",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_in_roles",
          fieldPath: "requestedRole",
          operator: "IN",
          targetValue: "superadmin,root,owner"
        }
      ]
    },
    {
      id: "pol_iam_contractor_block",
      name: "Block Contractors from SQL",
      targetTool: "execute_sql",
      actionOnMatch: "BLOCK",
      rules: [
        {
          id: "rule_iam_contractor",
          fieldPath: "iam.roles",
          operator: "CONTAINS",
          targetValue: "contractor"
        }
      ]
    },
    {
      id: "pol_iam_group_approval",
      name: "Require Approval for Interns",
      targetTool: "wire_transfer",
      actionOnMatch: "REQUIRE_APPROVAL",
      rules: [
        {
          id: "rule_iam_intern_group",
          fieldPath: "iam.groups",
          operator: "CONTAINS",
          targetValue: "interns"
        }
      ]
    }
  ];

  it("should ALLOW tool call when arguments remain within bounds", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "issue_refund",
      arguments: { amount: 150, customerId: "cust_123" }
    });
    expect(result.verdict).toBe("ALLOW");
    expect(result.matchedPolicyId).toBeUndefined();
    expect(result.latencyMs).toBeLessThan(10);
  });

  it("should BLOCK tool call when single rule threshold is breached", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "issue_refund",
      arguments: { amount: 500, customerId: "cust_123" }
    });
    expect(result.verdict).toBe("BLOCK");
    expect(result.matchedPolicyId).toBe("pol_refund_limit");
    expect(result.violatingRuleId).toBe("rule_amount_gt_250");
  });

  it("should correctly handle nested paths and trigger REQUIRE_APPROVAL", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "vendor_payout",
      arguments: {
        vendorId: "v_999",
        transaction: {
          total: 1500,
          currency: "USD"
        }
      }
    });
    expect(result.verdict).toBe("REQUIRE_APPROVAL");
    expect(result.matchedPolicyId).toBe("pol_hitl_payout");
  });

  it("should not trigger AND rule if one nested condition fails", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "vendor_payout",
      arguments: {
        vendorId: "v_999",
        transaction: {
          total: 1500,
          currency: "EUR" // Does not match USD
        }
      }
    });
    expect(result.verdict).toBe("ALLOW");
  });

  it("should BLOCK malicious queries via REGEX", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "run_sql_query",
      arguments: { query: "DROP TABLE users;" }
    });
    expect(result.verdict).toBe("BLOCK");
    expect(result.matchedPolicyId).toBe("pol_sql_guard");
  });

  it("should match wildcard target tools with IN operator", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "grant_user_permission",
      arguments: { requestedRole: "root", userId: "usr_42" }
    });
    expect(result.verdict).toBe("BLOCK");
    expect(result.matchedPolicyId).toBe("pol_role_restriction");
  });

  it("should BLOCK when IAM roles contain restricted role (e.g. contractor)", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "execute_sql",
      arguments: { query: "SELECT * FROM users;" },
      iam: {
        userId: "usr_ext_1",
        roles: ["contractor", "analyst"],
        groups: ["external"]
      }
    });
    expect(result.verdict).toBe("BLOCK");
    expect(result.matchedPolicyId).toBe("pol_iam_contractor_block");
  });

  it("should ALLOW when IAM roles do not contain restricted role", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "execute_sql",
      arguments: { query: "SELECT * FROM users;" },
      iam: {
        userId: "usr_int_1",
        roles: ["employee", "engineer"],
        groups: ["internal"]
      }
    });
    expect(result.verdict).toBe("ALLOW");
  });

  it("should REQUIRE_APPROVAL when IAM groups contain 'interns'", () => {
    const result = evaluateAgentExecution(mockPolicies, {
      toolName: "wire_transfer",
      arguments: { amount: 500, recipient: "Acme" },
      iam: {
        userId: "usr_intern_1",
        roles: ["intern"],
        groups: ["interns", "finance"]
      }
    });
    expect(result.verdict).toBe("REQUIRE_APPROVAL");
    expect(result.matchedPolicyId).toBe("pol_iam_group_approval");
  });

  it("should enforce Deny-Always-Wins precedence (BLOCK overrides REQUIRE_APPROVAL, which overrides ALLOW)", () => {
    const conflictingPolicies: CompiledPolicy[] = [
      {
        id: "pol_allow_transfer",
        name: "Allow Transfer Under 5000",
        targetTool: "wire_transfer",
        actionOnMatch: "ALLOW",
        rules: [
          {
            id: "rule_amount_lt_5000",
            fieldPath: "amount",
            operator: "LESS_THAN",
            targetValue: "5000"
          }
        ]
      },
      {
        id: "pol_hitl_transfer",
        name: "Require Approval Over 1000",
        targetTool: "wire_transfer",
        actionOnMatch: "REQUIRE_APPROVAL",
        rules: [
          {
            id: "rule_amount_gt_1000",
            fieldPath: "amount",
            operator: "GREATER_THAN",
            targetValue: "1000"
          }
        ]
      },
      {
        id: "pol_block_restricted_dest",
        name: "Block Sanctioned Countries",
        targetTool: "wire_transfer",
        actionOnMatch: "BLOCK",
        rules: [
          {
            id: "rule_dest_country",
            fieldPath: "country",
            operator: "EQUALS",
            targetValue: "NK"
          }
        ]
      }
    ];

    // Case 1: Matches ALLOW and REQUIRE_APPROVAL -> REQUIRE_APPROVAL wins over ALLOW
    const res1 = evaluateAgentExecution(conflictingPolicies, {
      toolName: "wire_transfer",
      arguments: { amount: 2500, country: "US" }
    });
    expect(res1.verdict).toBe("REQUIRE_APPROVAL");
    expect(res1.matchedPolicyId).toBe("pol_hitl_transfer");

    // Case 2: Matches ALLOW, REQUIRE_APPROVAL, and BLOCK -> BLOCK wins over all
    const res2 = evaluateAgentExecution(conflictingPolicies, {
      toolName: "wire_transfer",
      arguments: { amount: 2500, country: "NK" }
    });
    expect(res2.verdict).toBe("BLOCK");
    expect(res2.matchedPolicyId).toBe("pol_block_restricted_dest");
  });

  it("should evaluate in less than 1ms on average (<15ms SLA budget)", () => {
    const runs = 1000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      evaluateAgentExecution(mockPolicies, {
        toolName: "issue_refund",
        arguments: { amount: 100 }
      });
    }
    const avgDuration = (performance.now() - start) / runs;
    expect(avgDuration).toBeLessThan(1);
  });
});

describe("ISO 27001 Cryptographic Log Hash Chaining", () => {
  it("should compute deterministic record hashes", () => {
    const record: LogRecordToHash = {
      id: "rec_1",
      previousRecordHash: null,
      toolName: "issue_refund",
      verdict: "PASSED",
      createdAt: "2026-09-19T10:00:00.000Z"
    };

    const hash1 = computeLogRecordHash(record);
    const hash2 = computeLogRecordHash(record);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it("should verify an unbroken sequential chain of audit records", () => {
    const rec1: LogRecordToHash = {
      id: "rec_1",
      previousRecordHash: null,
      toolName: "tool_a",
      verdict: "PASSED",
      createdAt: "2026-09-19T10:00:00.000Z"
    };
    const hash1 = computeLogRecordHash(rec1);

    const rec2: LogRecordToHash = {
      id: "rec_2",
      previousRecordHash: hash1,
      toolName: "tool_b",
      verdict: "BLOCKED",
      createdAt: "2026-09-19T10:01:00.000Z"
    };
    const hash2 = computeLogRecordHash(rec2);

    const rec3: LogRecordToHash = {
      id: "rec_3",
      previousRecordHash: hash2,
      toolName: "tool_c",
      verdict: "HELD",
      createdAt: "2026-09-19T10:02:00.000Z"
    };
    const hash3 = computeLogRecordHash(rec3);

    const chain = [
      { ...rec1, recordHash: hash1 },
      { ...rec2, recordHash: hash2 },
      { ...rec3, recordHash: hash3 }
    ];

    expect(verifyLogHashChain(chain)).toBe(true);
  });

  it("should detect tamper when an audit record verdict is altered post-hoc", () => {
    const rec1: LogRecordToHash = {
      id: "rec_1",
      previousRecordHash: null,
      toolName: "tool_a",
      verdict: "BLOCKED",
      createdAt: "2026-09-19T10:00:00.000Z"
    };
    const hash1 = computeLogRecordHash(rec1);

    const chain = [
      { ...rec1, verdict: "PASSED", recordHash: hash1 } // Attacker tampered verdict
    ];

    expect(verifyLogHashChain(chain)).toBe(false);
  });

  it("should detect tamper when a link in previousRecordHash is severed", () => {
    const rec1: LogRecordToHash = {
      id: "rec_1",
      previousRecordHash: null,
      toolName: "tool_a",
      verdict: "PASSED",
      createdAt: "2026-09-19T10:00:00.000Z"
    };
    const hash1 = computeLogRecordHash(rec1);

    const rec2: LogRecordToHash = {
      id: "rec_2",
      previousRecordHash: "fake_hash_123", // Broken link
      toolName: "tool_b",
      verdict: "PASSED",
      createdAt: "2026-09-19T10:01:00.000Z"
    };
    const hash2 = computeLogRecordHash(rec2);

    const chain = [
      { ...rec1, recordHash: hash1 },
      { ...rec2, recordHash: hash2 }
    ];

    expect(verifyLogHashChain(chain)).toBe(false);
  });
});

