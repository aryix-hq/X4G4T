import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/tenant";
import { hitlRequests } from "@x4g4t/db";
import { eq } from "drizzle-orm";

interface SlackPayloadAction {
  value?: string;
}

interface SlackPayloadUser {
  id?: string;
  name?: string;
  username?: string;
}

interface SlackInteractivePayload {
  actions?: SlackPayloadAction[];
  user?: SlackPayloadUser;
}

export async function POST(req: NextRequest) {
  let rawPayload: string | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const jsonBody = await req.json();
      rawPayload = typeof jsonBody.payload === "string" ? jsonBody.payload : JSON.stringify(jsonBody);
    } else {
      const formData = await req.formData();
      rawPayload = formData.get("payload") as string | null;
    }
  } catch (err) {
    return NextResponse.json({ error: "Invalid request payload format" }, { status: 400 });
  }

  if (!rawPayload || typeof rawPayload !== "string") {
    return NextResponse.json({ error: "Missing payload parameter" }, { status: 400 });
  }

  let payload: SlackInteractivePayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ error: "Malformed JSON in payload" }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (!action || !action.value) {
    return NextResponse.json({ error: "Invalid or missing action in payload" }, { status: 400 });
  }

  let parsedAction: { action: "APPROVED" | "REJECTED"; hitlId: string };
  try {
    parsedAction = JSON.parse(action.value);
  } catch {
    return NextResponse.json({ error: "Invalid action value format" }, { status: 400 });
  }

  const { action: decision, hitlId } = parsedAction;
  if (!decision || !hitlId) {
    return NextResponse.json({ error: "Missing decision or hitlId" }, { status: 400 });
  }

  const reviewer = payload.user?.name || payload.user?.username || payload.user?.id || "slack_operator";

  // 1. Update HITL record status in DB
  try {
    const db = getDb();
    await db
      .update(hitlRequests)
      .set({
        status: decision,
        reviewerId: reviewer,
        resolvedAt: new Date(),
        resolutionReason: `Resolved via Slack by @${reviewer}`
      })
      .where(eq(hitlRequests.id, hitlId));
  } catch (err) {
    // In local dev/test without DB, proceed with confirmation card
    console.warn("[X4G4T Slack Webhook Notice]:", (err as Error).message);
  }

  // 2. Return in-channel message update replacing interactive buttons
  const isApproved = decision === "APPROVED";
  return NextResponse.json({
    replace_original: true,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Status:* ${isApproved ? "✅ *APPROVED*" : "❌ *REJECTED / HALTED*"}\n*Reviewer:* <@${payload.user?.id || reviewer}>\n*Hold ID:* \`${hitlId}\``
        }
      }
    ]
  });
}

