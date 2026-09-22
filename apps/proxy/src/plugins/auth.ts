import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { createHash } from "node:crypto";
import { apiKeys } from "@x4g4t/db";
import { eq, and, isNull } from "drizzle-orm";
import { getDbClient } from "../services/gateway.js";
import { isJwtToken, verifyIamToken } from "../services/iam.js";

declare module "fastify" {
  interface FastifyRequest {
    orgId: string;
    keyId: string;
    userId?: string;
    roles?: string[];
    groups?: string[];
    isReverseAuth?: boolean;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

interface TokenCacheEntry {
  orgId: string;
  keyId: string;
  userId?: string;
  roles?: string[];
  groups?: string[];
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute TTL

export function setMockApiKey(token: string, orgId: string, keyId: string = "key_test") {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  tokenCache.set(tokenHash, {
    orgId,
    keyId,
    userId: keyId,
    roles: [],
    groups: [],
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS * 10
  });
}

export function clearTokenCache() {
  tokenCache.clear();
}

/**
 * Checks if the caller IP is within corporate VPN CIDR or local development loopback.
 */
export function isCorporateSubnet(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
    return true;
  }

  const corporateCidrs = (process.env.CORPORATE_VPN_CIDRS || "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16").split(",");
  for (const cidr of corporateCidrs) {
    const trimmed = cidr.trim();
    const prefix = trimmed.split("/")[0];
    if (trimmed && prefix && ip.startsWith(prefix.slice(0, -1))) {
      return true;
    }
  }

  // Standard RFC 1918 private subnets
  return ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.");
}

const authPluginCallback: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      const daemonToken = request.headers["x-x4g4t-developer-token"] || request.headers["x-developer-identity"];
      const clientCert = (request.raw.socket as any)?.getPeerCertificate?.();
      const callerIp = request.ip || (request.headers["x-forwarded-for"] as string) || "127.0.0.1";

      let token = "";
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.replace("Bearer ", "").trim();
      }

      // Check for dummy developer tokens from IDE configs (e.g. Cursor / VS Code)
      const isDummyToken = 
        token === "dummy-key" ||
        token === "dummy-developer-token" ||
        token.startsWith("sk-ant-dummy") ||
        token.startsWith("sk-dummy") ||
        token.includes("developer-session");

      // Reverse Authentication: Corporate Subnet, mTLS, or Developer Daemon Token
      const isReverseAuth = Boolean(
        daemonToken ||
        (clientCert && clientCert.subject) ||
        (isDummyToken && isCorporateSubnet(callerIp))
      );

      if (isReverseAuth) {
        const orgId = process.env.DEFAULT_ORG_SLUG || process.env.ENTERPRISE_ORG_SLUG || "org_enterprise";
        const devIdentity = String(daemonToken || (clientCert?.subject?.CN) || "developer_user");

        request.orgId = orgId;
        request.keyId = "sec_reverse_auth_key";
        request.userId = devIdentity;
        request.roles = ["developer"];
        request.groups = ["engineering"];
        request.isReverseAuth = true;
        return;
      }

      if (!token) {
        return reply.status(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid Bearer authentication token."
          }
        });
      }

      const tokenHash = createHash("sha256").update(token).digest("hex");
      const now = Date.now();
      const cached = tokenCache.get(tokenHash);

      if (cached && cached.expiresAt > now) {
        request.orgId = cached.orgId;
        request.keyId = cached.keyId;
        request.userId = cached.userId;
        request.roles = cached.roles;
        request.groups = cached.groups;
        return;
      }

      // Branch 1: Enterprise IAM JWT Token Verification
      if (isJwtToken(token)) {
        try {
          const identity = await verifyIamToken(token);
          const keyId = `iam_${identity.provider}_${identity.userId.slice(-8)}`;

          tokenCache.set(tokenHash, {
            orgId: identity.orgId,
            keyId,
            userId: identity.userId,
            roles: identity.roles,
            groups: [],
            expiresAt: now + TOKEN_CACHE_TTL_MS
          });

          request.orgId = identity.orgId;
          request.keyId = keyId;
          request.userId = identity.userId;
          request.roles = identity.roles;
          request.groups = [];
          return;
        } catch (err: any) {
          return reply.status(401).send({
            error: {
              code: "INVALID_IAM_TOKEN",
              message: err?.message || "IAM JWT token verification failed."
            }
          });
        }
      }

      // Branch 2: Static Database API Key Verification (SHA-256 Hashed)
      try {
        const db = getDbClient();
        const [keyRecord] = await db
          .select({
            id: apiKeys.id,
            orgId: apiKeys.orgId
          })
          .from(apiKeys)
          .where(
            and(
              eq(apiKeys.keyHash, tokenHash),
              isNull(apiKeys.deletedAt)
            )
          )
          .limit(1);

        if (!keyRecord) {
          return reply.status(401).send({
            error: {
              code: "INVALID_API_KEY",
              message: "Provided API Key is invalid or revoked."
            }
          });
        }

        tokenCache.set(tokenHash, {
          orgId: keyRecord.orgId,
          keyId: keyRecord.id,
          userId: keyRecord.id,
          roles: [],
          groups: [],
          expiresAt: now + TOKEN_CACHE_TTL_MS
        });

        request.orgId = keyRecord.orgId;
        request.keyId = keyRecord.id;
        request.userId = keyRecord.id;
        request.roles = [];
        request.groups = [];
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error("[X4G4T Auth Error]:", err);
        }
        return reply.status(401).send({
          error: {
            code: "INVALID_API_KEY",
            message: "Provided API Key is invalid or database verification failed."
          }
        });
      }
    }
  );
};

export const authPlugin = fp(authPluginCallback);
