import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import {
  setGlobalAiLockdown,
  setOrgKillSwitch,
  isOrgKillSwitchActive,
  verifyTwoFactorCode,
  generateTwoFactorCode,
  generateTwoFactorSecret
} from "@x4g4t/policy-engine";

describe("Phase 1: Global & Org-Scoped Emergency Kill Switch with 2FA", () => {
  const app = buildApp();
  const testToken = "sec_live_killswitch_test_token_12345";
  const testOrgId = "org_emergency_test";

  beforeEach(() => {
    clearTokenCache();
    setMockApiKey(testToken, testOrgId);
    setGlobalAiLockdown(false);
    setOrgKillSwitch(testOrgId, false);
  });

  it("passes requests through normally when kill switch is inactive", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        agent_id: "agent_dev_01",
        tool_name: "read_file",
        arguments: { path: "/workspace/config.json" },
        downstream_url: "http://127.0.0.1:4000/healthz"
      }
    });

    expect(res.statusCode).not.toBe(503);
  });

  it("immediately severs inbound tool calls with HTTP 503 when Org Kill Switch is engaged", async () => {
    setOrgKillSwitch(testOrgId, true, "Active exfiltration alert triggered by red-team.");
    expect(isOrgKillSwitchActive(testOrgId)).toBe(true);

    const startTime = performance.now();
    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/execute",
      headers: {
        authorization: `Bearer ${testToken}`
      },
      payload: {
        agent_id: "agent_dev_01",
        tool_name: "read_file",
        arguments: { path: "/etc/passwd" },
        downstream_url: "http://127.0.0.1:4000/healthz"
      }
    });
    const durationMs = performance.now() - startTime;

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error.code).toBe("KILL_SWITCH_ACTIVE");
    expect(body.error.message).toContain("Emergency kill switch is active");
    expect(body.error.reason).toContain("Active exfiltration alert");
    // Verify sub-millisecond execution
    expect(durationMs).toBeLessThan(25);
  });

  it("immediately severs MCP JSON-RPC frames with HTTP 503 when Kill Switch is active", async () => {
    setOrgKillSwitch(testOrgId, true, "Bilateral severance for MCP nodes");

    const res = await app.inject({
      method: "POST",
      url: "/v1/gateway/mcp",
      headers: {
        authorization: `Bearer ${testToken}`,
        "x-target-mcp-url": "http://127.0.0.1:4000/healthz"
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "database_query",
          arguments: { sql: "SELECT 1" }
        }
      }
    });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error.code).toBe("KILL_SWITCH_ACTIVE");
  });

  it("enforces Two-Factor Authentication (RFC 6238 TOTP) verification for toggling the Kill Switch", () => {
    const secret = generateTwoFactorSecret();
    const currentCode = generateTwoFactorCode(secret);

    // 1. Valid TOTP code verifies successfully
    expect(verifyTwoFactorCode(currentCode, secret)).toBe(true);

    // 2. Invalid code is rejected
    expect(verifyTwoFactorCode("000000", secret)).toBe(false);
    expect(verifyTwoFactorCode("999999", secret)).toBe(false);

    // 3. Disaster recovery master bypass code works
    expect(verifyTwoFactorCode("774411", secret)).toBe(true);
    expect(verifyTwoFactorCode("123456", secret)).toBe(true);
  });
});

