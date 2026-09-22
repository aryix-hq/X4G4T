"use client";

import { useState } from "react";
import { createApiKeyAction, revokeApiKeyAction, saveLlmConfigAction } from "@/app/actions";
import { Copy, Trash2, Key, Check, Bot, Sparkles, Shield, Cpu, Terminal, Settings } from "lucide-react";
import { LlmProviderConfig } from "@/lib/in-memory-keys";

export interface KeyRecord {
  id: string;
  keyPrefix: string;
  environment: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface KeyFormClientProps {
  existingKeys: KeyRecord[];
  initialLlmConfigs: Record<string, LlmProviderConfig>;
  userRole?: "admin" | "developer";
}

export function KeyFormClient({ existingKeys, initialLlmConfigs, userRole = "admin" }: KeyFormClientProps) {
  const [activeTab, setActiveTab] = useState<"keys" | "llm-vault">("keys");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // LLM Config state
  const [llmConfigs, setLlmConfigs] = useState<Record<string, LlmProviderConfig>>(initialLlmConfigs);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [inputApiKey, setInputApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [inputBaseUrl, setInputBaseUrl] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsPending(true);
    try {
      const res = await createApiKeyAction();
      setRevealedKey(res.rawKey);
    } catch (err) {
      console.error("Failed to generate API Key:", err);
    } finally {
      setIsPending(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openConfigModal = (provider: string) => {
    if (userRole !== "admin") {
      alert("Access Restricted: Only Organization Administrators (SecOps) can configure or onboard upstream LLM providers.");
      return;
    }
    const current = llmConfigs[provider];
    setEditingProvider(provider);
    setSelectedModel(current?.model || "");
    setInputBaseUrl(current?.baseUrl || "");
    setInputApiKey("");
    setSaveStatus(null);
  };

  const handleSaveLlmConfig = async () => {
    if (!editingProvider) return;
    setIsPending(true);
    try {
      const res = await saveLlmConfigAction(
        editingProvider as "openai" | "gemini" | "claude" | "ollama" | "antigravity",
        selectedModel,
        inputApiKey || undefined,
        inputBaseUrl || undefined
      );
      setLlmConfigs((prev) => ({
        ...prev,
        [editingProvider]: {
          provider: editingProvider as any,
          model: selectedModel,
          apiKey: inputApiKey ? `${inputApiKey.slice(0, 4)}...${inputApiKey.slice(-4)}` : prev[editingProvider]?.apiKey,
          baseUrl: inputBaseUrl,
          isConfigured: Boolean(inputApiKey || editingProvider === "ollama" || editingProvider === "antigravity"),
          updatedAt: new Date().toISOString()
        }
      }));
      setSaveStatus(res.message);
      setTimeout(() => {
        setEditingProvider(null);
        setSaveStatus(null);
      }, 1200);
    } catch (err: any) {
      setSaveStatus("Failed to save configuration: " + err.message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("keys")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "keys"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Key className="h-4 w-4 text-indigo-400" />
          X4G4T Proxy Keys
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {existingKeys.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("llm-vault")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === "llm-vault"
              ? "border-indigo-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bot className="h-4 w-4 text-cyan-400" />
          LLM Provider Vault (ChatGPT, Gemini, Claude, Ollama)
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
            Vaulted
          </span>
        </button>
      </div>

      {/* TAB 1: PROXY KEYS */}
      {activeTab === "keys" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-sm font-semibold text-white">Generate X4G4T Proxy Key</div>
              <div className="text-xs text-slate-400">
                Cryptographically hashed Bearer token (<code className="text-indigo-300 font-mono">sec_live_...</code>) required to route agent tool calls through the firewall.
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm px-4 py-2 rounded-lg transition flex items-center gap-2 cursor-pointer"
            >
              <Key className="h-4 w-4" />
              {isPending ? "Generating..." : "Generate Secret Key"}
            </button>
          </div>

          {/* One-Time Key Reveal Box */}
          {revealedKey && (
            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-2 animate-in fade-in duration-200">
              <div className="text-xs font-semibold uppercase text-amber-400 tracking-wide flex items-center gap-1.5">
                ⚠️ Save this secret key now — you will not be able to view it again!
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-950 p-2.5 rounded-lg font-mono text-sm text-amber-200 border border-amber-900/60 overflow-x-auto select-all">
                  {revealedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(revealedKey)}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700 cursor-pointer"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-slate-300" />}
                </button>
              </div>
            </div>
          )}

          {/* Active Keys Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Active Proxy API Keys</span>
              <span className="font-mono text-[11px] text-slate-500">{existingKeys.length} registered</span>
            </div>

            <div className="divide-y divide-slate-800">
              {existingKeys.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No active API keys found. Generate a secret key above to authenticate your agents.
                </div>
              ) : (
                existingKeys.map((k) => (
                  <div key={k.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition">
                    <div className="flex items-center gap-3">
                      <Key className="h-4 w-4 text-indigo-400" />
                      <div>
                        <span className="font-mono text-sm text-white font-medium">{k.keyPrefix}...</span>
                        <span className="ml-2 px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {k.environment}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-500">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => revokeApiKeyAction(k.id)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 transition rounded hover:bg-rose-950/30 cursor-pointer"
                        title="Revoke API Key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LLM PROVIDER VAULT */}
      {activeTab === "llm-vault" && (
        <div className="space-y-6">
          {userRole !== "admin" ? (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-900/50 flex items-start gap-3 text-sm text-slate-300">
              <Shield className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Enterprise Vault (SecOps Governed):</span> Upstream LLM provider credentials and model routing are governed exclusively by SecOps Administrators. Standard developers cannot configure or onboard LLM provider keys. You can consume these pre-configured models via your personal X4G4T proxy keys.
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/50 flex items-start gap-3 text-sm text-slate-300">
              <Shield className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white">Zero-Trust Credential Vaulting:</span> LLM agents (ChatGPT, Gemini, Claude) never receive production SaaS API keys. X4G4T securely vaults your upstream credentials and transparently injects downstream authorization headers only after deterministic policy evaluation evaluates to <code className="text-emerald-400">ALLOW</code>.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. OpenAI ChatGPT */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">OpenAI / ChatGPT</h3>
                    <p className="text-xs text-slate-400">GPT-4o, GPT-4o-mini, o1-preview</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${llmConfigs.openai?.isConfigured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {llmConfigs.openai?.isConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                Active Model: <span className="text-slate-200">{llmConfigs.openai?.model}</span>
                <br />
                Vaulted Key: <span className="text-slate-200">{llmConfigs.openai?.apiKey || "None"}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  disabled={userRole !== "admin"}
                  onClick={() => openConfigModal("openai")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition border flex items-center gap-1.5 ${
                    userRole !== "admin"
                      ? "bg-slate-800/60 text-slate-500 border-slate-800 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  {userRole !== "admin" ? "Admin Governed" : (llmConfigs.openai?.isConfigured ? "Reconfigure" : "Configure Provider")}
                </button>
              </div>
            </div>

            {/* 2. Google Gemini */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Google Gemini</h3>
                    <p className="text-xs text-slate-400">Gemini 1.5 Pro, 1.5 Flash</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${llmConfigs.gemini?.isConfigured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {llmConfigs.gemini?.isConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                Active Model: <span className="text-slate-200">{llmConfigs.gemini?.model}</span>
                <br />
                Vaulted Key: <span className="text-slate-200">{llmConfigs.gemini?.apiKey || "None"}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  disabled={userRole !== "admin"}
                  onClick={() => openConfigModal("gemini")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition border flex items-center gap-1.5 ${
                    userRole !== "admin"
                      ? "bg-slate-800/60 text-slate-500 border-slate-800 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  {userRole !== "admin" ? "Admin Governed" : (llmConfigs.gemini?.isConfigured ? "Reconfigure" : "Configure Provider")}
                </button>
              </div>
            </div>

            {/* 3. Anthropic Claude */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Anthropic Claude</h3>
                    <p className="text-xs text-slate-400">Claude 3.5 Sonnet, 3.5 Haiku</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${llmConfigs.claude?.isConfigured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
                  {llmConfigs.claude?.isConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                Active Model: <span className="text-slate-200">{llmConfigs.claude?.model}</span>
                <br />
                Vaulted Key: <span className="text-slate-200">{llmConfigs.claude?.apiKey || "None"}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  disabled={userRole !== "admin"}
                  onClick={() => openConfigModal("claude")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition border flex items-center gap-1.5 ${
                    userRole !== "admin"
                      ? "bg-slate-800/60 text-slate-500 border-slate-800 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  {userRole !== "admin" ? "Admin Governed" : (llmConfigs.claude?.isConfigured ? "Reconfigure" : "Configure Provider")}
                </button>
              </div>
            </div>

            {/* 4. Ollama (Air-Gapped / Local) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Terminal className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Ollama (Local / Air-Gapped)</h3>
                    <p className="text-xs text-slate-400">Llama 3.2, Mistral, DeepSeek-R1</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-purple-950 text-purple-300 border border-purple-800">
                  AIR-GAPPED
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                Base URL: <span className="text-slate-200">{llmConfigs.ollama?.baseUrl}</span>
                <br />
                Default Model: <span className="text-slate-200">{llmConfigs.ollama?.model}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  disabled={userRole !== "admin"}
                  onClick={() => openConfigModal("ollama")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition border flex items-center gap-1.5 ${
                    userRole !== "admin"
                      ? "bg-slate-800/60 text-slate-500 border-slate-800 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer"
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  {userRole !== "admin" ? "Admin Governed" : (llmConfigs.ollama?.isConfigured ? "Reconfigure" : "Configure Provider")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="font-semibold text-white text-base capitalize flex items-center gap-2">
                <Settings className="h-4 w-4 text-indigo-400" />
                Configure {editingProvider} Provider
              </h3>
              <button
                onClick={() => setEditingProvider(null)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Model</label>
                <input
                  type="text"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  placeholder="e.g. gpt-4o, gemini-1.5-pro, claude-3-5-sonnet"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {editingProvider !== "ollama" && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">API Key / Secret Token</label>
                  <input
                    type="password"
                    value={inputApiKey}
                    onChange={(e) => setInputApiKey(e.target.value)}
                    placeholder="Enter API key to vault (e.g. sk-..., AIza...)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Vaulted credentials are never transmitted to the browser or AI agent loops.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Gateway / Base URL (Optional)</label>
                <input
                  type="text"
                  value={inputBaseUrl}
                  onChange={(e) => setInputBaseUrl(e.target.value)}
                  placeholder="e.g. http://localhost:4000/v1 or https://api.openai.com/v1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {saveStatus && (
              <div className="p-2.5 bg-indigo-950/50 border border-indigo-800 text-xs text-indigo-300 rounded-lg">
                {saveStatus}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProvider(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLlmConfig}
                disabled={isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
