import { createHash, createHmac } from "node:crypto";

export interface IamIdentity {
  userId: string;
  orgId: string;
  email?: string;
  roles: string[];
  provider: "clerk" | "workos" | "oidc" | "cognito" | "azure_ad" | "custom";
}

export interface JwtClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  org_id?: string;
  org_slug?: string;
  tid?: string; // Azure AD tenant ID
  "custom:org_id"?: string; // AWS Cognito custom attribute
  email?: string;
  roles?: string[];
  groups?: string[];
  "cognito:groups"?: string[];
  [key: string]: unknown;
}

/**
 * Checks whether a token is formatted as a 3-part base64url JSON Web Token (JWT).
 */
export function isJwtToken(token: string): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Decodes a base64url encoded string into a UTF-8 JSON object.
 */
function decodeBase64Url<T = unknown>(segment: string): T {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const jsonStr = Buffer.from(base64 + pad, "base64").toString("utf8");
  return JSON.parse(jsonStr) as T;
}

/**
 * Verifies and extracts normalized identity claims from an enterprise IAM JWT.
 */
export async function verifyIamToken(token: string): Promise<IamIdentity> {
  if (!isJwtToken(token)) {
    throw new Error("Invalid token structure: Expected 3-part JWT.");
  }

  const parts = token.split(".");
  const [headerB64, payloadB64, signatureB64] = parts;

  // SEC-03: Cryptographic Signature Verification
  const jwtSecret = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET;
  const enforceSignature = process.env.ENFORCE_JWT_SIGNATURE === "true" || process.env.NODE_ENV === "production";

  if (jwtSecret) {
    const expectedSig = createHmac("sha256", jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    if (signatureB64 !== expectedSig) {
      throw new Error("JWT signature verification failed: signature invalid.");
    }
  } else if (enforceSignature) {
    throw new Error("JWT signature verification failed: IAM_JWT_SECRET not configured for production environment.");
  }

  let payload: JwtClaims;

  try {
    payload = decodeBase64Url<JwtClaims>(payloadB64!);
  } catch (err) {
    throw new Error("Malformed JWT: Unable to decode header or payload.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  // Validate token expiration
  if (payload.exp !== undefined && payload.exp < nowSeconds) {
    throw new Error(`JWT expired at timestamp ${payload.exp} (current: ${nowSeconds}).`);
  }

  // Validate token activation window
  if (payload.nbf !== undefined && payload.nbf > nowSeconds) {
    throw new Error(`JWT is not yet valid (nbf: ${payload.nbf}, current: ${nowSeconds}).`);
  }

  // Validate subject identifier
  const sub = payload.sub;
  if (!sub) {
    throw new Error("JWT missing subject ('sub') claim.");
  }

  // Provider-specific claim validation and identity inference
  const iss = payload.iss || "";
  const aud = payload.aud;
  let provider: IamIdentity["provider"] = "custom";

  // Provider: Clerk
  const clerkIssuer = process.env.CLERK_ISSUER;
  if (
    (clerkIssuer && iss === clerkIssuer) ||
    iss.includes("clerk.") ||
    iss.includes("clerk.accounts.dev") ||
    sub.startsWith("user_")
  ) {
    provider = "clerk";
  }

  // Provider: WorkOS
  const workosIssuer = process.env.WORKOS_ISSUER || "https://api.workos.com";
  if (iss === workosIssuer || iss.includes("workos.com")) {
    provider = "workos";
  }

  // Provider: Okta / Auth0 / Generic OIDC
  const oidcIssuer = process.env.OIDC_ISSUER_URL;
  const oidcAudience = process.env.OIDC_AUDIENCE || process.env.OIDC_CLIENT_ID;
  if (oidcIssuer && iss === oidcIssuer) {
    provider = "oidc";
    if (oidcAudience) {
      const audList = Array.isArray(aud) ? aud : [aud];
      if (!audList.includes(oidcAudience)) {
        throw new Error(`OIDC JWT audience mismatch: expected '${oidcAudience}', received '${aud}'.`);
      }
    }
  }

  // Provider: AWS Cognito
  const cognitoPoolId = process.env.AWS_COGNITO_USER_POOL_ID;
  const cognitoRegion = process.env.AWS_COGNITO_REGION || "us-east-1";
  const expectedCognitoIss = cognitoPoolId
    ? `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoPoolId}`
    : undefined;

  if (
    (expectedCognitoIss && iss === expectedCognitoIss) ||
    iss.includes("cognito-idp.")
  ) {
    provider = "cognito";
    const cognitoClientId = process.env.AWS_COGNITO_CLIENT_ID;
    if (cognitoClientId && aud) {
      const audList = Array.isArray(aud) ? aud : [aud];
      if (!audList.includes(cognitoClientId)) {
        throw new Error(`AWS Cognito audience mismatch: expected client '${cognitoClientId}'.`);
      }
    }
  }

  // Provider: Azure Active Directory / Microsoft Entra ID
  const azureTenantId = process.env.AZURE_AD_TENANT_ID;
  const azureClientId = process.env.AZURE_AD_CLIENT_ID;
  if (
    iss.includes("login.microsoftonline.com") ||
    iss.includes("sts.windows.net") ||
    (azureTenantId && iss.includes(azureTenantId))
  ) {
    provider = "azure_ad";
    if (azureClientId && aud) {
      const audList = Array.isArray(aud) ? aud : [aud];
      if (!audList.includes(azureClientId)) {
        throw new Error(`Azure AD audience mismatch: expected client '${azureClientId}'.`);
      }
    }
  }

  // Extract or derive tenant organization identifier
  // Respect explicit org claims (Clerk org_id, Azure AD tid, Cognito custom:org_id, WorkOS org_id)
  let orgId =
    payload.org_id ||
    payload["custom:org_id"] ||
    (provider === "azure_ad" && payload.tid ? `org_azure_${payload.tid.slice(0, 8)}` : undefined);

  if (!orgId) {
    // Deterministic fallback derived from user subject
    const subHash = createHash("sha256").update(sub).digest("hex").slice(0, 8);
    orgId = `org_${subHash}`;
  }

  // Extract normalized role memberships
  const roles: string[] = [];
  if (Array.isArray(payload.roles)) {
    roles.push(...payload.roles.map(String));
  }
  if (Array.isArray(payload.groups)) {
    roles.push(...payload.groups.map(String));
  }
  if (Array.isArray(payload["cognito:groups"])) {
    roles.push(...payload["cognito:groups"].map(String));
  }

  return {
    userId: sub,
    orgId,
    email: payload.email,
    roles,
    provider
  };
}

