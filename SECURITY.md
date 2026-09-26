# Security Policy

The X4G4T maintainers take security and the safety of our users, autonomous agents, and upstream enterprise infrastructure with the utmost seriousness. As a security-critical policy firewall and DLP proxy, we are committed to transparent, responsible disclosure and rapid resolution of all vulnerabilities.

---

## 1. Supported Versions

We provide active security patches and vulnerability remediation for the following versions:

| Version | Supported | Status |
| :--- | :--- | :--- |
| `0.2.x` | :white_check_mark: | **Current Active Enterprise Release** (Security fixes backported) |
| `0.1.x` | :warning: | Critical security patches only |
| `< 0.1.0` | :x: | Unsupported |

---

## 2. Reporting a Vulnerability

**Please DO NOT file public GitHub issues for security vulnerabilities.**

Public disclosure places enterprise infrastructure and production agent gateways at risk. Instead, report suspected vulnerabilities privately through one of the following channels:

### Option A: GitHub Private Vulnerability Reporting (Preferred)
1. Navigate to the [X4G4T Security Tab](https://github.com/aryix-hq/X4G4T/security).
2. Click **"Report a vulnerability"** under Advisories.
3. Submit a detailed report with reproduction steps, payload vectors, and impact analysis.

### Option B: Encrypted Email
- Send an email to **security@x4g4t.ai** (or **nkadithya31@gmail.com**).
- Include the prefix `[SECURITY VULNERABILITY]` in the subject line.
- If sharing sensitive proof-of-concept exploits, encrypt your message or request our public PGP key.

---

## 3. What to Include in Your Report

To help us triage and verify your finding quickly, please include:
- **Component Affected:** (e.g., `packages/policy-engine`, `apps/proxy/src/routes/execute.ts`, SSRF filter, DLP chunking).
- **Vulnerability Class:** (e.g., SSRF bypass, ReDoS AST hang, DLP evasion, JWT auth bypass, timing side-channel).
- **Reproduction Steps:** Minimal curl command, script, or JSON payload that triggers the issue.
- **Expected vs. Actual Behavior:** What the firewall should have done (e.g., 403 BLOCK) vs. what happened.
- **Proof-of-Concept (PoC):** Fully redacted test case demonstrating impact without exposing live credentials.

---

## 4. Response SLA & Coordinated Disclosure Timeline

- **Initial Triage & Acknowledgment:** Within **24 hours** of receiving your report.
- **Reproducibility Verification:** Within **48 hours**.
- **Patch Development & Testing:** Within **5 business days** for high/critical severity issues.
- **Coordinated Public Advisory & CVE:** We coordinate disclosure dates with the reporter, typically allowing a **30-day window** for enterprise deployments to update before publishing technical details.

---

## 5. Security Invariants & Non-Vulnerabilities

The following scenarios are considered expected behavior and do not constitute security vulnerabilities:
- **Local Development Credentials in Development Mode:** Acceptance of `sec_live_x4g4t_demo` or `dev_admin` when `NODE_ENV !== "production"` or `X4G4T_DEV_MODE=true` is explicitly enabled.
- **Intentional Bypass on Local Downstreams when `ALLOW_LOCAL_DOWNSTREAM=true`:** When developers explicitly enable loopback forwarding for testing against local mock servers.
- **Denial of Service via Massive Single Requests:** Single requests exceeding the 10MB payload bomb ceiling receive an intentional HTTP `413 Payload Too Large`.

---

## 6. Security Hall of Fame

We deeply appreciate and recognize independent security researchers and white-hat auditors who help keep X4G4T defense-grade. Verified contributors will be acknowledged in our release notes and Security Hall of Fame.
