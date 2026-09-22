import { redirect } from "next/navigation";
import { getTenantContext, getDb } from "@/lib/tenant";
import { apiKeys } from "@x4g4t/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { KeyFormClient, KeyRecord } from "./key-form-client";
import { inMemoryApiKeys, inMemoryLlmConfigs } from "@/lib/in-memory-keys";

export default async function ApiKeysPage() {
  const { orgId, role } = await getTenantContext();
  if (role !== "admin") {
    redirect("/dashboard");
  }
  const db = getDb();

  let keys: KeyRecord[] = [];

  try {
    const dbKeys = await db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        environment: apiKeys.environment,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.deletedAt)))
      .orderBy(desc(apiKeys.createdAt));

    keys = dbKeys.map((k) => ({
      id: k.id,
      keyPrefix: k.keyPrefix,
      environment: k.environment,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null
    }));
  } catch (err) {
    // If database query fails during offline/setup, fallback to in-memory keys
    keys = inMemoryApiKeys.map((k) => ({
      id: k.id,
      keyPrefix: k.keyPrefix,
      environment: k.environment,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt
    }));
  }

  // If both are empty, provide a default demo key for immediate developer onboarding
  if (keys.length === 0 && inMemoryApiKeys.length === 0) {
    const demoKey: KeyRecord = {
      id: "key_demo_default",
      keyPrefix: "sec_live_demo01",
      environment: "production",
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    keys = [demoKey];
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Proxy Keys & LLM Integration</h1>
        <p className="text-sm text-slate-400">
          Authenticate autonomous agents with X4G4T proxy keys and securely vault upstream LLM providers (ChatGPT, Gemini, Claude, Ollama, Antigravity).
        </p>
      </div>

      <KeyFormClient
        existingKeys={JSON.parse(JSON.stringify(keys))}
        initialLlmConfigs={JSON.parse(JSON.stringify(inMemoryLlmConfigs))}
        userRole={role}
      />
    </div>
  );
}
