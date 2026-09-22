import { URL } from "node:url";
import { isIP } from "node:net";

export interface SsrfValidationOptions {
  allowLocal?: boolean;
  allowedDomains?: string[];
  blockedHostnames?: string[];
}

export interface SsrfValidationResult {
  valid: boolean;
  reason?: string;
}

const DEFAULT_BLOCKED_HOSTNAMES = new Set([
  "169.254.169.254", // AWS, GCP, Azure, OpenStack link-local metadata
  "169.254.170.2",   // AWS ECS task metadata
  "192.0.0.192",     // Oracle Cloud metadata
  "metadata.google.internal",
  "metadata",
  "instance-data"
]);

/**
 * Checks whether an IPv4 address belongs to a private / link-local / loopback subnet.
 */
function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 10.0.0.0/8 - Private
  if (a === 10) return true;

  // 172.16.0.0/12 - Private (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 - Private
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 - Link-local (Cloud metadata)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 - Current network
  if (a === 0) return true;

  // 100.64.0.0/10 - Carrier-Grade NAT
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, link-local, or private.
 */
function isPrivateOrReservedIpv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase().trim();
  if (cleanIp === "::1" || cleanIp === "::") return true;
  if (cleanIp.startsWith("fe80:") || cleanIp.startsWith("fc00:") || cleanIp.startsWith("fd00:")) return true;
  return false;
}

/**
 * Validates a downstream target URL to prevent Server-Side Request Forgery (SSRF).
 * Returns { valid: boolean, reason?: string }.
 */
export function validateDownstreamUrl(
  urlString: string,
  options: SsrfValidationOptions = {}
): SsrfValidationResult {
  if (!urlString || typeof urlString !== "string") {
    return { valid: false, reason: "Target URL must be a non-empty string." };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, reason: `Malformed target URL '${urlString}'.` };
  }

  // 1. Protocol validation: Only HTTP and HTTPS are permitted
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return { valid: false, reason: `Protocol '${protocol}' is not permitted. Only HTTP and HTTPS are allowed.` };
  }

  // In strict production mode, require HTTPS
  if (process.env.NODE_ENV === "production" && protocol !== "https:" && !options.allowLocal) {
    return { valid: false, reason: "Target URL must use HTTPS in production environments." };
  }

  const rawHostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""); // Strip IPv6 brackets

  // 2. Block known cloud metadata hostnames
  if (DEFAULT_BLOCKED_HOSTNAMES.has(rawHostname)) {
    return { valid: false, reason: `Access to cloud metadata service '${rawHostname}' is strictly blocked.` };
  }

  // 3. Custom blocked hostnames
  if (options.blockedHostnames?.includes(rawHostname)) {
    return { valid: false, reason: `Target hostname '${rawHostname}' is explicitly blocked.` };
  }

  // 4. Allowed domains whitelist check (if configured)
  if (options.allowedDomains && options.allowedDomains.length > 0) {
    const isAllowed = options.allowedDomains.some((d) =>
      rawHostname === d.toLowerCase() || rawHostname.endsWith(`.${d.toLowerCase()}`)
    );
    if (!isAllowed) {
      return { valid: false, reason: `Hostname '${rawHostname}' is not in the configured allowed domains whitelist.` };
    }
  }

  // 5. Loopback & Localhost check
  const isLoopback = rawHostname === "localhost" || rawHostname.endsWith(".localhost");
  if (isLoopback && !options.allowLocal) {
    return { valid: false, reason: `Access to loopback hostname '${rawHostname}' is blocked.` };
  }

  // 6. IP address checks
  const ipType = isIP(rawHostname);
  if (ipType === 4) {
    if (isPrivateOrReservedIpv4(rawHostname) && !options.allowLocal) {
      return { valid: false, reason: `Access to private/reserved IPv4 address '${rawHostname}' is blocked.` };
    }
  } else if (ipType === 6) {
    if (isPrivateOrReservedIpv6(rawHostname) && !options.allowLocal) {
      return { valid: false, reason: `Access to private/reserved IPv6 address '${rawHostname}' is blocked.` };
    }
  }

  return { valid: true };
}

