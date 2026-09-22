import { RuleOperator } from "./types.js";

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
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

    case "GREATER_THAN_OR_EQUAL": {
      const numActual = Number(actual);
      const numTarget = Number(target);
      return !isNaN(numActual) && !isNaN(numTarget) && numActual >= numTarget;
    }

    case "LESS_THAN_OR_EQUAL": {
      const numActual = Number(actual);
      const numTarget = Number(target);
      return !isNaN(numActual) && !isNaN(numTarget) && numActual <= numTarget;
    }

    case "CONTAINS":
      return String(actual).toLowerCase().includes(target.toLowerCase());

    case "REGEX": {
      try {
        let pattern = target;
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

        const re = new RegExp(pattern, flags);
        // ReDoS Guard: cap input string length to 10,000 characters
        const inputStr = String(actual).slice(0, 10000);
        return re.test(inputStr);
      } catch {
        return false;
      }
    }

    case "IN": {
      const allowed = target.split(",").map((item) => item.trim());
      return allowed.includes(String(actual));
    }

    default:
      return false;
  }
}

export function extractFieldValue(payload: Record<string, unknown>, path: string): unknown {
  return getNestedValue(payload, path);
}
