# Phase 3 Documentation: Control Plane UI & API Key Management

**Phase Status:** ✅ **COMPLETED & VERIFIED**  
**Monorepo Package Implemented:**
- `@x4g4t/web` (`apps/web`)

---

## 1. Overview of Phase 3 Deliverables

Phase 3 implements the control plane dashboard and administrative interface for X4G4T. It provides:
1. **Tenant Onboarding & Isolation:** Automatic organization provisioning and tenant resolution via Clerk / Next.js Server Context.
2. **Cryptographic API Key Management:** Generates high-entropy Bearer secrets (`sec_live_...`), displays the plain-text secret **once**, and persists only its SHA-256 hash. Supports instant revocation.
3. **Guardrail Policy Configurator UI:** Administrative form for creating and configuring deterministic tool policies (field dot-paths, comparison operators, and threshold values) with real-time active status toggling.
4. **Accessible Operations Dashboard:** Built with Next.js 15 App Router, React 19, Tailwind CSS, and shadcn/ui design patterns in dark mode.

---

## 2. Component Architecture & Implementation Details

```text
apps/web/
├── app/
│   ├── (dashboard)/
│   │   ├── keys/
│   │   │   ├── page.tsx               # Server Component: queries active keys
│   │   │   └── key-form-client.tsx    # Client Component: one-time reveal & copy
│   │   ├── policies/
│   │   │   └── page.tsx               # Server Component: policy form & rules table
│   │   └── layout.tsx                 # Dashboard sidebar navigation layout
│   ├── actions.ts                     # Next.js Server Actions (Keys & Policies)
│   ├── globals.css                    # Tailwind CSS dark mode base
│   ├── layout.tsx                     # Root ClerkProvider layout
│   └── page.tsx                       # Home landing hero
├── lib/
│   └── tenant.ts                      # Tenant context resolver & auto-provisioning
├── test/
│   └── actions.test.ts                # Actions & Zod schema validation test suite
├── package.json
├── tailwind.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

### A. Tenant Context Helper (`lib/tenant.ts`)
- Resolves authenticated `userId` via `@clerk/nextjs/server`.
- Derives a deterministic tenant slug (`org_<last_8_chars>`).
- Finds or provisions the root `organizations` record with `retentionDays: 90`.
- Supports test/mock context overrides (`setMockTenantContext`) for isolated execution.

### B. Server Actions (`app/actions.ts`)
- **`createApiKeyAction()`**:
  - Generates 24 random bytes (`sec_live_<prefix>_<secret>`).
  - Stores SHA-256 hash in `apiKeys` table.
  - Returns raw key to the client **once** and triggers `revalidatePath("/dashboard/keys")`.
- **`revokeApiKeyAction(keyId)`**:
  - Soft deletes key (`deletedAt = new Date()`) scoped strictly to the tenant's `orgId`.
- **`createPolicyAction(formData)`**:
  - Parses form inputs through strict `PolicyFormSchema` (Zod).
  - Inserts policy record into `policies` table and rule into `policyRules` table.
- **`togglePolicyAction(policyId, currentStatus)`**:
  - Toggles `isActive` between `"true"` and `"false"`.

### C. Dashboard Interfaces
- **API Keys (`/dashboard/keys`)**:
  - Displays key generation card with a warning callout upon creation: *"Save this secret key now — you will not be able to view it again!"*.
  - Lists active keys with masked prefix (`sec_live_9a1b...`), environment tag (`production`), creation date, and instant revoke action.
- **Guardrail Policies (`/dashboard/policies`)**:
  - Clean form to specify Policy Name, Target Tool (`issue_refund` or `*`), Action (`BLOCK`, `REQUIRE_APPROVAL`, `ALLOW`), Field Dot-Path (`transaction.total`), Operator, and Target Value.
  - Table of active rules with color-coded badges (`BLOCK`: rose, `REQUIRE_APPROVAL`: amber, `ALLOW`: emerald) and real-time Enable/Disable toggles.

---

## 3. Automated Test Suite & Verification

Unit and schema verification runs under **Vitest 2.1.9** with an **8/8 pass rate**:

```bash
pnpm --filter @x4g4t/web test
```

### Test Results
```text
✓ test/actions.test.ts (8 tests)
  ✓ Web Control Plane - Actions & Schema Verification
    ✓ PolicyFormSchema Validation (5 tests)
      ✓ should accept valid policy form data
      ✓ should accept REQUIRE_APPROVAL and ALLOW actions
      ✓ should reject invalid actionOnMatch values
      ✓ should reject invalid operators
      ✓ should reject empty strings for mandatory fields
    ✓ API Key Generation Cryptographic Verification (3 tests)
      ✓ should generate keys with sec_live_ prefix and high entropy
      ✓ should generate cryptographically distinct tokens and hashes
      ✓ should verify that hash matches raw key

Test Files:  1 passed (1)
Tests:       8 passed (8)
Duration:    567ms
```

### TypeScript Typechecking
```bash
pnpm --filter @x4g4t/web exec tsc --noEmit
# Exit code 0 (Zero type errors)
```

---

## 4. Full Monorepo Status (Phases 1–3)

```bash
pnpm turbo run test
```
```text
Tasks:    3 successful, 3 total
Cached:   0 cached, 3 total
Time:     1.284s

Automated Test Breakdown:
- @x4g4t/policy-engine: 36 passed
- @x4g4t/proxy:          9 passed
- @x4g4t/web:            8 passed
Total Test Suite:           53 passed (100% pass rate)
```

