import { Cpu } from "lucide-react";
import { getSystemTelemetryAction } from "@/app/actions";
import { SystemTelemetryClient } from "./system-telemetry-client";

export default async function SystemDashboardPage() {
  const telemetry = await getSystemTelemetryAction();

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
            <Cpu className="h-6 w-6" />
          </div>
          Dynamic Performance & Telemetry Engine
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Low-overhead telemetry harvesting CPU utilization per node, Memory RSS against cgroup limits,
          Disk I/O, Network throughput, and Fastify event loop lag quantiles.
        </p>
      </div>

      <SystemTelemetryClient initialData={JSON.parse(JSON.stringify(telemetry))} />
    </div>
  );
}
