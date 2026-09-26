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

export interface WebRecommendation {
  id: string;
  orgId: string;
  targetTool: string;
  fieldPath: string;
  suggestedOperator: string;
  suggestedTargetValue: string;
  confidenceScore: number;
  reasoning: string;
  sampleSize: number;
  status: "PENDING" | "ACCEPTED" | "DISMISSED";
  distribution?: {
    min: number;
    p50: number;
    p90: number;
    p99: number;
    max: number;
    histogramBuckets: Array<{ bucket: string; count: number }>;
  };
  createdAt: string;
}

export const inMemoryRecommendations: WebRecommendation[] = [
  {
    id: "rec_refund_amount_demo",
    orgId: "org_demo_default",
    targetTool: "issue_refund",
    fieldPath: "amount",
    suggestedOperator: "LESS_THAN_OR_EQUAL",
    suggestedTargetValue: "207",
    confidenceScore: 0.985,
    reasoning: "99.4% of tool calls to 'issue_refund' have 'amount <= 180'. Recommending upper ceiling of 207 (15% safety buffer) to halt hallucinated mutations.",
    sampleSize: 142,
    status: "PENDING",
    distribution: {
      min: 15,
      p50: 65,
      p90: 140,
      p99: 180,
      max: 185,
      histogramBuckets: [
        { bucket: "15-49", count: 48 },
        { bucket: "50-89", count: 62 },
        { bucket: "90-129", count: 21 },
        { bucket: "130-169", count: 9 },
        { bucket: "170-185", count: 2 }
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "rec_currency_enum_demo",
    orgId: "org_demo_default",
    targetTool: "stripe_charge",
    fieldPath: "currency",
    suggestedOperator: "IN",
    suggestedTargetValue: '["EUR", "GBP", "USD"]',
    confidenceScore: 0.962,
    reasoning: "Observed categorical parameter 'currency' strictly limited to [USD, EUR, GBP] across 210 historical tool executions. Recommend enforcing finite whitelist.",
    sampleSize: 210,
    status: "PENDING",
    distribution: {
      min: 0,
      p50: 0,
      p90: 0,
      p99: 0,
      max: 0,
      histogramBuckets: [
        { bucket: "USD", count: 140 },
        { bucket: "EUR", count: 50 },
        { bucket: "GBP", count: 20 }
      ]
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "rec_sql_limit_demo",
    orgId: "org_demo_default",
    targetTool: "execute_db_query",
    fieldPath: "limit",
    suggestedOperator: "LESS_THAN_OR_EQUAL",
    suggestedTargetValue: "500",
    confidenceScore: 0.941,
    reasoning: "99.1% of analytics tool runs request limit <= 350. Proposing hard ceiling of 500 to prevent runaway database memory exhaustion.",
    sampleSize: 88,
    status: "PENDING",
    distribution: {
      min: 10,
      p50: 100,
      p90: 250,
      p99: 350,
      max: 400,
      histogramBuckets: [
        { bucket: "10-99", count: 32 },
        { bucket: "100-199", count: 35 },
        { bucket: "200-299", count: 14 },
        { bucket: "300-400", count: 7 }
      ]
    },
    createdAt: new Date().toISOString()
  }
];

export interface WebUpstreamProvider {
  id: string;
  name: string;
  providerType: "OLLAMA" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "CUSTOM";
  baseUrl: string;
  authToken?: string;
  isInternal: boolean;
  isActive: boolean;
  createdAt: string;
}

export const inMemoryUpstreamProviders: WebUpstreamProvider[] = [
  {
    id: "prov_ollama_local",
    name: "On-Premises Ollama Cluster",
    providerType: "OLLAMA",
    baseUrl: "http://localhost:11434",
    isInternal: true,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: "prov_vllm_prod",
    name: "Internal vLLM GPU Server",
    providerType: "OPENAI_COMPATIBLE",
    baseUrl: "http://10.0.0.80:8000/v1",
    authToken: "vllm-corp-master-key",
    isInternal: true,
    isActive: true,
    createdAt: new Date().toISOString()
  }
];

