import { getTenantContext } from "@/lib/tenant";
import { Sparkles } from "lucide-react";
import { getPolicyRecommendationsAction, getPolicyFreezeAction } from "@/app/actions";
import { InsightsClient, RecommendationItem } from "./insights-client";

export default async function InsightsPage() {
  const { role } = await getTenantContext();
  const isAdmin = role === "admin";

  const recommendations = (await getPolicyRecommendationsAction()) as RecommendationItem[];
  const policyFreeze = await getPolicyFreezeAction();

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-600/20 border border-purple-500/40 text-purple-400">
            <Sparkles className="h-6 w-6" />
          </div>
          AI Policy Insights & ML Guardrails
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Unsupervised statistical anomaly mining across tool execution logs. Automatically synthesizes
          P99 upper-bound ceilings (+15% safety buffer) and discrete categorical whitelists to eliminate accidental mutations.
        </p>
      </div>

      <InsightsClient
        initialRecommendations={JSON.parse(JSON.stringify(recommendations))}
        isPolicyFrozen={policyFreeze.active || !isAdmin}
      />
    </div>
  );
}
