# X4G4T Enterprise IAM & Multi-Provider Authentication Guide

> **Production Guide for Connecting X4G4T to Enterprise Identity & Access Management (IAM) Providers.**  
> *Seamless dual-mode authentication supporting both static API keys and enterprise JWT Bearer tokens.*

---

## Table of Contents

1. [Dual-Mode Authentication Architecture](#1-dual-mode-authentication-architecture)
2. [Supported IAM Providers & Environment Variables](#2-supported-iam-providers--environment-variables)
3. [Provider Setup & Configuration](#3-provider-setup--configuration)
   - [3.1 Clerk IAM](#31-clerk-iam)
   - [3.2 WorkOS (Enterprise SSO & SAML 2.0)](#32-workos-enterprise-sso--saml-20)
   - [3.3 Okta / Auth0 / Generic OpenID Connect (OIDC)](#33-okta--auth0--generic-openid-connect-oidc)
   - [3.4 AWS IAM / Amazon Cognito User Pools](#34-aws-iam--amazon-cognito-user-pools)
   - [3.5 Azure Active Directory / Microsoft Entra ID](#35-azure-active-directory--microsoft-entra-id)
4. [Token Structure & Identity Claims Mapping](#4-token-structure--identity-claims-mapping)
5. [Agent & Service Mesh Integration](#5-agent--service-mesh-integration)
6. [Local Development & Safe Fallback Mode](#6-local-development--safe-fallback-mode)

---

## 1. Dual-Mode Authentication Architecture

X4G4T supports two distinct, concurrent authentication pathways for incoming requests to the Fastify proxy (`:4000`) and the Vercel serverless gateway (`:3000`):

```
                                    ┌───────────────────────────────┐
                                    │ Incoming Request              │
                                    │ Authorization: Bearer <token> │
                                    └──────────────┬────────────────┘
                                                   │
                                    Is Token a 3-part JWT?
                                    (header.payload.signature)
                                           /               \
                                    YES   /                 \  NO
                                         ▼                   ▼
                     ┌───────────────────────┐   ┌───────────────────────┐
                     │ Enterprise IAM Engine │   │ Static API Key Engine │
                     │  - Clerk              │   │  - SHA-256 Hashing    │
                     │  - WorkOS SSO         │   │  - DB Cache (5m TTL)  │
                     │  - Okta / Auth0 / OIDC│   │  - Tenant Scoping     │
                     │  - AWS Cognito        │   └───────────────────────┘
                     │  - Azure AD / Entra ID│
                     └───────────────────────┘
```

1. **Enterprise IAM JWT Tokens (`Bearer eyJ...`)**:
   - Ideal for agent runtimes running inside enterprise service meshes, Kubernetes clusters, or employee SSO sessions.
   - Automatically validates expiration (`exp`), not-before (`nbf`), issuer (`iss`), and audience (`aud`).
   - Extracts tenant organization ID, user identity, and RBAC roles directly from cryptographic claims.
   - Caches verified sessions in-memory for 5 minutes (`TOKEN_CACHE_TTL_MS`) to maintain $<0.05\,\text{ms}$ authentication overhead.

2. **Static API Keys (`Bearer sec_live_...`)**:
   - Ideal for headless server-to-server agents, cron jobs, and CI/CD pipelines.
   - 256-bit entropy generated keys stored as SHA-256 hashes in PostgreSQL.
   - Instant revocation capability from the X4G4T Web Dashboard.

---

## 2. Supported IAM Providers & Environment Variables

All IAM configuration is managed via environment variables defined in your root `.env` (or Vercel / Kubernetes secrets):

| Variable | Description | Provider | Example |
| :--- | :--- | :--- | :--- |
| `IAM_PROVIDER` | Active provider (`auto`, `clerk`, `workos`, `oidc`, `cognito`, `azure_ad`, `local`) | Global | `auto` |
| `DEFAULT_USER_ID` | Fallback user ID for local development / testing | Global | `usr_dev_admin` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Publishable Key | Clerk | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk Backend Secret Key | Clerk | `sk_test_...` |
| `CLERK_ISSUER` | Optional explicit Clerk issuer URL | Clerk | `https://clerk.yourdomain.com` |
| `WORKOS_API_KEY` | WorkOS API Secret Key | WorkOS | `sk_live_...` |
| `WORKOS_CLIENT_ID` | WorkOS Project Client ID | WorkOS | `client_...` |
| `WORKOS_ISSUER` | WorkOS JWT Issuer URL | WorkOS | `https://api.workos.com` |
| `OIDC_ISSUER_URL` | OpenID Connect Issuer URL | Okta/Auth0 | `https://auth.company.com/oauth2/default` |
| `OIDC_CLIENT_ID` | OIDC Client Identifier | Okta/Auth0 | `x4g4t-gateway-client` |
| `OIDC_AUDIENCE` | Expected JWT Audience Claim | Okta/Auth0 | `https://api.x4g4t.internal` |
| `AWS_COGNITO_USER_POOL_ID` | Amazon Cognito User Pool ID | AWS | `us-east-1_abcdef123` |
| `AWS_COGNITO_CLIENT_ID` | Cognito App Client ID | AWS | `1234567890abcdefghijklmnop` |
| `AWS_COGNITO_REGION` | AWS Region of Cognito Pool | AWS | `us-east-1` |
| `AZURE_AD_TENANT_ID` | Microsoft Entra ID Directory (Tenant) ID | Azure | `00000000-0000-0000-0000-000000000000` |
| `AZURE_AD_CLIENT_ID` | Microsoft Entra ID Application (Client) ID | Azure | `11111111-1111-1111-1111-111111111111` |

---

## 3. Provider Setup & Configuration

### 3.1 Clerk IAM

1. In the [Clerk Dashboard](https://dashboard.clerk.com), create an application.
2. Retrieve your **Publishable Key** and **Secret Key**.
3. Set the environment variables:
   ```env
   IAM_PROVIDER="clerk"
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
   CLERK_SECRET_KEY="sk_live_..."
   ```
4. X4G4T automatically validates incoming Clerk session JWTs and maps `sub` (`user_...`) and `org_id` claims.

---

### 3.2 WorkOS (Enterprise SSO & SAML 2.0)

1. In the [WorkOS Dashboard](https://dashboard.workos.com), create a new environment.
2. Obtain your **API Key** and **Client ID**.
3. Set the environment variables:
   ```env
   IAM_PROVIDER="workos"
   WORKOS_API_KEY="sk_live_..."
   WORKOS_CLIENT_ID="client_..."
   WORKOS_REDIRECT_URI="https://your-domain.com/api/auth/callback/workos"
   ```
4. WorkOS SSO JWTs issued to authenticated corporate employees or service accounts are validated directly against `https://api.workos.com`.

---

### 3.3 Okta / Auth0 / Generic OpenID Connect (OIDC)

For enterprise Okta, Auth0, Ping Identity, or Keycloak:

1. Create an API Application in your Identity Provider.
2. Configure the **Audience** (e.g. `https://api.x4g4t.internal`).
3. Set the environment variables:
   ```env
   IAM_PROVIDER="oidc"
   OIDC_ISSUER_URL="https://company.okta.com/oauth2/default"
   OIDC_CLIENT_ID="0oa1234567890abcdef"
   OIDC_AUDIENCE="https://api.x4g4t.internal"
   ```
4. X4G4T ensures that any incoming Bearer token has `iss === OIDC_ISSUER_URL` and contains `OIDC_AUDIENCE` in its `aud` claim.

---

### 3.4 AWS IAM / Amazon Cognito User Pools

1. In the AWS Console, navigate to **Amazon Cognito** > **User Pools**.
2. Note your **User Pool ID** (e.g. `us-east-1_abcdef123`) and **App Client ID**.
3. Set the environment variables:
   ```env
   IAM_PROVIDER="cognito"
   AWS_COGNITO_USER_POOL_ID="us-east-1_abcdef123"
   AWS_COGNITO_CLIENT_ID="1234567890abcdefghijklmnop"
   AWS_COGNITO_REGION="us-east-1"
   ```
4. Cognito ID tokens and Access tokens are validated against `https://cognito-idp.${region}.amazonaws.com/${poolId}`.

---

### 3.5 Azure Active Directory / Microsoft Entra ID

1. In the [Microsoft Entra Admin Center](https://entra.microsoft.com), navigate to **App registrations**.
2. Register an application and note the **Directory (tenant) ID** and **Application (client) ID**.
3. Set the environment variables:
   ```env
   IAM_PROVIDER="azure_ad"
   AZURE_AD_TENANT_ID="00000000-0000-0000-0000-000000000000"
   AZURE_AD_CLIENT_ID="11111111-1111-1111-1111-111111111111"
   ```
4. Tokens issued by Microsoft Entra ID (`login.microsoftonline.com`) have their tenant ID (`tid`) and client ID (`aud`) verified.

---

## 4. Token Structure & Identity Claims Mapping

X4G4T normalizes heterogeneous enterprise tokens into a uniform `IamIdentity`:

```typescript
export interface IamIdentity {
  userId: string;       // Extracted from 'sub' claim
  orgId: string;        // Extracted from 'org_id', 'tid', 'custom:org_id', or derived
  email?: string;       // Extracted from 'email' claim
  roles: string[];      // Extracted from 'roles', 'groups', or 'cognito:groups'
  provider: "clerk" | "workos" | "oidc" | "cognito" | "azure_ad" | "custom";
}
```

### Organization ID Extraction Order:
1. `payload.org_id` (Clerk, WorkOS, OIDC)
2. `payload["custom:org_id"]` (AWS Cognito custom attribute)
3. `org_azure_${payload.tid.slice(0, 8)}` (Azure AD tenant ID)
4. Deterministic SHA-256 fallback: `org_${sha256(sub).slice(0, 8)}`

---

## 5. Agent & Service Mesh Integration

Autonomous agents and service meshes can authenticate by passing their IAM token directly in the `Authorization` header:

```bash
# Authenticate with an Okta/OIDC or Cognito Bearer JWT
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "issue_refund",
    "arguments": { "order_id": "ord_100", "amount": 50 }
  }'
```

```bash
# Or authenticate with a static API key
curl -X POST http://localhost:4000/v1/gateway/execute \
  -H "Authorization: Bearer sec_live_1234567890abcdef..." \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "issue_refund",
    "arguments": { "order_id": "ord_100", "amount": 50 }
  }'
```

Both authentication types resolve seamlessly into the correct organization tenant scope.

---

## 6. Local Development & Safe Fallback Mode

If no external IAM provider keys are supplied, X4G4T automatically activates **Local Development Mode**:
- `IAM_PROVIDER="local"`
- Default user ID: `usr_dev_admin` (configurable via `DEFAULT_USER_ID`)
- Organization slug: `org_dev_admin`
- Full dashboard access enabled without requiring external internet access or third-party accounts.

