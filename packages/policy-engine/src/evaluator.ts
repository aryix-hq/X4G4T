import { createHash } from "node:crypto";
import { evaluateOperator, extractFieldValue } from "./operators.js";
import {
  CompiledPolicy,
  EvaluationContext,
  EvaluationResult,
  LogRecordToHash
} from "./types.js";

export function evaluateAgentExecution(
  policies: CompiledPolicy[],
  context: EvaluationContext
): EvaluationResult {
  const startTime = performance.now();

  let matchedBlockResult: EvaluationResult | null = null;
  let matchedApprovalResult: EvaluationResult | null = null;
  let matchedAllowResult: EvaluationResult | null = null;

  for (const policy of policies) {
    // Tool targeting check ("*" wildcard matches all tools)
    if (policy.targetTool !== "*" && policy.targetTool !== context.toolName) {
      continue;
    }

    // Skip policies without explicit rules
    if (policy.rules.length === 0) {
      continue;
    }

    // Evaluate all rules in policy with AND semantics
    let allRulesMatched = true;
    let lastMatchedRuleId: string | undefined;

    for (const rule of policy.rules) {
      let actualValue: unknown;
      if (rule.fieldPath.startsWith("iam.") && context.iam) {
        actualValue = extractFieldValue(
          context.iam as unknown as Record<string, unknown>,
          rule.fieldPath.replace(/^iam\./, "")
        );
      } else if (rule.fieldPath.startsWith("_iam.") && context.iam) {
        actualValue = extractFieldValue(
          context.iam as unknown as Record<string, unknown>,
          rule.fieldPath.replace(/^_iam\./, "")
        );
      } else {
        actualValue = extractFieldValue(context.arguments, rule.fieldPath);
      }

      const isMatch = evaluateOperator(actualValue, rule.operator, rule.targetValue);
      if (!isMatch) {
        allRulesMatched = false;
        break;
      }
      lastMatchedRuleId = rule.id;
    }

    // Record matched policy following action precedence (BLOCK > REQUIRE_APPROVAL > ALLOW)
    if (allRulesMatched) {
      const latencyMs = Math.max(0, Math.round(performance.now() - startTime));
      const result: EvaluationResult = {
        verdict: policy.actionOnMatch,
        matchedPolicyId: policy.id,
        violatingRuleId: lastMatchedRuleId,
        reason: `Triggered policy '${policy.name}' for tool '${context.toolName}'`,
        latencyMs
      };

      // Deny-Always-Wins: BLOCK is the highest priority; return immediately
      if (policy.actionOnMatch === "BLOCK") {
        return result;
      } else if (policy.actionOnMatch === "REQUIRE_APPROVAL" && !matchedApprovalResult) {
        matchedApprovalResult = result;
      } else if (policy.actionOnMatch === "ALLOW" && !matchedAllowResult) {
        matchedAllowResult = result;
      }
    }
  }

  // Precedence: BLOCK > REQUIRE_APPROVAL > ALLOW
  if (matchedBlockResult) {
    return matchedBlockResult;
  }
  if (matchedApprovalResult) {
    return matchedApprovalResult;
  }
  if (matchedAllowResult) {
    return matchedAllowResult;
  }

  const endTime = performance.now();
  return {
    verdict: "ALLOW",
    latencyMs: Math.max(0, Math.round(endTime - startTime))
  };
}

/**
 * ISO/IEC 27001 A.8.15 Tamper-Evident Hash Chaining
 * Computes a deterministic SHA-256 hash linking the current log record to the previous record's hash.
 */
export function computeLogRecordHash(record: LogRecordToHash): string {
  const prevHash = record.previousRecordHash || "GENESIS_BLOCK";
  const ts = typeof record.createdAt === "string" 
    ? record.createdAt 
    : record.createdAt.toISOString();
  
  const payloadToHash = `${record.id}:${prevHash}:${record.toolName}:${record.verdict}:${ts}`;
  return createHash("sha256").update(payloadToHash).digest("hex");
}

/**
 * Verifies a sequential chain of execution log records.
 * Returns false if any record has been tampered with or if the chain is broken.
 */
export function verifyLogHashChain(
  records: Array<LogRecordToHash & { recordHash: string }>
): boolean {
  for (let i = 0; i < records.length; i++) {
    const current = records[i]!;
    
    // Verify cryptographic self-hash integrity
    const expectedHash = computeLogRecordHash(current);
    if (current.recordHash !== expectedHash) {
      return false;
    }

    // Verify cryptographic link to previous record in chain
    if (i > 0) {
      const prev = records[i - 1]!;
      if (current.previousRecordHash !== prev.recordHash) {
        return false;
      }
    }
  }

  return true;
}

