import { createHash } from "node:crypto";
import type { CompiledPolicy } from "@x4g4t/policy-engine";

// In-memory key hash cache to maintain low latency across warm serverless invocations
export const tokenCache = new Map<string, { orgId: string; keyId: string; expiresAt: number }>();

// Mock hooks for local unit testing without a live PostgreSQL connection
export const mockPoliciesMap = new Map<string, CompiledPolicy[]>();

export function setMockApiKey(rawKey: string, orgId: string, keyId: string = "key_mock_1") {
  const tokenHash = createHash("sha256").update(rawKey).digest("hex");
  tokenCache.set(tokenHash, {
    orgId,
    keyId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
}

export function clearTokenCache() {
  tokenCache.clear();
}

export function setMockPoliciesForOrg(orgId: string, pols: CompiledPolicy[]) {
  mockPoliciesMap.set(orgId, pols);
}

export function clearMockPolicies() {
  mockPoliciesMap.clear();
}

