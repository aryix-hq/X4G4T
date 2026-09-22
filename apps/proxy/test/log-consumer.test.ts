import { describe, it, expect } from "vitest";
import { buildSlackHitlPayload } from "../src/workers/log-consumer.js";

describe("Log Consumer & Slack Block Kit Generation", () => {
  it("should generate compliant Slack Block Kit message payload", () => {
    const params = {
      hitlId: "hitl_9921_uuid",
      agentId: "support_agent_v2",
      toolName: "issue_refund",
      args: { amount: 500, user_id: "u_123" },
      latencyMs: 12
    };

    const card = buildSlackHitlPayload(params);

    expect(card.blocks).toHaveLength(4);
    // Header block
    expect(card.blocks[0]!.type).toBe("header");
    // Fields block
    expect(card.blocks[1]!.type).toBe("section");
    // JSON arguments block
    expect(card.blocks[2]!.type).toBe("section");
    // Interactive action buttons
    const actions = card.blocks[3] as {
      type: string;
      elements: Array<{
        type: string;
        text: { type: string; text: string };
        style: string;
        value: string;
      }>;
    };
    expect(actions.type).toBe("actions");
    expect(actions.elements).toHaveLength(2);

    // Approve button
    const approveBtn = actions.elements[0]!;
    expect(approveBtn.style).toBe("primary");
    expect(JSON.parse(approveBtn.value)).toEqual({
      action: "APPROVED",
      hitlId: "hitl_9921_uuid"
    });

    // Reject button
    const rejectBtn = actions.elements[1]!;
    expect(rejectBtn.style).toBe("danger");
    expect(JSON.parse(rejectBtn.value)).toEqual({
      action: "REJECTED",
      hitlId: "hitl_9921_uuid"
    });
  });
});

