import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectActiveIamProvider, getIamProviderConfig } from "../lib/iam/config";
import { resolveIamUser, determineRole, extractGroupsFromClaims } from "../lib/iam/resolver";
import { getTenantContext, setMockTenantContext } from "../lib/tenant";

describe("Web Multi-Provider IAM Resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    setMockTenantContext(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("detects explicit IAM_PROVIDER setting", () => {
    process.env.IAM_PROVIDER = "workos";
    expect(detectActiveIamProvider()).toBe("workos");

    process.env.IAM_PROVIDER = "oidc";
    expect(detectActiveIamProvider()).toBe("oidc");

    process.env.IAM_PROVIDER = "cognito";
    expect(detectActiveIamProvider()).toBe("cognito");

    process.env.IAM_PROVIDER = "azure_ad";
    expect(detectActiveIamProvider()).toBe("azure_ad");

    process.env.IAM_PROVIDER = "local";
    expect(detectActiveIamProvider()).toBe("local");
  });

  it("auto-detects provider based on configured environment variables", () => {
    delete process.env.IAM_PROVIDER;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    // WorkOS
    process.env.WORKOS_API_KEY = "sk_test_123";
    process.env.WORKOS_CLIENT_ID = "client_123";
    expect(detectActiveIamProvider()).toBe("workos");

    // OIDC
    delete process.env.WORKOS_API_KEY;
    process.env.OIDC_ISSUER_URL = "https://auth.acme.com";
    process.env.OIDC_CLIENT_ID = "client_oidc";
    expect(detectActiveIamProvider()).toBe("oidc");

    // AWS Cognito
    delete process.env.OIDC_ISSUER_URL;
    process.env.AWS_COGNITO_USER_POOL_ID = "us-east-1_xyz";
    process.env.AWS_COGNITO_CLIENT_ID = "client_cognito";
    expect(detectActiveIamProvider()).toBe("cognito");

    // Clerk
    delete process.env.AWS_COGNITO_USER_POOL_ID;
    delete process.env.AWS_COGNITO_CLIENT_ID;
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_ZXhvdGljLWZseS0yMjI4LmNsZXJrLmFjY291bnRzLmRldiQ";
    process.env.CLERK_SECRET_KEY = "sk_test_5cu2Z3lbV53aiRdtBIBW0AoqkPLOKqwNyg0aUkwlQ1";
    expect(detectActiveIamProvider()).toBe("clerk");

    // Clerk with placeholder keys should not be considered configured
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_placeholder";
    process.env.CLERK_SECRET_KEY = "sk_test_placeholder";
    expect(detectActiveIamProvider()).toBe("local");
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;

    // Azure AD
    delete process.env.AWS_COGNITO_USER_POOL_ID;
    process.env.AZURE_AD_TENANT_ID = "tenant_xyz";
    process.env.AZURE_AD_CLIENT_ID = "client_azure";
    expect(detectActiveIamProvider()).toBe("azure_ad");
  });

  it("resolves session identity in local/fallback mode without external IAM keys", async () => {
    process.env.IAM_PROVIDER = "local";
    process.env.DEFAULT_USER_ID = "usr_test_dev_99";

    const session = await resolveIamUser();
    expect(session.userId).toBe("usr_test_dev_99");
    expect(session.provider).toBe("local");
    expect(session.orgName).toContain("Local Dev");
  });

  it("resolves tenant context and generates deterministic organization slug", async () => {
    process.env.IAM_PROVIDER = "local";
    process.env.DEFAULT_USER_ID = "usr_test_dev_99";

    const ctx = await getTenantContext();
    expect(ctx.userId).toBe("usr_test_dev_99");
    expect(ctx.orgId).toBeDefined();
    expect(ctx.orgName).toBeDefined();
  });

  it("resolves Clerk IAM session identity and configuration", async () => {
    process.env.IAM_PROVIDER = "clerk";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_ZXhvdGljLWZseS0yMjI4LmNsZXJrLmFjY291bnRzLmRldiQ";
    process.env.CLERK_SECRET_KEY = "sk_test_5cu2Z3lbV53aiRdtBIBW0AoqkPLOKqwNyg0aUkwlQ1";
    process.env.DEFAULT_USER_ID = "usr_clerk_developer_123";
    process.env.DEFAULT_USER_ROLE = "developer";

    const cfg = getIamProviderConfig();
    expect(cfg.provider).toBe("clerk");
    expect(cfg.isConfigured).toBe(true);
    expect(cfg.details.clerkPublishableKey).toBe(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

    const session = await resolveIamUser();
    expect(session.provider).toBe("clerk");
    expect(session.role).toBe("developer");
    expect(session.userId).toBe("usr_clerk_developer_123");
  });

  it("resolves WorkOS SSO session identity and workspace", async () => {
    process.env.IAM_PROVIDER = "workos";
    process.env.WORKOS_API_KEY = "sk_test_workos_12345";
    process.env.WORKOS_CLIENT_ID = "client_workos_67890";
    process.env.DEFAULT_USER_ID = "usr_workos_dev_456";
    process.env.DEFAULT_USER_ROLE = "developer";

    const cfg = getIamProviderConfig();
    expect(cfg.provider).toBe("workos");
    expect(cfg.isConfigured).toBe(true);
    expect(cfg.details.workosClientId).toBe("client_workos_67890");

    const session = await resolveIamUser();
    expect(session.provider).toBe("workos");
    expect(session.orgName).toContain("WorkOS SSO");
    expect(session.role).toBe("developer");
  });

  it("resolves Enterprise OIDC session identity and workspace", async () => {
    process.env.IAM_PROVIDER = "oidc";
    process.env.OIDC_ISSUER_URL = "https://auth.enterprise.internal";
    process.env.OIDC_CLIENT_ID = "client_enterprise_oidc";
    process.env.DEFAULT_USER_ID = "usr_oidc_dev_789";
    process.env.DEFAULT_USER_ROLE = "developer";

    const cfg = getIamProviderConfig();
    expect(cfg.provider).toBe("oidc");
    expect(cfg.isConfigured).toBe(true);
    expect(cfg.details.oidcIssuerUrl).toBe("https://auth.enterprise.internal");

    const session = await resolveIamUser();
    expect(session.provider).toBe("oidc");
    expect(session.orgName).toContain("Enterprise OIDC");
    expect(session.role).toBe("developer");
  });

  it("resolves AWS Cognito session identity and workspace", async () => {
    process.env.IAM_PROVIDER = "cognito";
    process.env.AWS_COGNITO_USER_POOL_ID = "us-east-1_ProdPool";
    process.env.AWS_COGNITO_CLIENT_ID = "cognito_client_abc";
    process.env.DEFAULT_USER_ID = "usr_cognito_dev_321";
    process.env.DEFAULT_USER_ROLE = "developer";

    const cfg = getIamProviderConfig();
    expect(cfg.provider).toBe("cognito");
    expect(cfg.isConfigured).toBe(true);
    expect(cfg.details.cognitoUserPoolId).toBe("us-east-1_ProdPool");

    const session = await resolveIamUser();
    expect(session.provider).toBe("cognito");
    expect(session.orgName).toContain("AWS Cognito");
    expect(session.role).toBe("developer");
  });

  it("resolves Azure Active Directory session identity and workspace", async () => {
    process.env.IAM_PROVIDER = "azure_ad";
    process.env.AZURE_AD_TENANT_ID = "tenant-guid-9999";
    process.env.AZURE_AD_CLIENT_ID = "client-guid-8888";
    process.env.DEFAULT_USER_ID = "usr_azure_dev_654";
    process.env.DEFAULT_USER_ROLE = "developer";

    const cfg = getIamProviderConfig();
    expect(cfg.provider).toBe("azure_ad");
    expect(cfg.isConfigured).toBe(true);
    expect(cfg.details.azureTenantId).toBe("tenant-guid-9999");

    const session = await resolveIamUser();
    expect(session.provider).toBe("azure_ad");
    expect(session.orgName).toContain("Azure Active Directory");
    expect(session.role).toBe("developer");
  });

  it("enforces admin role when identity contains admin across providers", async () => {
    process.env.IAM_PROVIDER = "azure_ad";
    process.env.DEFAULT_USER_ID = "usr_enterprise_admin_01";

    const session = await resolveIamUser();
    expect(session.role).toBe("admin");
  });

  it("resolves roles strictly based on AD groups (e.g. Domain Admins is admin, Domain Users is developer)", async () => {
    // 1. User with Admin AD group -> admin
    const adminRole = determineRole({
      userId: "user_corp_admin",
      email: "secops.lead@corp.internal",
      groups: ["X4G4T-Admins", "Domain Admins"],
      defaultRole: "developer"
    });
    expect(adminRole).toBe("admin");

    // 2. User with Developer AD group -> developer
    const devRole = determineRole({
      userId: "user_corp_dev",
      email: "app.developer@corp.internal",
      groups: ["X4G4T-Developers", "Domain Users"],
      defaultRole: "developer"
    });
    expect(devRole).toBe("developer");
  });

  it("assigns roles based on AD / IAM groups", () => {
    // AD group Domain Admins -> admin
    expect(
      determineRole({
        userId: "usr_1",
        email: "user1@company.com",
        groups: ["Domain Admins"],
        defaultRole: "developer"
      })
    ).toBe("admin");

    // AD group X4G4T-Admins -> admin
    expect(
      determineRole({
        userId: "usr_2",
        email: "user2@company.com",
        groups: ["X4G4T-Admins"],
        defaultRole: "developer"
      })
    ).toBe("admin");

    // AD group SecOps -> admin
    expect(
      determineRole({
        userId: "usr_3",
        email: "user3@company.com",
        groups: ["secops"],
        defaultRole: "developer"
      })
    ).toBe("admin");

    // AD group Developers -> developer
    expect(
      determineRole({
        userId: "usr_4",
        email: "user4@company.com",
        groups: ["Developers"],
        defaultRole: "admin" // even if default is admin, dev group specifies developer
      })
    ).toBe("developer");

    // AD group Domain Users -> developer
    expect(
      determineRole({
        userId: "usr_5",
        email: "user5@company.com",
        groups: ["Domain Users"],
        defaultRole: "admin"
      })
    ).toBe("developer");

    // User in both admin and dev groups -> Admin-wins
    expect(
      determineRole({
        userId: "usr_6",
        email: "user6@company.com",
        groups: ["Domain Users", "Domain Admins"],
        defaultRole: "developer"
      })
    ).toBe("admin");
  });

  it("extracts groups correctly from various IAM JWT claim formats", () => {
    // Azure AD / ADFS groups claim
    const azureClaims = {
      "https://schemas.microsoft.com/ws/2008/06/identity/claims/groups": ["Group-A", "Group-B"]
    };
    expect(extractGroupsFromClaims(azureClaims)).toEqual(expect.arrayContaining(["Group-A", "Group-B"]));

    // AWS Cognito groups claim
    const cognitoClaims = {
      "cognito:groups": ["Cognito-Admins"]
    };
    expect(extractGroupsFromClaims(cognitoClaims)).toEqual(["Cognito-Admins"]);

    // Clerk org_role claim
    const clerkClaims = {
      org_role: "org:admin",
      public_metadata: {
        groups: ["X4G4T-Admins"]
      }
    };
    expect(extractGroupsFromClaims(clerkClaims)).toEqual(expect.arrayContaining(["org:admin", "X4G4T-Admins"]));
  });
});


