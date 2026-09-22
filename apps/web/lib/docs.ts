import fs from "node:fs";
import path from "node:path";

export interface DocMetadata {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  readTime: string;
  icon: "BookOpen" | "ShieldCheck" | "Lock";
}

export const DOCS_METADATA: Record<string, DocMetadata> = {
  "user-guide": {
    slug: "user-guide",
    title: "User & Developer Guide",
    subtitle: "Complete operational guide for configuring, monitoring, and testing X4G4T",
    category: "Operations",
    readTime: "8 min read",
    icon: "BookOpen"
  },
  "policy-guide": {
    slug: "policy-guide",
    title: "Policy Creation & Predefined Library",
    subtitle: "Authoritative reference for designing, deploying, and testing guardrail policies",
    category: "Security & Guardrails",
    readTime: "12 min read",
    icon: "ShieldCheck"
  },
  "iam-guide": {
    slug: "iam-guide",
    title: "Enterprise IAM & Multi-Provider Guide",
    subtitle: "Configuring Clerk, WorkOS, Okta, AWS Cognito, and Azure AD JWT Bearer tokens",
    category: "Identity & Access",
    readTime: "10 min read",
    icon: "Lock"
  },
  "enterprise-proxy-rbac": {
    slug: "enterprise-proxy-rbac",
    title: "Enterprise LLM Proxy & RBAC Lockdown",
    subtitle: "Zero-Trust Key Substitution, IAM-specific keys, RBAC Policy Lockdown, and Global AI Kill-Switch",
    category: "Architecture & Security",
    readTime: "10 min read",
    icon: "ShieldCheck"
  }
};

export function getAllDocs(): DocMetadata[] {
  return Object.values(DOCS_METADATA);
}

export function getDocContent(slug: string): { metadata: DocMetadata; content: string } | null {
  const metadata = DOCS_METADATA[slug];
  if (!metadata) return null;

  // Search candidate paths for the markdown file
  const candidatePaths = [
    path.join(process.cwd(), "content", "docs", `${slug}.md`),
    path.join(process.cwd(), "apps", "web", "content", "docs", `${slug}.md`),
    path.join(process.cwd(), "..", "..", "docs", "guides", getOriginalFilename(slug)),
    path.join(process.cwd(), "docs", "guides", getOriginalFilename(slug)),
    path.join(process.cwd(), "docs", getOriginalFilename(slug)),
    path.join(process.cwd(), "..", "..", "docs", getOriginalFilename(slug))
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, "utf-8");
        return { metadata, content };
      } catch (err) {
        console.warn(`[X4G4T Docs] Failed reading ${candidate}:`, err);
      }
    }
  }

  return {
    metadata,
    content: `# ${metadata.title}\n\nDocumentation content is being synchronized.`
  };
}

function getOriginalFilename(slug: string): string {
  switch (slug) {
    case "user-guide":
      return "USER_GUIDE.md";
    case "policy-guide":
      return "POLICY_CREATION_AND_TEMPLATES_GUIDE.md";
    case "iam-guide":
      return "IAM_AUTHENTICATION_GUIDE.md";
    case "enterprise-proxy-rbac":
      return "ENTERPRISE_LLM_PROXY_AND_RBAC.md";
    default:
      return `${slug}.md`;
  }
}

