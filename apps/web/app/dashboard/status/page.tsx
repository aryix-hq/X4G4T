import { Activity } from "lucide-react";
import { getSystemStatusAction } from "@/app/actions";
import { StatusClient } from "./status-client";

export default async function StatusPage() {
  const status = await getSystemStatusAction();

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400">
            <Activity className="h-6 w-6" />
          </div>
          System Status & Multi-Service Health
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Real-time availability, round-trip latency, and diagnostic telemetry across PostgreSQL, Redis,
          Elasticsearch, X4G4T Fastify Proxy, and the independent ML Mining Service.
        </p>
      </div>

      <StatusClient initialStatus={JSON.parse(JSON.stringify(status))} />
    </div>
  );
}

