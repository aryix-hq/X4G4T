import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/index.js";
import { setMockApiKey, clearTokenCache } from "../src/plugins/auth.js";
import { setMockHitlRecord, clearMockHitlRecords } from "../src/routes/hitl-poll.js";

describe("HITL Polling Endpoint (/v1/gateway/hitl/:holdId)", () => {
  const app = buildApp();
  const TEST_ORG_ID = "org_hitl_test";
  const TEST_TOKEN = "sec_live_hitl_poll_token_12345";

  beforeEach(() => {
    clearTokenCache();
    clearMockHitlRecords();
    setMockApiKey(TEST_TOKEN, TEST_ORG_ID);
  });

  it("should return 401 UNAUTHORIZED when called without Bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/gateway/hitl/hold_test_1"
    });

    expect(res.statusCode).toBe(401);
  });

  it("should return 404 HOLD_NOT_FOUND for non-existent holdId", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/gateway/hitl/non_existent_hold_999",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      }
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("HOLD_NOT_FOUND");
  });

  it("should return 202 Accepted with PENDING status when hold is unresolved", async () => {
    setMockHitlRecord("hold_pending_123", {
      status: "PENDING",
      reviewerId: null,
      resolvedAt: null,
      orgId: TEST_ORG_ID
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/gateway/hitl/hold_pending_123",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      }
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe("PENDING");
    expect(body.retry_after_sec).toBe(5);
  });

  it("should return 200 OK with APPROVED verdict when resolved by human", async () => {
    const resolvedTime = new Date("2026-09-19T10:15:00.000Z");
    setMockHitlRecord("hold_approved_123", {
      status: "APPROVED",
      reviewerId: "U0882194",
      resolvedAt: resolvedTime,
      orgId: TEST_ORG_ID
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/gateway/hitl/hold_approved_123",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("APPROVED");
    expect(body.reviewer).toBe("U0882194");
    expect(body.resolved_at).toBe(resolvedTime.toISOString());
  });

  it("should return 200 OK with REJECTED verdict when denied by operator", async () => {
    const resolvedTime = new Date("2026-09-19T10:20:00.000Z");
    setMockHitlRecord("hold_rejected_123", {
      status: "REJECTED",
      reviewerId: "U0999123",
      resolvedAt: resolvedTime,
      orgId: TEST_ORG_ID
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/gateway/hitl/hold_rejected_123",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("REJECTED");
    expect(body.reviewer).toBe("U0999123");
  });
});

