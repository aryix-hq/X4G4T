import { createDbClient, organizations } from "@x4g4t/db";
import { eq, or } from "drizzle-orm";
import { resolveIamUser } from "./iam/resolver";

let dbInstance: ReturnType<typeof createDbClient> | null = null;

export function getDb() {
  if (!dbInstance) {
    const connStr = process.env.DATABASE_URL || "postgres://aegis_admin:mock_secret_password@localhost:5432/x4g4t_db";
    dbInstance = createDbClient(connStr);
  }
  return dbInstance;
}

export interface TenantContext {
  userId: string;
  orgId: string;
  orgName: string;
  role: "admin" | "developer";
}

let mockTenantContext: TenantContext | null = null;

export function setMockTenantContext(ctx: TenantContext | null) {
  mockTenantContext = ctx;
}

export async function getTenantContext(): Promise<TenantContext> {
  // 1. Check for test/mock override
  if (mockTenantContext) {
    return mockTenantContext;
  }

  // 2. Resolve authenticated identity from active IAM provider (Clerk, WorkOS, OIDC, Cognito, Azure AD, Local)
  const iamSession = await resolveIamUser();
  const userId = iamSession.userId;
  const userFirstName = iamSession.firstName;
  const orgSlug = iamSession.orgSlug;
  const role = iamSession.role;
  const db = getDb();

  try {
    // Find or provision organization for current user
    let [org] = await db
      .select()
      .from(organizations)
      .where(or(
        eq(organizations.slug, orgSlug),
        eq(organizations.id, orgSlug),
        eq(organizations.id, "org_default_x4g4t"),
        eq(organizations.slug, "x4g4t-defense")
      ))
      .limit(1);

    if (!org) {
      // Check if default seeded organization exists
      const [defaultOrg] = await db
        .select()
        .from(organizations)
        .where(or(eq(organizations.id, "org_default_x4g4t"), eq(organizations.slug, "x4g4t-defense")))
        .limit(1);

      if (defaultOrg) {
        org = defaultOrg;
      } else {
        const orgName = `${userFirstName}'s Workspace`;
        const [newOrg] = await db
          .insert(organizations)
          .values({
            id: "org_default_x4g4t",
            name: orgName,
            slug: orgSlug,
            billingStatus: "active",
            retentionDays: 90
          })
          .returning();
        org = newOrg;
      }
    }

    return {
      userId,
      orgId: org!.id,
      orgName: org!.name,
      role
    };
  } catch (err) {
    // Return deterministic fallback if database is not reachable during initial setup/testing
    return {
      userId,
      orgId: "org_default_x4g4t",
      orgName: "X4G4T Defense Systems",
      role
    };
  }
}

