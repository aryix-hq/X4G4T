#!/usr/bin/env tsx
/**
 * ============================================================================
 * X4G4T Graylog GELF Simulator & Local Emitter / Receiver Tool
 * ============================================================================
 * Provides a lightweight local replacement for testing Graylog GELF 1.1 log
 * transport without requiring the heavyweight 4GB Elasticsearch + Graylog + Mongo
 * cluster.
 *
 * Usage:
 *   # Listen mode (default): Captures and displays UDP GELF packets on port 12201
 *   pnpm dlx tsx tools/simulators/graylog-emitter.ts --listen
 *
 *   # Emitter mode: Generates synthetic GELF frames and sends to Graylog GELF UDP
 *   pnpm dlx tsx tools/simulators/graylog-emitter.ts --emit --count=5
 * ============================================================================
 */

import dgram from "node:dgram";
import zlib from "node:zlib";

const PORT = Number(process.env.GRAYLOG_PORT) || 12201;
const HOST = process.env.GRAYLOG_HOST || "127.0.0.1";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export interface GelfMessage {
  version: string;
  host: string;
  short_message: string;
  full_message?: string;
  timestamp: number;
  level: number;
  _org_id?: string;
  _agent_id?: string;
  _tool_name?: string;
  _verdict?: string;
  _mode?: string;
  _client_ip?: string;
  _user_email?: string;
  _latency_ms?: number;
  _status_code?: number;
  [key: string]: unknown;
}

/**
 * Starts a lightweight UDP receiver that prints incoming GELF 1.1 frames.
 */
export function startGelfListener(port: number = PORT, host: string = "0.0.0.0"): Promise<dgram.Socket> {
  return new Promise((resolve, reject) => {
    const server = dgram.createSocket("udp4");

    server.on("error", (err) => {
      console.error(`${RED}[GELF Simulator] Socket error:${RESET}`, err);
      server.close();
      reject(err);
    });

    server.on("message", (msg, rinfo) => {
      let rawText = "";
      try {
        // GELF can be uncompressed JSON, gzip, or zlib deflated
        if (msg[0] === 0x1f && msg[1] === 0x8b) {
          rawText = zlib.gunzipSync(msg).toString("utf8");
        } else if (msg[0] === 0x78) {
          rawText = zlib.inflateSync(msg).toString("utf8");
        } else {
          rawText = msg.toString("utf8");
        }

        const gelf: GelfMessage = JSON.parse(rawText);
        const levelBadge =
          gelf.level <= 3 ? `${RED}[ERR]` : gelf.level === 4 ? `${YELLOW}[WARN]` : `${GREEN}[INFO]`;

        console.log(
          `${DIM}${new Date().toISOString()}${RESET} ${levelBadge}${RESET} ` +
          `${BOLD}${gelf._verdict || "EVENT"}${RESET} ` +
          `${CYAN}${gelf._agent_id || "agent"}${RESET} -> ` +
          `${MAGENTA}${gelf._tool_name || "tool"}${RESET} ` +
          `(${gelf._latency_ms || 0}ms) from ${rinfo.address}:${rinfo.port}`
        );
        console.log(`  ${DIM}Message:${RESET} ${gelf.short_message}`);
        if (gelf._client_ip || gelf._user_email) {
          console.log(`  ${DIM}Identity:${RESET} user=${gelf._user_email || "anon"} ip=${gelf._client_ip || "unknown"}`);
        }
      } catch (parseErr) {
        console.warn(`${YELLOW}[GELF Simulator] Non-JSON or corrupted UDP packet:${RESET}`, msg.toString("hex"));
      }
    });

    server.on("listening", () => {
      const addr = server.address();
      console.log(`${GREEN}${BOLD}✓ X4G4T GELF UDP Simulator listening on ${addr.address}:${addr.port}${RESET}`);
      console.log(`${DIM}Awaiting GELF 1.1 log events from Fastify proxy / policy-engine...${RESET}\n`);
      resolve(server);
    });

    server.bind(port, host);
  });
}

/**
 * Generates synthetic GELF messages to test downstream Graylog ingestion.
 */
export async function emitSyntheticGelfBatch(
  targetHost: string = HOST,
  targetPort: number = PORT,
  count: number = 3
): Promise<void> {
  const client = dgram.createSocket("udp4");
  const scenarios = [
    {
      verdict: "ALLOW",
      tool: "database_query",
      msg: "[agent_sales_01] database_query -> ALLOW (ACTIVE)",
      level: 6,
      args: { sql: "SELECT name, email FROM customers WHERE active = true LIMIT 50;" }
    },
    {
      verdict: "BLOCKED",
      tool: "database_query",
      msg: "[agent_adversary] database_query -> BLOCKED (pol_sql_destructive_guard)",
      level: 4,
      args: { sql: "DROP TABLE users;" }
    },
    {
      verdict: "REQUIRE_APPROVAL",
      tool: "wire_transfer",
      msg: "[agent_treasury] wire_transfer -> REQUIRE_APPROVAL (pol_high_value_wire)",
      level: 5,
      args: { amount: 75000, recipient: "ACME Corp" }
    }
  ];

  console.log(`${CYAN}${BOLD}Dispatching ${count} synthetic GELF 1.1 messages to ${targetHost}:${targetPort}...${RESET}`);

  for (let i = 0; i < count; i++) {
    const sc = scenarios[i % scenarios.length];
    const payload: GelfMessage = {
      version: "1.1",
      host: "x4g4t-workstation-sim",
      short_message: sc.msg,
      full_message: JSON.stringify(sc),
      timestamp: Date.now() / 1000,
      level: sc.level,
      _org_id: "org_enterprise_corp",
      _agent_id: `agent_${sc.verdict.toLowerCase()}_${i + 1}`,
      _tool_name: sc.tool,
      _verdict: sc.verdict,
      _mode: "ACTIVE",
      _client_ip: "10.0.4.15",
      _user_email: "dev.auditor@x4g4t.internal",
      _latency_ms: Math.floor(Math.random() * 8) + 1,
      _status_code: sc.verdict === "ALLOW" ? 200 : sc.verdict === "BLOCKED" ? 422 : 202,
      _arguments: JSON.stringify(sc.args)
    };

    const buf = Buffer.from(JSON.stringify(payload));
    await new Promise<void>((res, rej) => {
      client.send(buf, targetPort, targetHost, (err) => {
        if (err) rej(err);
        else {
          console.log(`  ${GREEN}✓ Sent GELF [${payload._verdict}] frame (${buf.length} bytes)${RESET}`);
          res();
        }
      });
    });
  }

  client.close();
  console.log(`\n${GREEN}${BOLD}✓ Finished emitting synthetic GELF batch.${RESET}\n`);
}

// ----------------------------------------------------------------------------
// CLI Entry Point
// ----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const isEmit = args.some((a) => a === "--emit" || a.startsWith("--emit="));
  const isListen = args.some((a) => a === "--listen") || !isEmit;

  if (isEmit) {
    const countArg = args.find((a) => a.startsWith("--count="));
    const count = countArg ? parseInt(countArg.split("=")[1], 10) : 3;
    await emitSyntheticGelfBatch(HOST, PORT, count);
  } else if (isListen) {
    await startGelfListener(PORT);
  }
}

if (process.argv[1]?.endsWith("graylog-emitter.ts")) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
