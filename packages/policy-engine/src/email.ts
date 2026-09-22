import net from "node:net";
import tls from "node:tls";

export interface HitlEmailParams {
  holdId: string;
  agentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  policyName?: string;
  portalBaseUrl?: string;
  recipientEmail?: string;
}

export interface SmtpConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  adminEmail: string;
}

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "X4G4T Security <no-reply@x4g4t.internal>";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@enterprise.internal";

  return { host, port, secure, user, pass, from, adminEmail };
}

export function formatHitlEmailHtml(params: HitlEmailParams): string {
  const portalUrl = params.portalBaseUrl || process.env.PORTAL_BASE_URL || "http://localhost:3000";
  const approveUrl = `${portalUrl}/dashboard/approvals?action=approve&holdId=${encodeURIComponent(params.holdId)}`;
  const rejectUrl = `${portalUrl}/dashboard/approvals?action=reject&holdId=${encodeURIComponent(params.holdId)}`;
  const argsJson = JSON.stringify(params.arguments, null, 2);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>X4G4T Security Approval Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
    .header { background-color: #4338ca; padding: 20px 24px; text-align: left; }
    .header h1 { margin: 0; font-size: 18px; color: #ffffff; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0 0; font-size: 12px; color: #c7d2fe; }
    .content { padding: 24px; }
    .badge { display: inline-block; background-color: #f59e0b; color: #78350f; font-weight: bold; font-size: 11px; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; margin-bottom: 16px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #334155; }
    .info-table td.label { color: #94a3b8; width: 35%; font-weight: 500; }
    .info-table td.value { color: #f1f5f9; font-family: monospace; }
    .code-box { background-color: #090d16; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #38bdf8; overflow-x: auto; white-space: pre-wrap; margin-bottom: 24px; }
    .actions { display: flex; gap: 12px; margin-top: 24px; }
    .btn { display: inline-block; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none; text-align: center; }
    .btn-approve { background-color: #4f46e5; color: #ffffff !important; }
    .btn-reject { background-color: #e11d48; color: #ffffff !important; }
    .footer { padding: 16px 24px; background-color: #0f172a; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ X4G4T Tactical Defense Gate</h1>
      <p>Autonomous Agent Tool Execution Held for Human Review</p>
    </div>
    <div class="content">
      <span class="badge">Human-in-the-Loop Required</span>
      <p style="font-size: 14px; line-height: 1.5; color: #cbd5e1; margin-top: 0;">
        An autonomous AI agent has attempted an operation that triggered a high-impact security guardrail. Your approval is required before execution proceeds to the downstream target API.
      </p>

      <table class="info-table">
        <tr>
          <td class="label">Hold ID</td>
          <td class="value">${params.holdId}</td>
        </tr>
        <tr>
          <td class="label">Agent Identifier</td>
          <td class="value">${params.agentId}</td>
        </tr>
        <tr>
          <td class="label">Target Tool</td>
          <td class="value">${params.toolName}</td>
        </tr>
        <tr>
          <td class="label">Triggered Policy</td>
          <td class="value">${params.policyName || "High-Impact Operation Gate"}</td>
        </tr>
      </table>

      <div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px; font-weight: 600;">Sanitized Tool Arguments:</div>
      <div class="code-box">${argsJson}</div>

      <div class="actions">
        <a href="${approveUrl}" class="btn btn-approve">✓ Approve Execution in Portal</a>
        &nbsp;&nbsp;
        <a href="${rejectUrl}" class="btn btn-reject">✕ Reject / Terminate</a>
      </div>
    </div>
    <div class="footer">
      This notification was automatically dispatched by the X4G4T Centralized Security Gateway.<br>
      Hold expires automatically after 15 minutes.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Sends an email notification to the administrator via SMTP or simulation.
 */
export async function sendHitlApprovalEmail(params: HitlEmailParams): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
  const config = getSmtpConfig();
  const recipient = params.recipientEmail || config.adminEmail;

  if (!config.host) {
    // If SMTP host is not configured, simulate sending and log for development/demo
    console.log(
      `[X4G4T SMTP Simulation] Approval email dispatched for Hold: ${params.holdId} to Admin: ${recipient} (Tool: ${params.toolName})`
    );
    return { success: true, simulated: true };
  }

  const html = formatHitlEmailHtml(params);
  const subject = `[X4G4T Security Hold] Approval Required for Agent: ${params.agentId} (${params.toolName})`;

  return new Promise((resolve) => {
    try {
      const socket = config.secure
        ? tls.connect({ host: config.host, port: config.port })
        : net.connect({ host: config.host, port: config.port });

      socket.setTimeout(8000);

      let step = 0;
      const commands = [
        `EHLO x4g4t.internal\r\n`,
        config.user && config.pass ? `AUTH LOGIN\r\n` : `MAIL FROM:<${config.from}>\r\n`,
        config.user && config.pass ? `${Buffer.from(config.user).toString("base64")}\r\n` : `RCPT TO:<${recipient}>\r\n`,
        config.user && config.pass ? `${Buffer.from(config.pass).toString("base64")}\r\n` : `DATA\r\n`
      ];

      socket.on("data", (data) => {
        const response = data.toString();
        if (response.startsWith("2") || response.startsWith("3")) {
          if (step < commands.length) {
            const nextCmd = commands[step];
            if (nextCmd) {
              socket.write(nextCmd);
            }
            step++;
          } else if (step === commands.length) {
            // Send DATA content
            const emailData = [
              `From: ${config.from}`,
              `To: ${recipient}`,
              `Subject: ${subject}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=utf-8`,
              ``,
              html,
              `\r\n.\r\n`
            ].join("\r\n");

            socket.write(emailData);
            step++;
          } else {
            socket.write("QUIT\r\n");
            socket.end();
            resolve({ success: true, messageId: `msg_${params.holdId}` });
          }
        }
      });

      socket.on("error", (err) => {
        console.warn("[X4G4T SMTP Error]:", err.message);
        resolve({ success: false, simulated: true });
      });

      socket.on("timeout", () => {
        socket.destroy();
        console.warn("[X4G4T SMTP Timeout]: Failed to connect within 8000ms");
        resolve({ success: false, simulated: true });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[X4G4T SMTP Exception]:", message);
      resolve({ success: false, simulated: true });
    }
  });
}
