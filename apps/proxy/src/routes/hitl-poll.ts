import { FastifyPluginAsync } from "fastify";
import { hitlRequests, executionLogs } from "@x4g4t/db";
import { eq, and } from "drizzle-orm";
import { getDbClient, forwardDownstream } from "../services/gateway.js";

export interface MockHitlRecord {
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED_HALTED";
  reviewerId: string | null;
  resolvedAt: Date | string | null;
  orgId: string;
  createdAt?: number | Date;
  executionPayload?: {
    downstream_url: string;
    downstream_headers: Record<string, string>;
    arguments: Record<string, unknown>;
  };
  downstreamResponse?: {
    statusCode: number;
    data: unknown;
  };
}

const mockHitlStore = new Map<string, MockHitlRecord>();

export function setMockHitlRecord(holdId: string, record: MockHitlRecord) {
  mockHitlStore.set(holdId, record);
}

export function getMockHitlRecord(holdId: string): MockHitlRecord | undefined {
  return mockHitlStore.get(holdId);
}

export function clearMockHitlRecords() {
  mockHitlStore.clear();
}

export async function approveMockHitlRecord(holdId: string, reviewerId: string = "admin_secops") {
  const record = mockHitlStore.get(holdId);
  if (!record) return null;
  record.status = "APPROVED";
  record.reviewerId = reviewerId;
  record.resolvedAt = new Date();

  if (record.executionPayload) {
    try {
      const forwardResult = await forwardDownstream(
        record.executionPayload.downstream_url,
        record.executionPayload.downstream_headers,
        record.executionPayload.arguments
      );
      record.downstreamResponse = forwardResult;
    } catch (err: any) {
      record.downstreamResponse = {
        statusCode: 502,
        data: { error: { code: "DOWNSTREAM_ERROR", message: err?.message || "Downstream call failed" } }
      };
    }
  }
  return record;
}

export function rejectMockHitlRecord(holdId: string, reviewerId: string = "admin_secops") {
  const record = mockHitlStore.get(holdId);
  if (!record) return null;
  record.status = "REJECTED";
  record.reviewerId = reviewerId;
  record.resolvedAt = new Date();
  return record;
}

export const hitlPollRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/v1/gateway/hitl/:holdId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { holdId } = request.params as { holdId: string };

      // 1. Check in-memory test/mock store first
      const mockRecord = mockHitlStore.get(holdId);
      if (mockRecord) {
        if (mockRecord.orgId !== request.orgId) {
          return reply.status(404).send({
            error: {
              code: "HOLD_NOT_FOUND",
              message: `No active hold registered under ID ${holdId}`
            }
          });
        }

        // Check if hold has expired (TTL 15 minutes = 900,000ms)
        const isExpired =
          mockRecord.createdAt &&
          Date.now() - new Date(mockRecord.createdAt).getTime() > 15 * 60 * 1000;
        if (isExpired) {
          mockRecord.status = "EXPIRED_HALTED";
          return reply.status(200).send({
            status: "EXPIRED_HALTED",
            message: "Approval window expired after 15 minutes. Execution halted."
          });
        }

        if (mockRecord.status === "PENDING") {
          return reply.status(202).send({
            status: "PENDING",
            retry_after_sec: 5
          });
        }

        return reply.status(200).send({
          status: mockRecord.status,
          reviewer: mockRecord.reviewerId,
          resolved_at: mockRecord.resolvedAt,
          response:
            mockRecord.status === "APPROVED"
              ? mockRecord.downstreamResponse?.data ?? { message: "Execution approved by administrator." }
              : undefined,
          message:
            mockRecord.status === "REJECTED"
              ? "Execution rejected by administrator."
              : mockRecord.status === "EXPIRED_HALTED"
              ? "Approval window expired after 15 minutes. Execution halted."
              : undefined
        });
      }

      // 2. Query relational PostgreSQL store
      try {
        const db = getDbClient();
        const [record] = await db
          .select({
            status: hitlRequests.status,
            reviewerId: hitlRequests.reviewerId,
            resolvedAt: hitlRequests.resolvedAt,
            toolName: executionLogs.toolName,
            orgId: executionLogs.orgId
          })
          .from(hitlRequests)
          .innerJoin(executionLogs, eq(hitlRequests.logId, executionLogs.id))
          .where(
            and(
              eq(hitlRequests.id, holdId),
              eq(executionLogs.orgId, request.orgId)
            )
          )
          .limit(1);

        if (!record) {
          return reply.status(404).send({
            error: {
              code: "HOLD_NOT_FOUND",
              message: `No active hold registered under ID ${holdId}`
            }
          });
        }

        if (record.status === "PENDING") {
          return reply.status(202).send({
            status: "PENDING",
            retry_after_sec: 5
          });
        }

        return reply.status(200).send({
          status: record.status,
          reviewer: record.reviewerId,
          resolved_at: record.resolvedAt
        });
      } catch (err) {
        return reply.status(404).send({
          error: {
            code: "HOLD_NOT_FOUND",
            message: `No active hold registered under ID ${holdId}`
          }
        });
      }
    }
  );

  fastify.post(
    "/v1/gateway/hitl/:holdId/resolve",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { holdId } = request.params as { holdId: string };
      const body = (request.body || {}) as { decision: "APPROVED" | "REJECTED"; reason?: string };

      // 1. Check in-memory mock store
      const mockRecord = mockHitlStore.get(holdId);
      if (mockRecord) {
        if (mockRecord.orgId !== request.orgId) {
          return reply.status(404).send({
            error: {
              code: "HOLD_NOT_FOUND",
              message: `No active hold registered under ID ${holdId}`
            }
          });
        }

        if (mockRecord.status !== "PENDING") {
          return reply.status(409).send({
            error: {
              code: "ALREADY_RESOLVED",
              message: `Hold ${holdId} has already been resolved with status ${mockRecord.status}`
            }
          });
        }

        if (body.decision === "APPROVED") {
          let forwardedResponse: any = {};
          if (mockRecord.executionPayload?.downstream_url) {
            try {
              const resp = await fetch(mockRecord.executionPayload.downstream_url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...mockRecord.executionPayload.downstream_headers
                },
                body: JSON.stringify(mockRecord.executionPayload.arguments)
              });
              forwardedResponse = await resp.json();
            } catch (err: any) {
              forwardedResponse = { error: err?.message || "Failed downstream" };
            }
          }
          mockRecord.status = "APPROVED";
          mockRecord.reviewerId = (request as any).keyId || "admin_secops";
          mockRecord.resolvedAt = new Date();
          mockRecord.downstreamResponse = { statusCode: 200, data: forwardedResponse };

          return reply.status(200).send({
            status: "APPROVED",
            reviewer: mockRecord.reviewerId,
            resolved_at: mockRecord.resolvedAt,
            forwardedResponse
          });
        } else {
          mockRecord.status = "REJECTED";
          mockRecord.reviewerId = (request as any).keyId || "admin_secops";
          mockRecord.resolvedAt = new Date();

          return reply.status(200).send({
            status: "REJECTED",
            reviewer: mockRecord.reviewerId,
            resolved_at: mockRecord.resolvedAt,
            message: body.reason || "Execution rejected by administrator."
          });
        }
      }

      // 2. Query relational PostgreSQL store
      try {
        const db = getDbClient();
        const [record] = await db
          .select({
            status: hitlRequests.status,
            reviewerId: hitlRequests.reviewerId,
            resolvedAt: hitlRequests.resolvedAt,
            toolName: executionLogs.toolName,
            orgId: executionLogs.orgId
          })
          .from(hitlRequests)
          .innerJoin(executionLogs, eq(hitlRequests.logId, executionLogs.id))
          .where(
            and(
              eq(hitlRequests.id, holdId),
              eq(executionLogs.orgId, request.orgId)
            )
          )
          .limit(1);

        if (!record) {
          return reply.status(404).send({
            error: {
              code: "HOLD_NOT_FOUND",
              message: `No active hold registered under ID ${holdId}`
            }
          });
        }

        if (record.status !== "PENDING") {
          return reply.status(409).send({
            error: {
              code: "ALREADY_RESOLVED",
              message: `Hold ${holdId} has already been resolved with status ${record.status}`
            }
          });
        }

        await db
          .update(hitlRequests)
          .set({
            status: body.decision,
            reviewerId: (request as any).keyId || "admin_secops",
            resolvedAt: new Date()
          })
          .where(eq(hitlRequests.id, holdId));

        return reply.status(200).send({
          status: body.decision,
          reviewer: (request as any).keyId || "admin_secops",
          resolved_at: new Date()
        });
      } catch (err) {
        return reply.status(404).send({
          error: {
            code: "HOLD_NOT_FOUND",
            message: `No active hold registered under ID ${holdId}`
          }
        });
      }
    }
  );
};
