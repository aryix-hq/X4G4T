import { Worker, Job } from "bullmq";
import { getRedisConnection, AuditLogJobPayload } from "../services/queue.js";
import { executionLogs, hitlRequests } from "@x4g4t/db";
import { computeLogRecordHash, exportLogToExternalServices } from "@x4g4t/policy-engine";
import { getDbClient } from "../services/gateway.js";

const SLACK_WEBHOOK_URL = process.env.SLACK_HITL_WEBHOOK_URL;

export interface SendSlackParams {
  hitlId: string;
  agentId: string;
  toolName: string;
  args: Record<string, unknown>;
  latencyMs: number;
}

export function buildSlackHitlPayload(params: SendSlackParams) {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Human Approval Required for Agent Action",
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Agent ID:*\n\`${params.agentId}\`` },
          { type: "mrkdwn", text: `*Target Tool:*\n\`${params.toolName}\`` }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Payload Arguments:*\n\`\`\`${JSON.stringify(params.args, null, 2)}\`\`\``
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve Execution", emoji: true },
            style: "primary",
            value: JSON.stringify({ action: "APPROVED", hitlId: params.hitlId })
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Reject / Terminate", emoji: true },
            style: "danger",
            value: JSON.stringify({ action: "REJECTED", hitlId: params.hitlId })
          }
        ]
      }
    ]
  };
}

export async function sendSlackHitlCard(params: SendSlackParams): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    return false;
  }

  const payload = buildSlackHitlPayload(params);

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error("[X4G4T Slack Webhook Error]:", err);
    return false;
  }
}

let lastKnownRecordHash: string | null = null;

export async function processAuditJob(data: AuditLogJobPayload, db = getDbClient()) {
  const createdAtDate = new Date(data.createdAt);

  // Compute ISO 27001 tamper-evident hash
  const recordHash = computeLogRecordHash({
    id: data.orgId + ":" + data.agentId,
    previousRecordHash: lastKnownRecordHash,
    toolName: data.toolName,
    verdict: data.verdict,
    createdAt: createdAtDate
  });
  lastKnownRecordHash = recordHash;

  // Persist immutable execution audit record
  const [logRecord] = await db
    .insert(executionLogs)
    .values({
      orgId: data.orgId,
      agentId: data.agentId,
      toolName: data.toolName,
      arguments: data.arguments,
      verdict: data.verdict,
      triggeredPolicyId: data.triggeredPolicyId ?? null,
      latencyMs: data.latencyMs,
      previousRecordHash: lastKnownRecordHash,
      recordHash: recordHash,
      isPiiRedacted: "true",
      createdAt: createdAtDate
    })
    .returning();

  // Create pending HITL request and alert reviewers via Slack if execution was held
  let hitlRecord: typeof hitlRequests.$inferSelect | undefined;
  if (data.verdict === "HELD" && logRecord) {
    const [insertedHitl] = await db
      .insert(hitlRequests)
      .values({
        logId: logRecord.id,
        status: "PENDING"
      })
      .returning();

    hitlRecord = insertedHitl;

    if (insertedHitl) {
      await sendSlackHitlCard({
        hitlId: insertedHitl.id,
        agentId: data.agentId,
        toolName: data.toolName,
        args: data.arguments,
        latencyMs: data.latencyMs
      });
    }
  }

  // Asynchronously forward telemetry to Elasticsearch and external collectors
  void exportLogToExternalServices({
    orgId: data.orgId,
    agentId: data.agentId,
    toolName: data.toolName,
    arguments: data.arguments,
    verdict: data.verdict,
    triggeredPolicyId: data.triggeredPolicyId ?? null,
    latencyMs: data.latencyMs,
    recordHash: recordHash,
    createdAt: data.createdAt
  });

  return { logRecord, hitlRecord };
}

export function startAuditWorker() {
  const connection = getRedisConnection();

  const worker = new Worker<AuditLogJobPayload>(
    "audit-logs",
    async (job: Job<AuditLogJobPayload>) => {
      return await processAuditJob(job.data);
    },
    {
      connection,
      concurrency: 20
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[X4G4T Worker] Audit job ${job?.id} failed:`, err);
  });

  return worker;
}

