export type DlpAction = "BLOCK" | "REDACT" | "ALERT_ONLY";

export type DlpViolationType = 
  | "AWS_ACCESS_KEY"
  | "GITHUB_TOKEN"
  | "PRIVATE_KEY"
  | "API_KEY"
  | "CREDIT_CARD"
  | "SSN"
  | "AADHAAR"
  | "EMAIL"
  | "PHONE"
  | "CUSTOM_KEYWORD";

export interface DlpViolation {
  type: DlpViolationType;
  snippet: string;
  field?: string;
}

export interface DlpPolicyConfig {
  id?: string;
  name?: string;
  action: DlpAction;
  detectSecrets?: boolean;
  detectPii?: boolean;
  customKeywords?: string[];
  isActive?: boolean;
}

export interface DlpInspectionResult {
  action: DlpAction;
  hasViolations: boolean;
  blocked: boolean;
  violations: DlpViolation[];
  sanitizedData: unknown;
  reason?: string;
}

// Regex Detectors
const AWS_KEY_REGEX = /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g;
const GITHUB_TOKEN_REGEX = /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g;
const PRIVATE_KEY_REGEX = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g;
const API_KEY_PREFIX_REGEX = /\b(?:sk_live|sec_live|rk_live|Bearer\s+)[A-Za-z0-9_\-]{20,}\b/gi;

const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const AADHAAR_REGEX = /\b\d{4}[-\s]\d{4}[-\s]\d{4}\b(?![-\s]?\d)/g;
const POTENTIAL_CC_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;

/**
 * Validates a number string using the Luhn checksum algorithm (Mod 10).
 * Prevents false positives on random 16-digit integers.
 */
export function validateLuhn(numStr: string): boolean {
  const cleaned = numStr.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Inspects and sanitizes a string for DLP violations based on policy config.
 */
export function inspectStringDlp(
  text: string,
  config: DlpPolicyConfig,
  fieldName?: string
): { sanitizedText: string; violations: DlpViolation[] } {
  const violations: DlpViolation[] = [];
  let result = text;

  const detectSecrets = config.detectSecrets !== false;
  const detectPii = config.detectPii !== false;

  // 1. Secrets & Credentials
  if (detectSecrets) {
    result = result.replace(AWS_KEY_REGEX, (match) => {
      violations.push({ type: "AWS_ACCESS_KEY", snippet: match.slice(0, 4) + "...", field: fieldName });
      return config.action === "REDACT" ? "[REDACTED_SECRET:AWS_KEY]" : match;
    });

    result = result.replace(GITHUB_TOKEN_REGEX, (match) => {
      violations.push({ type: "GITHUB_TOKEN", snippet: match.slice(0, 7) + "...", field: fieldName });
      return config.action === "REDACT" ? "[REDACTED_SECRET:GITHUB_TOKEN]" : match;
    });

    result = result.replace(PRIVATE_KEY_REGEX, (match) => {
      violations.push({ type: "PRIVATE_KEY", snippet: "-----BEGIN PRIVATE KEY-----", field: fieldName });
      return config.action === "REDACT" ? "[REDACTED_SECRET:PRIVATE_KEY]" : match;
    });

    result = result.replace(API_KEY_PREFIX_REGEX, (match) => {
      violations.push({ type: "API_KEY", snippet: match.slice(0, 8) + "...", field: fieldName });
      return config.action === "REDACT" ? "[REDACTED_SECRET:API_KEY]" : match;
    });
  }

  // 2. Personally Identifiable Information (PII)
  if (detectPii) {
    // Credit Cards (with Luhn check)
    result = result.replace(POTENTIAL_CC_REGEX, (match) => {
      if (validateLuhn(match)) {
        violations.push({ type: "CREDIT_CARD", snippet: "xxxx-xxxx-xxxx-" + match.replace(/[\s-]/g, "").slice(-4), field: fieldName });
        return config.action === "REDACT" ? "[REDACTED_PII:CREDIT_CARD]" : match;
      }
      return match;
    });

    // SSN
    result = result.replace(SSN_REGEX, (match) => {
      violations.push({ type: "SSN", snippet: "xxx-xx-" + match.slice(-4), field: fieldName });
      return config.action === "REDACT" ? "[REDACTED_PII:SSN]" : match;
    });

    // Aadhaar
    result = result.replace(AADHAAR_REGEX, (match) => {
      const cleaned = match.replace(/[\s-]/g, "");
      if (cleaned.length === 12) {
        violations.push({ type: "AADHAAR", snippet: "xxxx-xxxx-" + cleaned.slice(-4), field: fieldName });
        return config.action === "REDACT" ? "[REDACTED_PII:AADHAAR]" : match;
      }
      return match;
    });

    // Email
    result = result.replace(EMAIL_REGEX, (match) => {
      violations.push({ type: "EMAIL", snippet: match.replace(/^(.)(.*)(@.*)$/, "$1...$3"), field: fieldName });
      return config.action === "REDACT" ? "[REDACTED_PII:EMAIL]" : match;
    });

    // Phone
    result = result.replace(PHONE_REGEX, (match) => {
      // Avoid false positive on simple short numbers
      if (match.replace(/\D/g, "").length >= 7) {
        violations.push({ type: "PHONE", snippet: match.slice(-4), field: fieldName });
        return config.action === "REDACT" ? "[REDACTED_PII:PHONE]" : match;
      }
      return match;
    });
  }

  // 3. Custom Corporate Classifiers / Keywords
  if (config.customKeywords && config.customKeywords.length > 0) {
    for (const keyword of config.customKeywords) {
      if (!keyword || keyword.trim().length === 0) continue;
      const kwRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      result = result.replace(kwRegex, (match) => {
        violations.push({ type: "CUSTOM_KEYWORD", snippet: match, field: fieldName });
        return config.action === "REDACT" ? "[REDACTED_CORP_CONFIDENTIAL]" : match;
      });
    }
  }

  return { sanitizedText: result, violations };
}

/**
 * Recursively inspects any payload (objects, arrays, strings) for DLP violations.
 */
export function inspectPayloadDlp(
  payload: unknown,
  config: DlpPolicyConfig
): DlpInspectionResult {
  const allViolations: DlpViolation[] = [];

  function recursiveScan(val: unknown, path: string = ""): unknown {
    if (typeof val === "string") {
      const { sanitizedText, violations } = inspectStringDlp(val, config, path || undefined);
      allViolations.push(...violations);
      return config.action === "REDACT" ? sanitizedText : val;
    }

    if (Array.isArray(val)) {
      return val.map((item, idx) => recursiveScan(item, path ? `${path}[${idx}]` : `[${idx}]`));
    }

    if (val !== null && typeof val === "object") {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const nextPath = path ? `${path}.${k}` : k;
        copy[k] = recursiveScan(v, nextPath);
      }
      return copy;
    }

    return val;
  }

  const sanitizedData = recursiveScan(payload);
  const hasViolations = allViolations.length > 0;
  const blocked = hasViolations && config.action === "BLOCK";

  let reason: string | undefined;
  if (hasViolations) {
    const types = Array.from(new Set(allViolations.map((v) => v.type))).join(", ");
    reason = `DLP Violation: Detected sensitive content (${types}) violating corporate data security policy.`;
  }

  return {
    action: config.action,
    hasViolations,
    blocked,
    violations: allViolations,
    sanitizedData: config.action === "REDACT" ? sanitizedData : payload,
    reason
  };
}
