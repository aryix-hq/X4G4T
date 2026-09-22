import { describe, it, expect } from "vitest";
import { POST } from "../app/api/slack/interactive/route.js";
import { NextRequest } from "next/server";

describe("Slack Interactive Webhook Endpoint (/api/slack/interactive)", () => {
  it("should return 400 when called with missing payload", async () => {
    const req = new NextRequest("http://localhost:3000/api/slack/interactive", {
      method: "POST",
      body: new FormData()
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing payload parameter");
  });

  it("should return 400 on malformed JSON payload", async () => {
    const formData = new FormData();
    formData.append("payload", "invalid_json_string");

    const req = new NextRequest("http://localhost:3000/api/slack/interactive", {
      method: "POST",
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should process APPROVED action and return replacement Block Kit card", async () => {
    const slackPayload = {
      user: { id: "U12345", name: "alice_reviewer" },
      actions: [
        {
          value: JSON.stringify({
            action: "APPROVED",
            hitlId: "hitl_test_uuid_123"
          })
        }
      ]
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(slackPayload));

    const req = new NextRequest("http://localhost:3000/api/slack/interactive", {
      method: "POST",
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.replace_original).toBe(true);
    expect(body.blocks[0].text.text).toContain("APPROVED");
    expect(body.blocks[0].text.text).toContain("hitl_test_uuid_123");
    expect(body.blocks[0].text.text).toContain("U12345");
  });

  it("should process REJECTED action and return replacement Block Kit card", async () => {
    const slackPayload = {
      user: { id: "U99999", name: "bob_secops" },
      actions: [
        {
          value: JSON.stringify({
            action: "REJECTED",
            hitlId: "hitl_test_uuid_456"
          })
        }
      ]
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(slackPayload));

    const req = new NextRequest("http://localhost:3000/api/slack/interactive", {
      method: "POST",
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.replace_original).toBe(true);
    expect(body.blocks[0].text.text).toContain("REJECTED / HALTED");
    expect(body.blocks[0].text.text).toContain("hitl_test_uuid_456");
  });
});

