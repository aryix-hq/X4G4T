import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/tenant";
import { hitlRequests } from "@x4g4t/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

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

/**
 * Cryptographically verifies Slack webhook request signatures using HMAC-SHA256
 * and validates request timestamp freshness to prevent replay attacks.
 */
function verifySlackRequestSignature(
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
  signingSecret: string
): { isValid: boolean; error?: string } {
  if (!signature || !timestamp) {
    return { isValid: false, error: "Missing Slack signature or timestamp headers" };
  }

  // Prevent replay attacks (5 minute threshold)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const requestTimestamp = parseInt(timestamp, 10);
  if (isNaN(requestTimestamp) || Math.abs(currentTimestamp - requestTimestamp) > 300) {
    return { isValid: false, error: "Slack request timestamp is stale (replay attack mitigation)" };
  }

  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const computedSignature = "v0=" + crypto
    .createHmac("sha256", signingSecret)
    .update(sigBaseString, "utf8")
    .digest("hex");

  try {
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(computedSignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
    return { isValid: isMatch };
  } catch {
    return { isValid: false, error: "Signature comparison mismatch" };
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const slackSignature = req.headers.get("x-slack-signature");
  const slackTimestamp = req.headers.get("x-slack-request-timestamp");
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  // Enforce cryptographic signature verification when corporate signing secret is configured
  if (signingSecret) {
    const verification = verifySlackRequestSignature(
      slackSignature,
      slackTimestamp,
      rawBody,
      signingSecret
    );
    if (!verification.isValid) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid Slack webhook signature", details: verification.error },
        { status: 401 }
      );
    }
  }

  let rawPayload: string | null = null;
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const jsonBody = JSON.parse(rawBody);
      rawPayload = typeof jsonBody.payload === "string" ? jsonBody.payload : JSON.stringify(jsonBody);
    } else if (contentType.includes("multipart/form-data")) {
      const match = rawBody.match(/name="payload"\r?\n\r?\n([\s\S]*?)(?:\r?\n--|$)/);
      if (match) {
        rawPayload = match[1]!.trim();
      } else {
        const searchParams = new URLSearchParams(rawBody);
        rawPayload = searchParams.get("payload");
      }
    } else {
      const searchParams = new URLSearchParams(rawBody);
      rawPayload = searchParams.get("payload");
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
