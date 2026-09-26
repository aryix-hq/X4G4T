import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export interface CallerTrace {
  clientIp: string;
  clientHostname?: string;
  userEmail?: string;
  userName?: string;
  sessionId?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    callerTrace: CallerTrace;
  }
}

const telemetryPluginCallback: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    const headers = request.headers;

    // 1. Client IP (from X-Forwarded-For first hop, X-Real-IP, request.ip, or socket)
    let clientIp = "127.0.0.1";
    const xForwardedFor = headers["x-forwarded-for"];
    const xRealIp = headers["x-real-ip"];
    if (typeof xForwardedFor === "string") {
      const first = xForwardedFor.split(",")[0];
      if (first) clientIp = first.trim();
    } else if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      const first = xForwardedFor[0];
      if (first) clientIp = first.trim();
    } else if (typeof xRealIp === "string") {
      clientIp = xRealIp.trim();
    } else if (request.ip) {
      clientIp = request.ip;
    } else if (request.socket?.remoteAddress) {
      clientIp = request.socket.remoteAddress;
    }

    // 2. Client Hostname
    const xHostname = headers["x-client-hostname"];
    const host = headers["host"];
    let clientHostname = "localhost";
    if (typeof xHostname === "string" && xHostname) {
      clientHostname = xHostname;
    } else if (typeof host === "string" && host) {
      const h = host.split(":")[0];
      if (h) clientHostname = h;
    }

    // 3. User Identity (from X-User-Email, X-User-Name, or session)
    const xEmail = headers["x-user-email"];
    const xAuthEmail = headers["x-auth-email"];
    const userEmail =
      (typeof xEmail === "string" && xEmail) ||
      (typeof xAuthEmail === "string" && xAuthEmail) ||
      undefined;

    const xName = headers["x-user-name"];
    const xAuthName = headers["x-auth-username"];
    const userName =
      (typeof xName === "string" && xName) ||
      (typeof xAuthName === "string" && xAuthName) ||
      undefined;

    // 4. Session ID / Correlation ID
    const xSession = headers["x-session-id"];
    const xCorr = headers["x-correlation-id"];
    const sessionId =
      (typeof xSession === "string" && xSession) ||
      (typeof xCorr === "string" && xCorr) ||
      undefined;

    request.callerTrace = {
      clientIp,
      clientHostname,
      userEmail,
      userName,
      sessionId
    };
  });
};

export const telemetryPlugin = fp(telemetryPluginCallback, {
  name: "telemetryPlugin"
});
