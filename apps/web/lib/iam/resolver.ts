import { detectActiveIamProvider, IamProviderType } from "./config";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

export type IamRole = "admin" | "developer";

export interface IamUserSession {
  userId: string;
  firstName: string;
  email?: string;
  orgSlug: string;
  orgName: string;
  provider: IamProviderType;
  role: IamRole;
  groups: string[];
}

export const DEFAULT_ADMIN_GROUPS = [
  "admin",
  "admins",
  "administrator",
  "administrators",
  "domain admins",
  "enterprise admins",
  "x4g4t-admins",
  "secops",
  "security-team",
  "org:admin",
  "global administrator",
  "cloud application administrator",
];

export const DEFAULT_DEVELOPER_GROUPS = [
  "developer",
  "developers",
  "engineer",
  "engineers",
  "domain users",
  "x4g4t-developers",
  "org:member",
  "standard users",
];

interface CachedClerkUser {
  email?: string;
  firstName?: string;
  groups: string[];
  role?: string;
}

const clerkUserCache = new Map<string, { user: CachedClerkUser; expiresAt: number }>();

async function fetchClerkUser(userId: string): Promise<CachedClerkUser | null> {
  const cached = clerkUserCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    const client = clerkClient();
    const user = await Promise.race([
      client.users.getUser(userId),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500)),
    ]);

    if (!user) return null;

    const email = user.emailAddresses?.[0]?.emailAddress;
    const firstName = user.firstName || "Enterprise User";
    const pubMeta = (user.publicMetadata || {}) as Record<string, any>;
    const unsafeMeta = (user.unsafeMetadata || {}) as Record<string, any>;

    const groups: string[] = [];
    if (Array.isArray(pubMeta.groups)) groups.push(...pubMeta.groups.map(String));
    if (Array.isArray(unsafeMeta.groups)) groups.push(...unsafeMeta.groups.map(String));
    if (Array.isArray(pubMeta.ad_groups)) groups.push(...pubMeta.ad_groups.map(String));
    if (typeof pubMeta.groups === "string") groups.push(...pubMeta.groups.split(",").map((s: string) => s.trim()));
    if (typeof pubMeta.ad_groups === "string") groups.push(...pubMeta.ad_groups.split(",").map((s: string) => s.trim()));

    const role = (pubMeta.role as string) || (unsafeMeta.role as string) || undefined;

    const result: CachedClerkUser = {
      email,
      firstName,
      groups,
      role,
    };

    clerkUserCache.set(userId, { user: result, expiresAt: Date.now() + 5 * 60 * 1000 });
    return result;
  } catch {
    return null;
  }
}

export function extractGroupsFromClaims(claims: any): string[] {
  const groups = new Set<string>();

  const rawSources = [
    claims?.groups,
    claims?.ad_groups,
    claims?.adGroups,
    claims?.roles,
    claims?.["cognito:groups"],
    claims?.["https://schemas.microsoft.com/ws/2008/06/identity/claims/groups"],
    claims?.["https://schemas.microsoft.com/ws/2008/06/identity/claims/role"],
    claims?.public_metadata?.groups,
    claims?.public_metadata?.ad_groups,
    claims?.metadata?.groups,
    claims?.unsafe_metadata?.groups,
    claims?.org_role,
  ];

  for (const src of rawSources) {
    if (Array.isArray(src)) {
      for (const item of src) {
        if (typeof item === "string" && item.trim()) groups.add(item.trim());
      }
    } else if (typeof src === "string" && src.trim()) {
      for (const item of src.split(",")) {
        if (item.trim()) groups.add(item.trim());
      }
    }
  }

  return Array.from(groups);
}

export function extractEmailFromClaims(claims: any): string | undefined {
  if (claims?.email && typeof claims.email === "string") return claims.email.trim();
  if (claims?.email_address && typeof claims.email_address === "string") return claims.email_address.trim();
  if (claims?.primary_email_address && typeof claims.primary_email_address === "string") return claims.primary_email_address.trim();
  if (claims?.upn && typeof claims.upn === "string") return claims.upn.trim();
  if (claims?.preferred_username && typeof claims.preferred_username === "string" && claims.preferred_username.includes("@")) {
    return claims.preferred_username.trim();
  }
  return undefined;
}

export function determineRole(params: {
  userId: string;
  email?: string;
  groups: string[];
  roleClaim?: string;
  defaultRole: IamRole;
}): IamRole {
  const { userId, groups, roleClaim, defaultRole } = params;

  // 1. AD / IAM Group Matching (Primary Source of Truth in Enterprise IAM)
  const configuredAdminGroups = (process.env.ADMIN_GROUPS || "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  const adminGroupSet = new Set([...DEFAULT_ADMIN_GROUPS, ...configuredAdminGroups]);

  const configuredDevGroups = (process.env.DEVELOPER_GROUPS || "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
  const devGroupSet = new Set([...DEFAULT_DEVELOPER_GROUPS, ...configuredDevGroups]);

  const normUserGroups = groups.map((g) => g.toLowerCase().trim());

  // Priority 1: Admin AD Groups (Admins win)
  if (normUserGroups.some((g) => adminGroupSet.has(g))) {
    return "admin";
  }

  // Priority 2: Developer AD Groups
  if (normUserGroups.some((g) => devGroupSet.has(g))) {
    return "developer";
  }

  // 2. Explicit Role Claims
  if (roleClaim) {
    const normRole = roleClaim.toLowerCase().trim();
    if (normRole === "admin" || normRole === "org:admin") return "admin";
    if (normRole === "developer" || normRole === "org:member") return "developer";
  }

  // 3. Fallback heuristics
  if (userId.toLowerCase().includes("admin") || process.env.DEFAULT_USER_ROLE === "admin") {
    return "admin";
  }

  return defaultRole;
}

export async function resolveIamUser(): Promise<IamUserSession> {
  const provider = detectActiveIamProvider();

  let roleOverride: IamRole | undefined;
  try {
    const cookieStore = await cookies();
    const cVal = cookieStore.get("x4g4t_role")?.value;
    if (cVal === "admin" || cVal === "developer") {
      roleOverride = cVal;
    }
  } catch {}

  const sharedOrgSlug = process.env.DEFAULT_ORG_SLUG || process.env.ENTERPRISE_ORG_SLUG;
  const defaultRole: IamRole = (process.env.DEFAULT_USER_ROLE === "admin" ? "admin" : "developer");

  // 1. Clerk Authentication
  if (provider === "clerk") {
    try {
      const authObj = await auth();
      const userId = authObj?.userId;
      if (userId) {
        const claims = (authObj.sessionClaims || {}) as any;
        const clerkUserData = await fetchClerkUser(userId);

        const firstName = clerkUserData?.firstName || String(claims?.first_name || claims?.given_name || "Enterprise User");
        const email = clerkUserData?.email || extractEmailFromClaims(claims);
        const metadata = (claims?.public_metadata || claims?.metadata || {}) as any;
        const roleClaim = clerkUserData?.role || metadata?.role || claims?.role;

        const claimsGroups = extractGroupsFromClaims(claims);
        const allGroups = Array.from(new Set([
          ...claimsGroups,
          ...(clerkUserData?.groups || []),
        ]));

        const calculatedRole = determineRole({
          userId: String(userId),
          email,
          groups: allGroups,
          roleClaim,
          defaultRole,
        });

        // Admin role takes absolute precedence: a verified admin is never demoted by stale cookies
        const effectiveRole = calculatedRole === "admin" ? "admin" : (roleOverride || calculatedRole);

        return {
          userId: String(userId),
          firstName,
          email,
          orgSlug: String(sharedOrgSlug || `org_${userId.slice(-8)}`),
          orgName: String(sharedOrgSlug ? "Enterprise Workspace" : `${firstName}'s Workspace`),
          provider: "clerk",
          role: effectiveRole,
          groups: allGroups,
        };
      }
    } catch {
      // Fall through to fallback if Clerk SDK fails or is not reachable
    }
  }

  // 2. WorkOS / OIDC / Cognito / Azure AD / Local
  const defaultUserId = process.env.DEFAULT_USER_ID || "usr_dev_admin";
  const orgSlug = sharedOrgSlug || `org_${defaultUserId.slice(-8)}`;

  const providerNames: Record<IamProviderType, string> = {
    clerk: "Clerk",
    workos: "WorkOS SSO",
    oidc: "Enterprise OIDC",
    cognito: "AWS Cognito",
    azure_ad: "Azure Active Directory",
    local: "Local Dev",
  };

  const defaultEmail = process.env.DEFAULT_USER_EMAIL || (defaultUserId.includes("admin") ? "admin@enterprise.internal" : undefined);
  const fallbackGroups = (process.env.DEFAULT_USER_GROUPS || "").split(",").map((g) => g.trim()).filter(Boolean);

  const calculatedBaseRole = determineRole({
    userId: defaultUserId,
    email: defaultEmail,
    groups: fallbackGroups,
    defaultRole,
  });

  return {
    userId: defaultUserId,
    firstName: "Admin",
    email: defaultEmail || "admin@enterprise.internal",
    orgSlug,
    orgName: sharedOrgSlug ? "Enterprise Workspace" : `${providerNames[provider]} Workspace`,
    provider,
    role: roleOverride || calculatedBaseRole,
    groups: fallbackGroups,
  };
}


