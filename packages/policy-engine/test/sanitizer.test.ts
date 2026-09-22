import { describe, it, expect } from "vitest";
import { sanitizePayload, sanitizeHeaders, scrubString } from "../src/sanitizer.js";

describe("Sanitizer & PII Redaction Engine", () => {
  it("should scrub email addresses from strings", () => {
    const text = "Contact the customer at user.test@enterprise.com for confirmation.";
    const { scrubbed, redacted } = scrubString(text);
    expect(redacted).toBe(true);
    expect(scrubbed).toBe("Contact the customer at [REDACTED_EMAIL] for confirmation.");
  });

  it("should scrub credit card numbers and IBANs", () => {
    const cardText = "Refund to card 4111-2222-3333-4444 immediately.";
    const { scrubbed: cardScrubbed } = scrubString(cardText);
    expect(cardScrubbed).toContain("[REDACTED_CARD]");

    const ibanText = "Wire funds to GB29NWBK60161331926819 please.";
    const { scrubbed: ibanScrubbed } = scrubString(ibanText);
    expect(ibanScrubbed).toContain("[REDACTED_IBAN]");
  });

  it("should scrub raw API tokens with known prefixes", () => {
    const secretText = "Using token sec_live_9a1bcdef123456 to query database.";
    const { scrubbed } = scrubString(secretText);
    expect(scrubbed).toBe("Using token [REDACTED_SECRET] to query database.");
  });

  it("should recursively sanitize nested payload objects and arrays", () => {
    const payload = {
      user: {
        email: "alice@example.com",
        phone: "555-867-5309",
        profile: {
          secret_api_key: "my_raw_password_value",
          tags: ["admin", "reach at bob@corp.org"]
        }
      },
      amount: 250
    };

    const { sanitized, piiDetected } = sanitizePayload(payload) as {
      sanitized: typeof payload;
      piiDetected: boolean;
    };

    expect(piiDetected).toBe(true);
    expect(sanitized.user.email).toBe("[REDACTED_EMAIL]");
    expect(sanitized.user.phone).toBe("[REDACTED_PHONE]");
    expect(sanitized.user.profile.secret_api_key).toBe("[REDACTED_SECRET]");
    expect(sanitized.user.profile.tags[1]).toBe("reach at [REDACTED_EMAIL]");
    expect(sanitized.amount).toBe(250); // Untouched non-PII numerical data
  });

  it("should scrub authorization headers from downstream requests", () => {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer rk_live_enterprise_secret_token",
      "Cookie": "session_id=abcdef123456",
      "X-Custom-Trace-Id": "trace_9921"
    };

    const sanitized = sanitizeHeaders(headers);

    expect(sanitized["Content-Type"]).toBe("application/json");
    expect(sanitized["X-Custom-Trace-Id"]).toBe("trace_9921");
    expect(sanitized["Authorization"]).toBe("[REDACTED_CREDENTIAL]");
    expect(sanitized["Cookie"]).toBe("[REDACTED_CREDENTIAL]");
  });
});

