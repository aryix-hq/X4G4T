const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{15,16}\b/g;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const SECRET_PREFIX_REGEX = /\b(?:sk_live|sec_live|rk_live|Bearer\s+)[A-Za-z0-9_\-.]+\b/gi;

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "token",
  "secret"
]);

export function scrubString(str: string): { scrubbed: string; redacted: boolean } {
  let modified = false;

  let result = str.replace(SECRET_PREFIX_REGEX, () => {
    modified = true;
    return "[REDACTED_SECRET]";
  });

  result = result.replace(EMAIL_REGEX, () => {
    modified = true;
    return "[REDACTED_EMAIL]";
  });

  result = result.replace(CREDIT_CARD_REGEX, () => {
    modified = true;
    return "[REDACTED_CARD]";
  });

  result = result.replace(IBAN_REGEX, () => {
    modified = true;
    return "[REDACTED_IBAN]";
  });

  result = result.replace(SSN_REGEX, () => {
    modified = true;
    return "[REDACTED_SSN]";
  });

  result = result.replace(PHONE_REGEX, () => {
    modified = true;
    return "[REDACTED_PHONE]";
  });

  return { scrubbed: result, redacted: modified };
}

export function sanitizePayload(payload: unknown): { sanitized: unknown; piiDetected: boolean } {
  let detected = false;

  function recursiveSanitize(val: unknown): unknown {
    if (typeof val === "string") {
      const { scrubbed, redacted } = scrubString(val);
      if (redacted) detected = true;
      return scrubbed;
    }

    if (Array.isArray(val)) {
      return val.map(recursiveSanitize);
    }

    if (val !== null && typeof val === "object") {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const lowerKey = k.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("token") ||
          lowerKey.includes("api_key")
        ) {
          detected = true;
          copy[k] = "[REDACTED_SECRET]";
        } else {
          copy[k] = recursiveSanitize(v);
        }
      }
      return copy;
    }

    return val;
  }

  const sanitized = recursiveSanitize(payload);
  return { sanitized, piiDetected: detected };
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lowerKey = k.toLowerCase();
    if (SENSITIVE_HEADER_KEYS.has(lowerKey)) {
      sanitized[k] = "[REDACTED_CREDENTIAL]";
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

