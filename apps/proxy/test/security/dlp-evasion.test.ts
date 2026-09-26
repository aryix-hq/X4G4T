import { describe, it, expect } from "vitest";
import {
  inspectStringDlp,
  inspectPayloadDlp,
  normalizeDlpInput,
  calculateShannonEntropy,
  DlpStreamBuffer,
  DlpPolicyConfig
} from "@x4g4t/policy-engine";

describe("SUITE 3.2: Defense-Grade Security - DLP Evasion Resistance & Secret Scrubbing", () => {
  const redactConfig: DlpPolicyConfig = {
    action: "REDACT",
    detectSecrets: true,
    detectPii: true
  };

  const blockConfig: DlpPolicyConfig = {
    action: "BLOCK",
    detectSecrets: true,
    detectPii: true
  };

  describe("Unicode & Obfuscation Normalization Evasion Vectors", () => {
    it("should strip zero-width characters (\\u200B, \\u200C, \\uFEFF) to intercept hidden AWS keys", () => {
      const obfuscatedAwsKey = "A\u200BK\u200CIA\uFEFF1234567890ABCDEF";
      const normalized = normalizeDlpInput(obfuscatedAwsKey);
      expect(normalized).toBe("AKIA1234567890ABCDEF");

      const result = inspectStringDlp(obfuscatedAwsKey, redactConfig);
      expect(result.violations.some((v) => v.type === "AWS_ACCESS_KEY")).toBe(true);
      expect(result.sanitizedText).toBe("[REDACTED_SECRET:AWS_KEY]");
    });

    it("should normalize full-width Unicode characters (NFKC) to standard ASCII", () => {
      const fullWidthAwsKey = "ＡＫＩＡ１２３４５６７８９０ＡＢＣＤＥＦ";
      const result = inspectStringDlp(fullWidthAwsKey, redactConfig);

      expect(result.violations.some((v) => v.type === "AWS_ACCESS_KEY")).toBe(true);
      expect(result.sanitizedText).toBe("[REDACTED_SECRET:AWS_KEY]");
    });

    it("should decode mixed URL / Percent-encoding to intercept encoded tokens", () => {
      const percentEncodedKey = "%41%4B%49%411234567890ABCDEF";
      const result = inspectStringDlp(percentEncodedKey, redactConfig);

      expect(result.violations.some((v) => v.type === "AWS_ACCESS_KEY")).toBe(true);
      expect(result.sanitizedText).toBe("[REDACTED_SECRET:AWS_KEY]");
    });

    it("should neutralize zero-width spaces inside credit card numbers", () => {
      // 4242-4242-4242-4242 with zero-width joiners
      const obfuscatedCc = "4242\u200C4242\u200B4242\uFEFF4242";
      const result = inspectStringDlp(obfuscatedCc, redactConfig);

      expect(result.violations.some((v) => v.type === "CREDIT_CARD")).toBe(true);
      expect(result.sanitizedText).toBe("[REDACTED_PII:CREDIT_CARD]");
    });
  });

  describe("Sliding Window Chunking Across SSE Boundaries", () => {
    it("should detect and redact secrets spanning chunk boundaries (Chunk 1: AKIA, Chunk 2: 1234567890ABCDEF)", () => {
      const streamBuffer = new DlpStreamBuffer(redactConfig);

      const chunk1 = "Connecting with credential: AKIA";
      const out1 = streamBuffer.processChunk(chunk1);

      const chunk2 = "1234567890ABCDEF onto the server.";
      const out2 = streamBuffer.processChunk(chunk2);

      const finalOut = streamBuffer.flush();
      const combined = out1 + out2 + finalOut;

      expect(combined).not.toContain("AKIA1234567890ABCDEF");
      expect(combined).toContain("[REDACTED_SECRET:AWS_KEY]");
      expect(streamBuffer.hasViolations()).toBe(true);
    });

    it("should immediately flag BLOCK when secret spans boundary under BLOCK policy", () => {
      const streamBuffer = new DlpStreamBuffer(blockConfig);

      streamBuffer.processChunk("Your key is: AKIA");
      const out = streamBuffer.processChunk("1234567890ABCDEF. Keep it safe.");

      expect(streamBuffer.isBlocked()).toBe(true);
      expect(out).toBe("");
    });
  });

  describe("High-Entropy Secret Detection (Hex & Base64 without known prefixes)", () => {
    it("should calculate Shannon entropy accurately", () => {
      // Repetitive text has low entropy
      const lowEntropy = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      expect(calculateShannonEntropy(lowEntropy)).toBeLessThan(1.0);

      // Random 256-bit hex private key has high entropy (> 3.5)
      const highEntropyHex = "4f8b2c9e71d3a5068f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2";
      expect(calculateShannonEntropy(highEntropyHex)).toBeGreaterThan(3.5);
    });

    it("should detect and redact raw high-entropy private keys without static prefixes", () => {
      // High-entropy 44-character base64 secret (e.g., standard AWS/Stripe secret key shape)
      const highEntropySecret = "dGhpc19pc19hbl9leHRyZW1lbHlfaGlnaF9lbnRyb3B5X3NlY3JldF9rZXlfOTk=";
      const text = `The raw private token is ${highEntropySecret} for root access.`;

      const result = inspectStringDlp(text, redactConfig);
      expect(result.violations.some((v) => v.type === "HIGH_ENTROPY_SECRET")).toBe(true);
      expect(result.sanitizedText).toContain("[REDACTED_SECRET:HIGH_ENTROPY]");
      expect(result.sanitizedText).not.toContain(highEntropySecret);
    });

    it("should block payloads containing high-entropy tokens under BLOCK policy", () => {
      const payload = {
        credentials: {
          token: "8f7e6d5c4b3a29180f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2"
        }
      };

      const result = inspectPayloadDlp(payload, blockConfig);
      expect(result.blocked).toBe(true);
      expect(result.violations.some((v) => v.type === "HIGH_ENTROPY_SECRET")).toBe(true);
    });
  });
});
