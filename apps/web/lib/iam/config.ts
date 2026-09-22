export type IamProviderType =
  | "clerk"
  | "workos"
  | "oidc"
  | "cognito"
  | "azure_ad"
  | "local";

export interface IamProviderConfig {
  provider: IamProviderType;
  isConfigured: boolean;
  details: {
    clerkPublishableKey?: string;
    workosClientId?: string;
    oidcIssuerUrl?: string;
    cognitoUserPoolId?: string;
    azureTenantId?: string;
  };
}

export function isClerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const sk = process.env.CLERK_SECRET_KEY;
  if (!pk || !sk) return false;
  if (
    pk.includes("placeholder") ||
    pk.includes("demo") ||
    pk.includes("mock") ||
    pk.includes("example.com") ||
    pk.includes("Y2xlcmsuZXhhbXBsZS5jb20k") || // base64 for clerk.example.com$
    sk.includes("demo") ||
    sk.includes("placeholder") ||
    sk.includes("dummy") ||
    sk.includes("mock")
  ) {
    return false;
  }
  return true;
}

export function detectActiveIamProvider(): IamProviderType {
  const explicit = process.env.IAM_PROVIDER?.toLowerCase()?.trim();
  if (
    explicit &&
    ["clerk", "workos", "oidc", "cognito", "azure_ad", "local"].includes(explicit)
  ) {
    return explicit as IamProviderType;
  }

  // Auto-detection based on environment variables
  if (isClerkConfigured()) {
    return "clerk";
  }

  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) {
    return "workos";
  }

  if (process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID) {
    return "oidc";
  }

  if (process.env.AWS_COGNITO_USER_POOL_ID && process.env.AWS_COGNITO_CLIENT_ID) {
    return "cognito";
  }

  if (process.env.AZURE_AD_TENANT_ID && process.env.AZURE_AD_CLIENT_ID) {
    return "azure_ad";
  }

  return "local";
}

export function getIamProviderConfig(): IamProviderConfig {
  const provider = detectActiveIamProvider();
  return {
    provider,
    isConfigured: provider !== "local",
    details: {
      clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      workosClientId: process.env.WORKOS_CLIENT_ID,
      oidcIssuerUrl: process.env.OIDC_ISSUER_URL,
      cognitoUserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
      azureTenantId: process.env.AZURE_AD_TENANT_ID
    }
  };
}

