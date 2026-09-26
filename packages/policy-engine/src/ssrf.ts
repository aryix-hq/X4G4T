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
  "fd00:ec2::254",   // AWS IPv6 IMDS
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local"
]);

const WILDCARD_DNS_SERVICES = [
  "nip.io",
  "sslip.io",
  "xip.io",
  "traefik.me",
  "localtest.me",
  "lvh.me",
  "vcap.me"
];

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
 * Extracts IPv4 address from an IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
 */
function extractIpv4FromIpv6(ipv6: string): string | null {
  const lower = ipv6.toLowerCase().trim();
  let suffix: string | null = null;
  if (lower.startsWith("::ffff:")) {
    suffix = lower.slice("::ffff:".length);
  } else if (lower.startsWith("0:0:0:0:0:ffff:")) {
    suffix = lower.slice("0:0:0:0:0:ffff:".length);
  }

  if (!suffix) return null;
  if (suffix.includes(".")) return suffix;

  const hexParts = suffix.split(":");
  if (hexParts.length === 2 && hexParts[0] !== undefined && hexParts[1] !== undefined) {
    const high = parseInt(hexParts[0], 16);
    const low = parseInt(hexParts[1], 16);
    if (!isNaN(high) && !isNaN(low)) {
      const b1 = (high >> 8) & 0xff;
      const b2 = high & 0xff;
      const b3 = (low >> 8) & 0xff;
      const b4 = low & 0xff;
      return `${b1}.${b2}.${b3}.${b4}`;
    }
  }
  return null;
}

/**
 * Checks whether an IPv6 address is loopback, link-local, or private.
 */
function isPrivateOrReservedIpv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase().trim();
  if (cleanIp === "::1" || cleanIp === "::") return true;
  if (cleanIp.startsWith("fe80:") || cleanIp.startsWith("fc00:") || cleanIp.startsWith("fd00:")) return true;

  // Check IPv4-mapped IPv6
  const mappedIpv4 = extractIpv4FromIpv6(cleanIp);
  if (mappedIpv4) {
    if (DEFAULT_BLOCKED_HOSTNAMES.has(mappedIpv4) || isPrivateOrReservedIpv4(mappedIpv4)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts and inspects embedded IPs from wildcard DNS services (e.g., 127.0.0.1.nip.io or 10-0-0-1.sslip.io).
 */
function inspectWildcardDns(hostname: string): { isWildcard: boolean; embeddedIp?: string } {
  const isWildcard = WILDCARD_DNS_SERVICES.some((svc) => hostname === svc || hostname.endsWith(`.${svc}`));
  if (!isWildcard) {
    return { isWildcard: false };
  }

  // Attempt to extract embedded IPv4 pattern (e.g. 127.0.0.1 or 127-0-0-1)
  const match = hostname.match(/(\d{1,3}[\.-]\d{1,3}[\.-]\d{1,3}[\.-]\d{1,3})/);
  if (match && match[1]) {
    const ip = match[1].replace(/-/g, ".");
    return { isWildcard: true, embeddedIp: ip };
  }

  return { isWildcard: true };
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

  // 2. Block known cloud metadata hostnames (IPv4 or IPv6 IMDS)
  if (DEFAULT_BLOCKED_HOSTNAMES.has(rawHostname)) {
    return { valid: false, reason: `Access to cloud metadata service '${rawHostname}' is strictly blocked.` };
  }

  // Check IPv4-mapped IPv6 metadata bypass
  const mappedIpv4 = extractIpv4FromIpv6(rawHostname);
  if (mappedIpv4 && DEFAULT_BLOCKED_HOSTNAMES.has(mappedIpv4)) {
    return { valid: false, reason: `Access to cloud metadata service '${rawHostname}' (IPv4-mapped) is strictly blocked.` };
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
  const isLoopback =
    rawHostname === "localhost" ||
    rawHostname.endsWith(".localhost") ||
    rawHostname.endsWith(".localtest.me") ||
    rawHostname.endsWith(".lvh.me") ||
    rawHostname.endsWith(".vcap.me");
  if (isLoopback && !options.allowLocal) {
    return { valid: false, reason: `Access to loopback hostname '${rawHostname}' is blocked.` };
  }

  // 6. Wildcard DNS Rebinding check
  const wildcardCheck = inspectWildcardDns(rawHostname);
  if (wildcardCheck.isWildcard) {
    if (wildcardCheck.embeddedIp) {
      if (
        DEFAULT_BLOCKED_HOSTNAMES.has(wildcardCheck.embeddedIp) ||
        isPrivateOrReservedIpv4(wildcardCheck.embeddedIp)
      ) {
        if (!options.allowLocal) {
          return {
            valid: false,
            reason: `Wildcard DNS resolving to private IP or metadata '${wildcardCheck.embeddedIp}' is blocked.`
          };
        }
      }
    } else if (!options.allowLocal) {
      return {
        valid: false,
        reason: `Wildcard DNS service domain '${rawHostname}' is blocked to prevent DNS rebinding.`
      };
    }
  }

  // 7. Kubernetes internal service check
  if (rawHostname.endsWith(".svc.cluster.local") && !options.allowLocal) {
    return { valid: false, reason: `Access to internal Kubernetes service '${rawHostname}' is blocked.` };
  }

  // 8. IP address checks
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
