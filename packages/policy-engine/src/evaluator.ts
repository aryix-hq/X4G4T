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
  const shadowResults: Array<{
    policyId: string;
    policyName: string;
    wouldVerdict: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
    reason?: string;
  }> = [];

  for (const policy of policies) {
    // Skip disabled policies
    if (policy.mode === "DISABLED") {
      continue;
    }

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
      const candidatePaths = rule.fieldPath.split(",").map((p) => p.trim()).filter(Boolean);
      let isMatch = false;

      const getValueForPath = (path: string): unknown => {
        if (path.startsWith("iam.") && context.iam) {
          return extractFieldValue(context.iam as unknown as Record<string, unknown>, path.replace(/^iam\./, ""));
        } else if (path.startsWith("_iam.") && context.iam) {
          return extractFieldValue(context.iam as unknown as Record<string, unknown>, path.replace(/^_iam\./, ""));
        } else if (path.startsWith("network.") && context.network) {
          return extractFieldValue(context.network as unknown as Record<string, unknown>, path.replace(/^network\./, ""));
        } else if (path.startsWith("_network.") && context.network) {
          return extractFieldValue(context.network as unknown as Record<string, unknown>, path.replace(/^_network\./, ""));
        } else {
          return extractFieldValue(context.arguments, path);
        }
      };

      for (const singlePath of candidatePaths) {
        const val = getValueForPath(singlePath);
        if (val !== undefined && val !== null) {
          if (evaluateOperator(val, rule.operator, rule.targetValue)) {
            isMatch = true;
            break;
          }
        }
      }

      // Fallback for single/empty paths or unary operators on undefined values
      if (!isMatch && candidatePaths.length > 0) {
        const firstVal = getValueForPath(candidatePaths[0]!);
        isMatch = evaluateOperator(firstVal, rule.operator, rule.targetValue);
      }

      if (!isMatch) {
        allRulesMatched = false;
        break;
      }
      lastMatchedRuleId = rule.id;
    }

    // Record matched policy following action precedence (BLOCK > REQUIRE_APPROVAL > ALLOW)
    if (allRulesMatched) {
      const latencyMs = Math.max(0, Math.round(performance.now() - startTime));

      // If policy is in SHADOW_LEARN mode, record counterfactual evaluation without blocking
      if (policy.mode === "SHADOW_LEARN") {
        shadowResults.push({
          policyId: policy.id,
          policyName: policy.name,
          wouldVerdict: policy.actionOnMatch,
          reason: `[SHADOW_LEARN] Candidate policy '${policy.name}' evaluated to ${policy.actionOnMatch}`
        });
        continue;
      }

      const result: EvaluationResult = {
        verdict: policy.actionOnMatch,
        matchedPolicyId: policy.id,
        violatingRuleId: lastMatchedRuleId,
        reason: `Triggered policy '${policy.name}' for tool '${context.toolName}'`,
        latencyMs,
        shadowResults: shadowResults.length > 0 ? shadowResults : undefined
      };

      // Deny-Always-Wins: BLOCK is the highest priority; break immediately
      if (policy.actionOnMatch === "BLOCK") {
        matchedBlockResult = result;
        break;
      } else if (policy.actionOnMatch === "REQUIRE_APPROVAL" && !matchedApprovalResult) {
        matchedApprovalResult = result;
      } else if (policy.actionOnMatch === "ALLOW" && !matchedAllowResult) {
        matchedAllowResult = result;
      }
    }
  }

  // Precedence: BLOCK > REQUIRE_APPROVAL > ALLOW
  if (matchedBlockResult) {
    if (shadowResults.length > 0) matchedBlockResult.shadowResults = shadowResults;
    return matchedBlockResult;
  }
  if (matchedApprovalResult) {
    if (shadowResults.length > 0) matchedApprovalResult.shadowResults = shadowResults;
    return matchedApprovalResult;
  }
  if (matchedAllowResult) {
    if (shadowResults.length > 0) matchedAllowResult.shadowResults = shadowResults;
    return matchedAllowResult;
  }

  const endTime = performance.now();
  return {
    verdict: "ALLOW",
    latencyMs: Math.max(0, Math.round(endTime - startTime)),
    shadowResults: shadowResults.length > 0 ? shadowResults : undefined
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

