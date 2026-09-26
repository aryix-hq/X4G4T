import { RuleOperator } from "./types.js";
import vm from "node:vm";

/**
 * Checks for catastrophic backtracking patterns (nested repetitions and overlapping quantifiers)
 * that cause exponential complexity (ReDoS).
 */
export function hasCatastrophicBacktrackingRisk(pattern: string): boolean {
  // Nested quantifiers like (x+)+, (x*)*, (x+)*, (x*)+, (x{1,5})+
  const nestedQuantifiers = /\([^()]*[+*][^()]*\)[+*]|\([^()]*\{\d+,?\}[^()]*\)[+*]|\([^()]*[+*][^()]*\)\{\d+,?\}/;
  if (nestedQuantifiers.test(pattern)) {
    return true;
  }
  // Overlapping disjunction repetitions like (a|a)+
  const overlappingDisjunction = /\(([^|()]+)\|\1\)[+*]/;
  if (overlappingDisjunction.test(pattern)) {
    return true;
  }
  return false;
}

export const isRegexVulnerableToReDoS = hasCatastrophicBacktrackingRisk;

export function safeRegexTest(pattern: string, input: unknown, options: { timeoutMs?: number } = {}): boolean {
  return evaluateRegexSafe(pattern, input, options.timeoutMs ?? 15);
}

export function evaluateRegexSafe(patternStr: string, input: unknown, timeoutMs = 15): boolean {
  if (input === undefined || input === null) return false;

  let pattern = patternStr;
  let flags = "";

  // ReDoS Guard: reject excessively long pattern strings
  if (pattern.length > 512) {
    return false;
  }

  // Support inline (?i) case-insensitivity prefix
  if (pattern.startsWith("(?i)")) {
    flags += "i";
    pattern = pattern.slice(4);
  }

  // Support /pattern/flags format
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const lastSlash = pattern.lastIndexOf("/");
    flags = pattern.slice(lastSlash + 1);
    pattern = pattern.slice(1, lastSlash);
  }

  // ReDoS Guard: reject patterns with catastrophic backtracking vulnerability
  if (hasCatastrophicBacktrackingRisk(pattern)) {
    return false;
  }

  // Bounded input length (max 10,000 characters)
  const inputStr = String(input).slice(0, 10000);

  try {
    const re = new RegExp(pattern, flags);
    // Bounded execution sandbox with hard micro-timeout
    return vm.runInNewContext(
      "re.test(inputStr)",
      { re, inputStr },
      { timeout: timeoutMs, microtaskMode: "afterEvaluate" }
    );
  } catch {
    return false;
  }
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }
  const parts = path.split(".");
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (current === null || current === undefined) {
      return undefined;
    }

    // Check for array indexing or wildcard, e.g. items[0] or items[*]
    const arrayMatch = part.match(/^([^[]+)\[(\*|\d+)\]$/);
    if (arrayMatch) {
      const field = arrayMatch[1]!;
      const indexSpec = arrayMatch[2]!;
      const arr = (current as Record<string, unknown>)[field];
      if (!Array.isArray(arr)) {
        return undefined;
      }
      if (indexSpec === "*") {
        const remainingPath = parts.slice(i + 1).join(".");
        if (!remainingPath) {
          return arr;
        }
        return arr.map((item) =>
          typeof item === "object" && item !== null
            ? getNestedValue(item as Record<string, unknown>, remainingPath)
            : undefined
        );
      } else {
        const idx = parseInt(indexSpec, 10);
        current = arr[idx];
      }
    } else {
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

export function evaluateOperator(
  actual: unknown,
  operator: RuleOperator,
  target: string
): boolean {
  if (actual === undefined || actual === null) {
    return false;
  }

  if (Array.isArray(actual)) {
    return actual.some((item) => evaluateOperator(item, operator, target));
  }

  switch (operator) {
    case "EQUALS":
      return String(actual) === target;

    case "NOT_EQUALS":
      return String(actual) !== target;

    case "GREATER_THAN": {
      const numActual = Number(actual);
      const numTarget = Number(target);
      return !isNaN(numActual) && !isNaN(numTarget) && numActual > numTarget;
    }

    case "LESS_THAN": {
      const numActual = Number(actual);
      const numTarget = Number(target);
      return !isNaN(numActual) && !isNaN(numTarget) && numActual < numTarget;
    }

    case "GREATER_THAN_OR_EQUAL":
    case "GTE" as RuleOperator: {
      const numActual = Number(actual);
      const numTarget = Number(target);
      return !isNaN(numActual) && !isNaN(numTarget) && numActual >= numTarget;
    }

    case "LESS_THAN_OR_EQUAL":
    case "LTE" as RuleOperator: {
      const numActual = Number(actual);
      const numTarget = Number(target);
      return !isNaN(numActual) && !isNaN(numTarget) && numActual <= numTarget;
    }

    case "CONTAINS":
      return String(actual).toLowerCase().includes(target.toLowerCase());

    case "REGEX":
      return evaluateRegexSafe(target, actual);

    case "IN": {
      const allowed = target.split(",").map((item) => item.trim());
      return allowed.includes(String(actual));
    }

    default:
      return false;
  }
}

export const evaluateRuleCondition = evaluateOperator;

export function extractFieldValue(payload: Record<string, unknown>, path: string): unknown {
  return getNestedValue(payload, path);
}
