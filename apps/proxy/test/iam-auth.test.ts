import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { authPlugin, setMockApiKey } from "../src/plugins/auth.js";

// Helper to construct a base64url JWT
function createMockJwt(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", typ: "JWT" }): string {
  const enc = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  return `${enc(header)}.${enc(payload)}.mock_signature_bytes`;
}

describe("Enterprise IAM Multi-Provider Authentication", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Set up environment variables for testing providers
    process.env.OIDC_ISSUER_URL = "https://auth.acme-corp.com/oauth2/default";
    process.env.OIDC_AUDIENCE = "https://api.x4g4t.internal";
    process.env.AWS_COGNITO_USER_POOL_ID = "us-east-1_TestPool123";
    process.env.AWS_COGNITO_CLIENT_ID = "cognito_client_999";
    process.env.AWS_COGNITO_REGION = "us-east-1";
    process.env.AZURE_AD_TENANT_ID = "tenant-uuid-1111-2222";
    process.env.AZURE_AD_CLIENT_ID = "azure-client-uuid-3333";

    app = Fastify();
    await app.register(authPlugin);

    app.get("/test/protected", { preHandler: [app.authenticate] }, async (req) => {
      return {
        status: "OK",
        orgId: req.orgId,
        keyId: req.keyId
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("authenticates a valid Clerk IAM JWT token", async () => {
    const token = createMockJwt({
      sub: "user_2aBcdEfgH123456",
      iss: "https://clerk.acme.com",
      org_id: "org_clerk_enterprise_99",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgId).toBe("org_clerk_enterprise_99");
    expect(body.keyId).toContain("iam_clerk_");
  });

  it("authenticates a valid WorkOS SSO JWT token", async () => {
    const token = createMockJwt({
      sub: "user_workos_987654",
      iss: "https://api.workos.com",
      org_id: "org_workos_fintech",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgId).toBe("org_workos_fintech");
    expect(body.keyId).toContain("iam_workos_");
  });

  it("authenticates a valid Okta / Auth0 / Generic OIDC JWT token", async () => {
    const token = createMockJwt({
      sub: "okta_sub_456789",
      iss: "https://auth.acme-corp.com/oauth2/default",
      aud: "https://api.x4g4t.internal",
      org_id: "org_okta_finance",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgId).toBe("org_okta_finance");
    expect(body.keyId).toContain("iam_oidc_");
  });

  it("authenticates a valid AWS Cognito JWT token", async () => {
    const token = createMockJwt({
      sub: "cognito-uuid-777",
      iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool123",
      aud: "cognito_client_999",
      "custom:org_id": "org_aws_devops",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgId).toBe("org_aws_devops");
    expect(body.keyId).toContain("iam_cognito_");
  });

  it("authenticates a valid Azure Active Directory / Microsoft Entra ID JWT token", async () => {
    const token = createMockJwt({
      sub: "azure-user-oid-888",
      iss: "https://login.microsoftonline.com/tenant-uuid-1111-2222/v2.0",
      aud: "azure-client-uuid-3333",
      tid: "tenant-uuid-1111-2222",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgId).toBe("org_azure_tenant-u");
    expect(body.keyId).toContain("iam_azure_ad_");
  });

  it("rejects an expired IAM JWT token with 401 INVALID_IAM_TOKEN", async () => {
    const expiredToken = createMockJwt({
      sub: "user_expired_001",
      iss: "https://clerk.acme.com",
      exp: Math.floor(Date.now() / 1000) - 300 // expired 5 minutes ago
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${expiredToken}` }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_IAM_TOKEN");
    expect(body.error.message).toContain("JWT expired");
  });

  it("rejects an OIDC token with audience mismatch", async () => {
    const wrongAudToken = createMockJwt({
      sub: "okta_sub_unauthorized",
      iss: "https://auth.acme-corp.com/oauth2/default",
      aud: "https://wrong-audience.internal",
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${wrongAudToken}` }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_IAM_TOKEN");
    expect(body.error.message).toContain("audience mismatch");
  });

  it("rejects a malformed token structure", async () => {
    const malformedToken = "not.a.valid.jwt.payload.here";

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${malformedToken}` }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe("INVALID_API_KEY"); // Falls through to DB lookup and fails
  });

  it("maintains seamless backwards compatibility with static API keys", async () => {
    const testApiKey = "sec_live_iam_compat_test_key_12345";
    setMockApiKey(testApiKey, "org_static_api_key_org", "key_static_1");

    const res = await app.inject({
      method: "GET",
      url: "/test/protected",
      headers: { authorization: `Bearer ${testApiKey}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orgId).toBe("org_static_api_key_org");
    expect(body.keyId).toBe("key_static_1");
  });

  it("strictly forbids demo and dummy credentials when NODE_ENV is production without X4G4T_DEV_MODE", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDevMode = process.env.X4G4T_DEV_MODE;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.X4G4T_DEV_MODE;

      const res = await app.inject({
        method: "GET",
        url: "/test/protected",
        headers: { authorization: "Bearer dummy-key" }
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("DEMO_CREDENTIALS_FORBIDDEN_IN_PRODUCTION");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevDevMode !== undefined) {
        process.env.X4G4T_DEV_MODE = prevDevMode;
      }
    }
  });

  it("permits dummy credentials in production when X4G4T_DEV_MODE=true is explicitly set", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDevMode = process.env.X4G4T_DEV_MODE;
    try {
      process.env.NODE_ENV = "production";
      process.env.X4G4T_DEV_MODE = "true";

      const res = await app.inject({
        method: "GET",
        url: "/test/protected",
        headers: { authorization: "Bearer dummy-key" }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("OK");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevDevMode !== undefined) {
        process.env.X4G4T_DEV_MODE = prevDevMode;
      } else {
        delete process.env.X4G4T_DEV_MODE;
      }
    }
  });
});

