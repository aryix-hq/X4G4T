"use client";

import { useState } from "react";
import {
  Terminal,
  Copy,
  Check,
  Shield,
  Zap,
  Lock,
  Radio
} from "lucide-react";

type Framework = "openai" | "gemini" | "claude" | "mcp" | "curl" | "python";

export function GatewayIntegrationTab() {
  const [selectedFramework, setSelectedFramework] = useState<Framework>("openai");
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const SNIPPETS: Record<Framework, { title: string; lang: string; code: string; notes: string }> = {
    openai: {
      title: "OpenAI / ChatGPT (TypeScript / Node.js)",
      lang: "typescript",
      notes: "Intercepts OpenAI function calling and routes the tool call through the X4G4T Centralized Gateway before reaching downstream APIs.",
      code: `import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const X4G4T_GATEWAY = "http://localhost:4000/v1/gateway/execute";
const X4G4T_KEY = process.env.X4G4T_API_KEY!;

async function runChatGptAgent(userPrompt: string) {
  // 1. ChatGPT decides tool call
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "issue_refund",
          description: "Process customer order refund",
          parameters: {
            type: "object",
            properties: {
              order_id: { type: "string" },
              amount: { type: "number" }
            },
            required: ["order_id", "amount"]
          }
        }
      }
    ]
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall) return completion.choices[0]?.message?.content;

  // 2. Centralized Gateway Intercept: Evaluate policies before touching Stripe
  const toolArgs = JSON.parse(toolCall.function.arguments);

  const gatewayRes = await fetch(X4G4T_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${X4G4T_KEY}\`,
      "Content-Type": "application/json",
      "x-iam-roles": "support_agent" // Evaluated by active IAM policies
    },
    body: JSON.stringify({
      agent_id: "chatgpt-support-bot",
      tool_name: toolCall.function.name,
      arguments: toolArgs,
      downstream_url: "https://api.stripe.com/v1/refunds",
      downstream_headers: {
        "Authorization": \`Bearer \${process.env.STRIPE_SECRET_KEY}\`
      }
    })
  });

  // 3. Handle Verdicts
  if (gatewayRes.status === 422) {
    const error = await gatewayRes.json();
    return \`Blocked by X4G4T Policy: \${error.error.message}\`;
  }
  if (gatewayRes.status === 202) {
    const hold = await gatewayRes.json();
    return \`Held for supervisor sign-off in Slack (Hold ID: \${hold.hold_id})\`;
  }

  const result = await gatewayRes.json();
  return \`Refund successfully executed: \${JSON.stringify(result)}\`;
}`
    },

    gemini: {
      title: "Google Gemini (TypeScript / Node.js)",
      lang: "typescript",
      notes: "Intercepts Google Gemini function declarations. Downstream database or API credentials remain vaulted and isolated from the LLM.",
      code: `import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const X4G4T_GATEWAY = "http://localhost:4000/v1/gateway/execute";

async function runGeminiAgent(prompt: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    tools: [
      {
        functionDeclarations: [
          {
            name: "execute_sql",
            description: "Execute SQL query on enterprise database",
            parameters: {
              type: "OBJECT" as any,
              properties: {
                query: { type: "STRING" as any }
              },
              required: ["query"]
            }
          }
        ]
      }
    ]
  });

  const chat = model.startChat();
  const response = await chat.sendMessage(prompt);
  const functionCall = response.response.functionCalls()?.[0];

  if (!functionCall) return response.response.text();

  // Route to Centralized Gateway
  const gatewayRes = await fetch(X4G4T_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${process.env.X4G4T_API_KEY}\`,
      "Content-Type": "application/json",
      "x-iam-roles": "analyst"
    },
    body: JSON.stringify({
      agent_id: "gemini-bi-agent",
      tool_name: functionCall.name,
      arguments: functionCall.args,
      downstream_url: "https://db.internal.company.com/query",
      downstream_headers: {
        "x-db-token": process.env.INTERNAL_DB_TOKEN
      }
    })
  });

  if (gatewayRes.status === 422) {
    const err = await gatewayRes.json();
    const followUp = await chat.sendMessage([
      { functionResponse: { name: functionCall.name, response: { error: err.error.message } } }
    ]);
    return followUp.response.text();
  }

  const queryResult = await gatewayRes.json();
  const followUp = await chat.sendMessage([
    { functionResponse: { name: functionCall.name, response: queryResult } }
  ]);
  return followUp.response.text();
}`
    },

    claude: {
      title: "Anthropic Claude (TypeScript / Node.js)",
      lang: "typescript",
      notes: "Enforces max output tokens, Claude 3.7 extended thinking budgets, and tool call guardrails.",
      code: `import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const X4G4T_GATEWAY = "http://localhost:4000/v1/gateway/execute";

async function runClaudeAgent(prompt: string) {
  const msg = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 4096,
    thinking: { type: "enabled", budget_tokens: 2048 },
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "wire_transfer",
        description: "Initiate corporate bank wire",
        input_schema: {
          type: "object",
          properties: {
            amount: { type: "number" },
            recipient: { type: "string" }
          },
          required: ["amount", "recipient"]
        }
      }
    ]
  });

  const toolBlock = msg.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return msg.content;

  // Intercept with X4G4T Centralized Gateway
  const gatewayRes = await fetch(X4G4T_GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${process.env.X4G4T_API_KEY}\`,
      "Content-Type": "application/json",
      "x-iam-roles": "finance_admin"
    },
    body: JSON.stringify({
      agent_id: "claude-treasury-agent",
      tool_name: toolBlock.name,
      arguments: toolBlock.input,
      downstream_url: "https://banking.internal.company.com/transfers",
      downstream_headers: {
        "x-api-key": process.env.BANKING_API_KEY
      }
    })
  });

  return await gatewayRes.json();
}`
    },

    mcp: {
      title: "Model Context Protocol (MCP) (Cursor & Claude Desktop)",
      lang: "json",
      notes: "Configure your MCP client settings to route JSON-RPC 2.0 frames through X4G4T. X4G4T inspects tools/call frames in <1ms and proxies tools/list.",
      code: `{
  "mcpServers": {
    "x4g4t-defense": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "http://localhost:4000/v1/gateway/mcp"
      ],
      "env": {
        "AUTHORIZATION": "Bearer sec_live_your_x4g4t_key",
        "X_TARGET_MCP_URL": "http://internal-mcp-server:8080/mcp"
      }
    }
  }
}`
    },

    python: {
      title: "Python (LangChain / CrewAI / Requests)",
      lang: "python",
      notes: "Dispatches tool calls through the central gateway in any Python AI agent framework with automatic IAM header propagation.",
      code: `import os
import requests

X4G4T_GATEWAY = "http://localhost:4000/v1/gateway/execute"
X4G4T_KEY = os.environ["X4G4T_API_KEY"]

def execute_tool_with_x4g4t(tool_name: str, arguments: dict, downstream_url: str):
    """Centralized Gateway invocation for Python agents."""
    response = requests.post(
        X4G4T_GATEWAY,
        headers={
            "Authorization": f"Bearer {X4G4T_KEY}",
            "Content-Type": "application/json",
            "x-iam-user-id": "usr_python_agent_01",
            "x-iam-roles": "engineering"
        },
        json={
            "agent_id": "python-crewai-agent",
            "tool_name": tool_name,
            "arguments": arguments,
            "downstream_url": downstream_url,
            "downstream_headers": {
                "Authorization": f"Bearer {os.environ.get('DOWNSTREAM_API_KEY', '')}"
            }
        },
        timeout=10
    )
    
    # 422: Policy Blocked | 202: Held for Slack HITL | 200: Allowed
    return response.status_code, response.json()`
    },

    curl: {
      title: "cURL / Raw REST API",
      lang: "bash",
      notes: "Direct invocation of the Centralized Gateway endpoint.",
      code: `curl -X POST http://localhost:4000/v1/gateway/execute \\
  -H "Authorization: Bearer sec_live_your_x4g4t_key" \\
  -H "Content-Type: application/json" \\
  -H "x-iam-roles: support_agent" \\
  -d '{
    "agent_id": "customer-support-bot",
    "tool_name": "issue_refund",
    "arguments": {
      "order_id": "ord_9902",
      "amount": 350
    },
    "downstream_url": "https://api.stripe.com/v1/refunds",
    "downstream_headers": {
      "Authorization": "Bearer sk_live_your_stripe_secret"
    }
  }'`
    }
  };

  const active = SNIPPETS[selectedFramework];

  return (
    <div className="space-y-6">
      {/* Centralized Gateway Overview Card */}
      <div className="p-6 rounded-xl border border-indigo-500/30 bg-indigo-950/20 space-y-3">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
          <Shield className="h-5 w-5" />
          Centralized Gateway Architecture
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          X4G4T operates as a centralized inline firewall between your AI agent loops (ChatGPT, Gemini, Claude, Cursor, LangChain) and your backend microservices. Your agent runtimes route outbound tool executions to the X4G4T gateway. X4G4T evaluates deterministic AST rules in-memory (<span className="text-emerald-400 font-mono">&lt;0.15µs</span>), checks IAM permissions, redacts PII, and logs to an ISO 27001 tamper-proof hash chain before proxying to downstream APIs.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-indigo-400" />
              Credential Vaulting
            </div>
            <div className="text-slate-400 text-[11px]">
              Downstream API keys (Stripe, DB, AWS) are kept isolated from LLMs. Even prompt-injected agents cannot steal raw credentials.
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              Fail-Closed Protection
            </div>
            <div className="text-slate-400 text-[11px]">
              If a tool call exceeds thresholds or contains malicious SQL/shell commands, it is BLOCKED (422) before downstream services are touched.
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              Human-in-the-Loop
            </div>
            <div className="text-slate-400 text-[11px]">
              High-impact operations are suspended with 202 Accepted. Interactive Slack/Teams cards are dispatched with HMAC sign-offs.
            </div>
          </div>
        </div>
      </div>

      {/* Framework Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {(
          [
            { id: "openai", name: "OpenAI / ChatGPT" },
            { id: "gemini", name: "Google Gemini" },
            { id: "claude", name: "Anthropic Claude" },
            { id: "mcp", name: "Cursor / MCP" },
            { id: "python", name: "Python / LangChain" },
            { id: "curl", name: "cURL / REST" }
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedFramework(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              selectedFramework === tab.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Code Snippet Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">{active.title}</span>
          </div>
          <button
            type="button"
            onClick={() => copyToClipboard(active.code, selectedFramework)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition px-2 py-1 rounded hover:bg-slate-800 cursor-pointer"
          >
            {copied === selectedFramework ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied === selectedFramework ? "Copied" : "Copy Code"}</span>
          </button>
        </div>

        <p className="px-4 py-2.5 bg-slate-900/50 text-[11px] text-slate-400 border-b border-slate-800/80">
          {active.notes}
        </p>

        <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed bg-slate-950">
          <code>{active.code}</code>
        </pre>
      </div>

      {/* Verdict Matrix Callout */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-2">
        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
          Centralized Gateway Response Codes
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-emerald-300">
            <span className="font-bold">200 OK (ALLOW):</span> Tool passed all active guardrails. Forwarded to downstream URL; returns downstream payload directly.
          </div>
          <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-800/40 text-rose-300">
            <span className="font-bold">422 Unprocessable (BLOCK):</span> Policy violated. Downstream service is never touched. Returns error details for agent recovery.
          </div>
          <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-300">
            <span className="font-bold">202 Accepted (HELD):</span> Operation held for human review. Returns <code className="font-mono">hold_id</code>. Card sent to Slack channel.
          </div>
        </div>
      </div>
    </div>
  );
}
