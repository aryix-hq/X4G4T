# IDEs, Autonomous Agents & Model Context Protocol (MCP)

## 1. Supported Client Ecosystem

X4G4T integrates seamlessly with all modern AI developer environments and agentic frameworks:

```
  ┌────────────────────────────────────────────────────────┐
  │                   SUPPORTED CLIENTS                    │
  ├───────────────────┬──────────────────┬─────────────────┤
  │ IDE Assistants    │ Agent Frameworks │ MCP Clients     │
  ├───────────────────┼──────────────────┼─────────────────┤
  │ • Cursor          │ • LangChain      │ • Claude Desktop│
  │ • Windsurf        │ • CrewAI         │ • Cursor MCP    │
  │ • VS Code Copilot │ • AutoGen        │ • Zed Editor    │
  │ • JetBrains AI    │ • Semantic Kernel│ • Custom Daemons│
  └───────────────────┴──────────────────┴─────────────────┘
```

---

## 2. Model Context Protocol (MCP) Integration

The **Model Context Protocol (MCP)** standardizes how AI models discover and invoke external tools over JSON-RPC 2.0. X4G4T acts as a transparent, high-assurance MCP firewall (`POST /v1/gateway/mcp`):

### JSON-RPC 2.0 Policy Interception
When an MCP client invokes a tool call:
```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "tools/call",
  "params": {
    "name": "run_terminal_command",
    "arguments": {
      "command": "rm -rf /var/log"
    }
  }
}
```

1. **Compliant Tool Call:** If arguments satisfy all active policies, X4G4T proxies the frame downstream and returns standard JSON-RPC `result`.
2. **Blocked Tool Call:** If a rule triggers `BLOCK`, X4G4T halts the request and returns a standard JSON-RPC 2.0 error frame with compliance code `-32001`:

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "error": {
    "code": -32001,
    "message": "Tool execution blocked by X4G4T policy: Dangerous Command Guard",
    "data": {
      "policyId": "pol_dangerous_cmd_guard",
      "verdict": "BLOCKED"
    }
  }
}
```

---

## 3. Configuring Claude Desktop for MCP

Add X4G4T as an MCP proxy bridge in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x4g4t-secure-gateway": {
      "command": "npx",
      "args": [
        "-y",
        "@x4g4t/mcp-bridge",
        "--gateway-url", "http://localhost:4000/v1/gateway/mcp",
        "--api-key", "sec_live_dev_key_12345678901234567890"
      ]
    }
  }
}
```

---

## 4. Configuring Cursor & Coding Agents

In your Cursor or workspace settings (`.cursor/settings.json` or `.env`):

```bash
# Point your agent tool executions to X4G4T
X4G4T_GATEWAY_URL="http://localhost:4000/v1/gateway/execute"
X4G4T_API_KEY="sec_live_dev_key_12345678901234567890"
```

Every terminal execution, file modification, or external query emitted by Cursor is inspected and governed in sub-millisecond real time.
