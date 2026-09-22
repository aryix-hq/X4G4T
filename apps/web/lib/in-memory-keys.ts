export interface StoredApiKey {
  id: string;
  keyPrefix: string;
  environment: string;
  createdAt: string;
  lastUsedAt: string | null;
  keyHash: string;
}

export const inMemoryApiKeys: StoredApiKey[] = [];

export interface LlmProviderConfig {
  provider: "openai" | "gemini" | "claude" | "ollama" | "antigravity";
  apiKey?: string;
  rawApiKey?: string;
  model: string;
  baseUrl?: string;
  isConfigured: boolean;
  updatedAt: string;
}

export const inMemoryLlmConfigs: Record<string, LlmProviderConfig> = {
  openai: {
    provider: "openai",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    isConfigured: false,
    updatedAt: new Date().toISOString()
  },
  gemini: {
    provider: "gemini",
    model: "gemini-1.5-pro",
    isConfigured: false,
    updatedAt: new Date().toISOString()
  },
  claude: {
    provider: "claude",
    model: "claude-3-5-sonnet-20241022",
    isConfigured: false,
    updatedAt: new Date().toISOString()
  },
  ollama: {
    provider: "ollama",
    model: "llama3.2",
    baseUrl: "http://localhost:11434",
    isConfigured: true,
    updatedAt: new Date().toISOString()
  },
  antigravity: {
    provider: "antigravity",
    model: "antigravity-agent-v1",
    baseUrl: "http://localhost:4000/v1/gateway/mcp",
    isConfigured: true,
    updatedAt: new Date().toISOString()
  }
};

export interface InMemoryHitlRequest {
  id: string;
  logId?: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  triggeredPolicyName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  reviewerId?: string;
  resolutionReason?: string;
  createdAt: string;
  resolvedAt?: string;
  downstreamUrl?: string;
  downstreamHeaders?: Record<string, string>;
  executionResponse?: unknown;
}

export const inMemoryHitlRequests: InMemoryHitlRequest[] = [
  {
    id: "hold_demo_98231a",
    agentId: "support-agent-v2",
    toolName: "wire_transfer",
    arguments: {
      amount: 15000,
      currency: "USD",
      recipient: "vendor_corp_llc",
      memo: "Invoice #INV-2026-902"
    },
    triggeredPolicyName: "Large Wire Transfer Sign-Off ($10,000)",
    status: "PENDING",
    createdAt: new Date().toISOString()
  }
];

