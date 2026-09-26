import http from "node:http";

const PORT = Number(process.env.PORT) || 4500;
const PROXY_URL = process.env.PROXY_URL || "http://proxy:4000";
const TEST_KEY = process.env.TEST_KEY || "sec_live_dev_key_12345678901234567890";
const SIMULATION_INTERVAL_MS = Number(process.env.SIMULATION_INTERVAL_MS) || 12000;

export interface SimulationStats {
  totalRequests: number;
  passedCount: number;
  blockedCount: number;
  heldCount: number;
  shadowCount: number;
  streamingCount: number;
  killSwitchDropCount: number;
  errorsCount: number;
  lastRunTimestamp: string;
  history: Array<{
    scenario: string;
    status: number;
    verdict: string;
    latencyMs: number;
    details?: Record<string, unknown>;
    timestamp: string;
  }>;
}

const stats: SimulationStats = {
  totalRequests: 0,
  passedCount: 0,
  blockedCount: 0,
  heldCount: 0,
  shadowCount: 0,
  streamingCount: 0,
  killSwitchDropCount: 0,
  errorsCount: 0,
  lastRunTimestamp: new Date().toISOString(),
  history: []
};

function recordScenario(
  scenario: string,
  status: number,
  verdict: string,
  latencyMs: number,
  details: Record<string, unknown> = {}
) {
  stats.totalRequests++;
  if (status === 200) stats.passedCount++;
  else if (status === 202) stats.heldCount++;
  else if (status === 422 || status === 403) stats.blockedCount++;
  else if (status === 503) stats.killSwitchDropCount++;
  else stats.errorsCount++;

  if (details.isShadow) stats.shadowCount++;

  stats.lastRunTimestamp = new Date().toISOString();
  stats.history.unshift({
    scenario,
    status,
    verdict,
    latencyMs,
    details,
    timestamp: stats.lastRunTimestamp
  });

  if (stats.history.length > 100) {
    stats.history.pop();
  }
}

// ----------------------------------------------------------------------------
// Client User Traffic Generators via X4G4T Gateway
// ----------------------------------------------------------------------------
export async function executeGatewayCall(options: {
  scenarioName: string;
  agentId?: string;
  toolName: string;
  args: Record<string, unknown>;
  clientIp?: string;
  userEmail?: string;
  hostname?: string;
  isShadow?: boolean;
  stream?: boolean;
}) {
  const start = performance.now();
  const agentId = options.agentId || "autonomous_client_pod";
  const clientIp = options.clientIp || "192.168.1.150";
  const userEmail = options.userEmail || "alice.security@x4g4t-defense.io";
  const hostname = options.hostname || "client-workstation-sim";
  const stream = Boolean(options.stream);

  try {
    const res = await fetch(`${PROXY_URL}/v1/gateway/execute`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TEST_KEY}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp,
        "X-Client-Hostname": hostname,
        "X-User-Email": userEmail,
        "X-Session-ID": `sess_sim_${Date.now()}`
      },
      body: JSON.stringify({
        agent_id: agentId,
        tool_name: options.toolName,
        arguments: options.args,
        downstream_url: "http://proxy:4000/healthz",
        stream
      }),
      signal: AbortSignal.timeout(6000)
    });

    const latencyMs = Math.round(performance.now() - start);
    let bodyText = "";

    if (stream) {
      stats.streamingCount++;
      if (res.body) {
        const reader = res.body.getReader();
        const chunks: string[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(Buffer.from(value).toString("utf-8"));
        }
        bodyText = chunks.join("");
      }
    } else {
      bodyText = await res.text();
    }

    let parsedJson: any = null;
    try {
      parsedJson = JSON.parse(bodyText);
    } catch {}

    let verdict = "UNKNOWN";
    if (res.status === 200) verdict = "PASSED";
    else if (res.status === 202) verdict = "HELD";
    else if (res.status === 422 || res.status === 403) verdict = "BLOCKED";
    else if (res.status === 503) verdict = "KILL_SWITCH_ACTIVE";
    else verdict = `HTTP_${res.status}`;

    const isShadow = Boolean(options.isShadow || options.scenarioName?.toLowerCase().includes("shadow"));

    recordScenario(options.scenarioName, res.status, verdict, latencyMs, {
      toolName: options.toolName,
      isShadow,
      stream,
      clientIp
    });

    return {
      scenario: options.scenarioName,
      status: res.status,
      verdict,
      latencyMs,
      stream,
      isShadow,
      data: parsedJson || bodyText
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    recordScenario(options.scenarioName, 500, "EXCEPTION", latencyMs, { error: err?.message });
    return {
      scenario: options.scenarioName,
      status: 500,
      verdict: "EXCEPTION",
      latencyMs,
      error: err?.message
    };
  }
}

// ----------------------------------------------------------------------------
// Model Context Protocol (MCP) JSON-RPC 2.0 Router Call
// ----------------------------------------------------------------------------
export async function executeMcpCall(options: {
  scenarioName: string;
  toolName: string;
  args: Record<string, unknown>;
  clientIp?: string;
  userEmail?: string;
}) {
  const start = performance.now();
  const clientIp = options.clientIp || "192.168.1.150";
  const userEmail = options.userEmail || "mcp.developer@x4g4t-defense.io";

  try {
    const res = await fetch(`${PROXY_URL}/v1/gateway/mcp`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TEST_KEY}`,
        "Content-Type": "application/json",
        "X-Target-MCP-URL": "http://proxy:4000/healthz",
        "X-Forwarded-For": clientIp,
        "X-User-Email": userEmail
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: options.toolName,
          arguments: options.args
        }
      }),
      signal: AbortSignal.timeout(6000)
    });

    const latencyMs = Math.round(performance.now() - start);
    const data: any = await res.json();
    const isBlocked = Boolean(data.error && (data.error.code === -32001 || data.error.message?.includes("policy")));
    const verdict = isBlocked ? "BLOCKED" : res.status === 200 ? "PASSED" : `HTTP_${res.status}`;

    recordScenario(options.scenarioName, res.status, verdict, latencyMs, {
      toolName: options.toolName,
      mcpCode: data.error?.code
    });

    return {
      scenario: options.scenarioName,
      status: res.status,
      verdict,
      latencyMs,
      isBlocked,
      mcpCode: data.error?.code,
      data
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    recordScenario(options.scenarioName, 500, "EXCEPTION", latencyMs, { error: err?.message });
    return {
      scenario: options.scenarioName,
      status: 500,
      verdict: "EXCEPTION",
      latencyMs,
      error: err?.message
    };
  }
}

// ----------------------------------------------------------------------------
// Full Scenario Battery (Executed during Mock Drills or on Demand)
// ----------------------------------------------------------------------------
export const simulationBatteryMap: Record<string, () => Promise<any>> = {
  CASE_1_BENIGN_LLM_QUERY: () =>
    executeGatewayCall({
      scenarioName: "CASE_1_BENIGN_LLM_QUERY",
      toolName: "llm_generate",
      args: { prompt: "Explain zero-trust policy architecture for AI agents" },
      stream: false
    }),

  CASE_2_STREAMING_LLM: () =>
    executeGatewayCall({
      scenarioName: "CASE_2_STREAMING_LLM",
      toolName: "llm_generate",
      args: { prompt: "Stream the 3 laws of robotics" },
      stream: true
    }),

  CASE_3_COMPLIANT_REFUND: () =>
    executeGatewayCall({
      scenarioName: "CASE_3_COMPLIANT_REFUND",
      toolName: "issue_refund",
      args: { amount: 50, customerId: "cust_123", reason: "item returned" },
      stream: false
    }),

  CASE_4_COMPLIANT_SQL: () =>
    executeGatewayCall({
      scenarioName: "CASE_4_COMPLIANT_SQL",
      toolName: "run_sql_query",
      args: { query: "SELECT id, name FROM users LIMIT 5;" },
      stream: false
    }),

  CASE_5_ALLOWED_INTERNAL_CIDR: () =>
    executeGatewayCall({
      scenarioName: "CASE_5_ALLOWED_INTERNAL_CIDR",
      toolName: "cidr_drill_tool",
      args: { action: "ping" },
      clientIp: "10.0.0.1",
      stream: false
    }),

  CASE_6_ALLOWED_MULTI_RULE_EUR: () =>
    executeGatewayCall({
      scenarioName: "CASE_6_ALLOWED_MULTI_RULE_EUR",
      toolName: "adv_refund_tool",
      args: { amount: 50, currency: "EUR" },
      stream: false
    }),

  CASE_7_BLOCKED_REFUND_CEILING: () =>
    executeGatewayCall({
      scenarioName: "CASE_7_BLOCKED_REFUND_CEILING",
      toolName: "issue_refund",
      args: { amount: 5000, customerId: "cust_vip", reason: "unauthorized" },
      stream: false
    }),

  CASE_8_BLOCKED_SQL_INJECTION: () =>
    executeGatewayCall({
      scenarioName: "CASE_8_BLOCKED_SQL_INJECTION",
      toolName: "run_sql_query",
      args: { query: "DROP TABLE users;" },
      stream: false
    }),

  CASE_9_DLP_SECRET_SCRUBBING: () =>
    executeGatewayCall({
      scenarioName: "CASE_9_DLP_SECRET_SCRUBBING",
      toolName: "save_agent_note",
      args: {
        note: "Deploy cluster with AWS credential AKIAIOSFODNN7EXAMPLE and card 4532 0150 1234 5678."
      },
      stream: false
    }),

  CASE_10_BLOCKED_UNTRUSTED_CIDR: () =>
    executeGatewayCall({
      scenarioName: "CASE_10_BLOCKED_UNTRUSTED_CIDR",
      toolName: "cidr_drill_tool",
      args: { action: "restricted_call" },
      clientIp: "198.51.100.42",
      stream: false
    }),

  CASE_11_BLOCKED_MULTI_RULE_USD: () =>
    executeGatewayCall({
      scenarioName: "CASE_11_BLOCKED_MULTI_RULE_USD",
      toolName: "adv_refund_tool",
      args: { amount: 500, currency: "USD" },
      stream: false
    }),

  CASE_12_MCP_POLICY_BLOCK: () =>
    executeMcpCall({
      scenarioName: "CASE_12_MCP_POLICY_BLOCK",
      toolName: "run_sql_query",
      args: { query: "DROP TABLE audit_trail;" }
    }),

  CASE_13_SHADOW_LEARN_NODE_CAP: () =>
    executeGatewayCall({
      scenarioName: "CASE_13_SHADOW_LEARN_NODE_CAP",
      toolName: "cloud_instance_provision",
      args: { nodes: 50, region: "us-east-1" },
      isShadow: true,
      stream: false
    }),

  CASE_14_SHADOW_LEARN_GPU_INSTANCE: () =>
    executeGatewayCall({
      scenarioName: "CASE_14_SHADOW_LEARN_GPU_INSTANCE",
      toolName: "cloud_instance_provision",
      args: { instance_type: "p4de.24xlarge", gpu_count: 8 },
      isShadow: true,
      stream: false
    }),

  CASE_15_HITL_HOLD_HIGH_VALUE: () =>
    executeGatewayCall({
      scenarioName: "CASE_15_HITL_HOLD_HIGH_VALUE",
      toolName: "issue_refund",
      args: { amount: 150, customerId: "cust_enterprise", reason: "dispute" },
      stream: false
    })
};

export async function runFullSimulationBattery() {
  const results: any[] = [];
  for (const fn of Object.values(simulationBatteryMap)) {
    results.push(await fn());
  }
  return results;
}

// ----------------------------------------------------------------------------
// Autonomous Background Heartbeat (Simulates Continuous User Activity)
// ----------------------------------------------------------------------------
const scenarioPool = [
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat AI Completion",
      toolName: "llm_generate",
      args: { prompt: "Synthesize zero-trust architecture guidelines for agent workflows" },
      userEmail: "agent.heartbeat@x4g4t-defense.io",
      clientIp: "192.168.1.110"
    }),
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat Streaming Summary",
      toolName: "llm_generate",
      args: { prompt: "Stream summary of NIST AI Risk Management Framework" },
      userEmail: "sarah.compliance@x4g4t-defense.io",
      clientIp: "192.168.1.120",
      stream: true
    }),
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat Compliant Refund",
      toolName: "issue_refund",
      args: { amount: Math.floor(Math.random() * 80) + 10, customerId: "cust_live" },
      userEmail: "bob.support@x4g4t-defense.io",
      clientIp: "192.168.1.130"
    }),
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat Safe Read Query",
      toolName: "run_sql_query",
      args: { query: "SELECT id, created_at FROM audit_log ORDER BY id DESC LIMIT 5;" },
      userEmail: "dave.analyst@x4g4t-defense.io",
      clientIp: "10.0.1.25"
    }),
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat Shadow GPU Evaluation",
      toolName: "cloud_instance_provision",
      args: { nodes: Math.floor(Math.random() * 20) + 5, instance_type: "p4de.24xlarge" },
      userEmail: "mlops.engineer@x4g4t-defense.io",
      clientIp: "172.16.4.12",
      isShadow: true
    }),
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat Blocked Refund Breach",
      toolName: "issue_refund",
      args: { amount: 3000, customerId: "cust_breach" },
      userEmail: "rogue.agent@x4g4t-defense.io",
      clientIp: "198.51.100.99"
    }),
  () =>
    executeGatewayCall({
      scenarioName: "Heartbeat Blocked SQL Injection",
      toolName: "run_sql_query",
      args: { query: "DROP TABLE users;" },
      userEmail: "attacker.sim@x4g4t-defense.io",
      clientIp: "198.51.100.42"
    })
];

let poolIndex = 0;
setInterval(async () => {
  try {
    const fn = scenarioPool[poolIndex % scenarioPool.length];
    poolIndex++;
    if (fn) await fn();
  } catch {}
}, SIMULATION_INTERVAL_MS);

// ----------------------------------------------------------------------------
// Client Simulator HTTP Server & Telemetry API
// ----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const rawUrl = req.url || "/";
  const urlObj = new URL(rawUrl, "http://localhost");
  const pathname = urlObj.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/healthz" || pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "x4g4t-client-simulator",
        targetProxy: PROXY_URL,
        uptimeSeconds: Math.round(process.uptime()),
        stats: {
          total: stats.totalRequests,
          passed: stats.passedCount,
          blocked: stats.blockedCount,
          held: stats.heldCount,
          shadow: stats.shadowCount
        }
      })
    );
    return;
  }

  if (pathname === "/status" || pathname === "/v1/simulation/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  if (pathname === "/simulate/probe" && req.method === "POST") {
    const result = await executeGatewayCall({
      scenarioName: "AIR_GAP_PROBE",
      toolName: "issue_refund",
      args: { amount: 50 },
      stream: false
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: result.status, verdict: result.verdict, result }));
    return;
  }

  if (pathname === "/simulate/burst" && req.method === "POST") {
    const countParam = urlObj.searchParams.get("count");
    const count = Math.min(50, Math.max(1, parseInt(countParam || "15", 10)));
    const promises = [];
    for (let i = 0; i < count; i++) {
      const fn = scenarioPool[i % scenarioPool.length];
      if (fn) promises.push(fn());
    }
    const burstResults = await Promise.all(promises);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, count: burstResults.length, results: burstResults }));
    return;
  }

  if (pathname === "/simulate/case" && req.method === "POST") {
    const nameParam = urlObj.searchParams.get("name");
    const indexParam = urlObj.searchParams.get("index");
    let targetKey = "";

    const keys = Object.keys(simulationBatteryMap);
    if (indexParam) {
      const idx = parseInt(indexParam, 10) - 1;
      if (idx >= 0 && idx < keys.length) targetKey = keys[idx]!;
    } else if (nameParam) {
      targetKey = keys.find((k) => k.toLowerCase() === nameParam.toLowerCase()) || "";
    }

    if (!targetKey || !simulationBatteryMap[targetKey]) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Scenario not found. Available: ${keys.join(", ")}` }));
      return;
    }

    const result = await simulationBatteryMap[targetKey]!();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, scenario: targetKey, result }));
    return;
  }

  if (pathname === "/simulate/execute" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const result = await executeGatewayCall({
          scenarioName: payload.scenario_name || "CUSTOM_USER_CALL",
          agentId: payload.agent_id,
          toolName: payload.tool_name || "llm_generate",
          args: payload.arguments || {},
          clientIp: payload.client_ip,
          userEmail: payload.user_email,
          hostname: payload.hostname,
          isShadow: Boolean(payload.is_shadow),
          stream: Boolean(payload.stream)
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err?.message }));
      }
    });
    return;
  }

  if (pathname === "/simulate" && req.method === "POST") {
    try {
      const results = await runFullSimulationBattery();

      const summary = {
        totalScenarios: results.length,
        passed: results.filter((r) => r.verdict === "PASSED").length,
        blocked: results.filter((r) => r.verdict === "BLOCKED").length,
        held: results.filter((r) => r.verdict === "HELD").length,
        shadowEvaluated: results.filter((r) => r.isShadow).length,
        killSwitchActive: results.filter((r) => r.verdict === "KILL_SWITCH_ACTIVE").length,
        exceptions: results.filter((r) => r.verdict === "EXCEPTION").length
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          {
            ok: true,
            summary,
            results
          },
          null,
          2
        )
      );
      return;
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Simulation failed", details: err?.message }));
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Client-Simulator] Autonomous Live User Agent listening on http://0.0.0.0:${PORT}`);
  console.log(`[Client-Simulator] Target Gateway Proxy: ${PROXY_URL}`);
  console.log(`[Client-Simulator] Background traffic active (interval: ${SIMULATION_INTERVAL_MS}ms)`);
});
