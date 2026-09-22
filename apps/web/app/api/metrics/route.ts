import { NextResponse } from "next/server";
import { isGlobalAiLockdownActive, isPolicyFreezeActive } from "@x4g4t/policy-engine";

export async function GET() {
  const memoryUsage = process.memoryUsage();
  const uptime = Math.round(process.uptime());

  const lines = [
    `# HELP x4g4t_web_up Whether the X4G4T Web service is up`,
    `# TYPE x4g4t_web_up gauge`,
    `x4g4t_web_up 1`,
    ``,
    `# HELP x4g4t_global_ai_lockdown_active Whether the emergency global AI lockdown kill-switch is engaged`,
    `# TYPE x4g4t_global_ai_lockdown_active gauge`,
    `x4g4t_global_ai_lockdown_active ${isGlobalAiLockdownActive() ? 1 : 0}`,
    ``,
    `# HELP x4g4t_policy_freeze_active Whether policy editing is frozen`,
    `# TYPE x4g4t_policy_freeze_active gauge`,
    `x4g4t_policy_freeze_active ${isPolicyFreezeActive() ? 1 : 0}`,
    ``,
    `# HELP process_uptime_seconds The time the process has been running in seconds`,
    `# TYPE process_uptime_seconds gauge`,
    `process_uptime_seconds ${uptime}`,
    ``,
    `# HELP process_resident_memory_bytes Resident memory size in bytes`,
    `# TYPE process_resident_memory_bytes gauge`,
    `process_resident_memory_bytes ${memoryUsage.rss}`,
    ``,
    `# HELP process_heap_used_bytes Process heap used in bytes`,
    `# TYPE process_heap_used_bytes gauge`,
    `process_heap_used_bytes ${memoryUsage.heapUsed}`
  ];

  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8"
    }
  });
}

