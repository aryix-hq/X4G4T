import { describe, it, expect } from "vitest";
import { validateDownstreamUrl } from "../src/ssrf.js";

describe("SSRF Protection Guard (validateDownstreamUrl)", () => {
  it("should allow valid public HTTPS URLs", () => {
    expect(validateDownstreamUrl("https://api.stripe.com/v1/refunds").valid).toBe(true);
    expect(validateDownstreamUrl("https://api.openai.com/v1/chat/completions").valid).toBe(true);
    expect(validateDownstreamUrl("https://generativelanguage.googleapis.com/v1beta/models").valid).toBe(true);
  });

  it("should reject non-HTTP(S) protocols", () => {
    expect(validateDownstreamUrl("ftp://files.corp/data").valid).toBe(false);
    expect(validateDownstreamUrl("file:///etc/passwd").valid).toBe(false);
    expect(validateDownstreamUrl("gopher://localhost:70").valid).toBe(false);
  });

  it("should block cloud metadata IP addresses and domains", () => {
    // AWS / GCP / Azure IMDS
    const awsRes = validateDownstreamUrl("http://169.254.169.254/latest/meta-data/");
    expect(awsRes.valid).toBe(false);
    expect(awsRes.reason).toContain("metadata");

    // GCP metadata domain
    const gcpRes = validateDownstreamUrl("http://metadata.google.internal/computeMetadata/v1/");
    expect(gcpRes.valid).toBe(false);
    expect(gcpRes.reason).toContain("metadata");

    // Oracle Cloud metadata
    const oracleRes = validateDownstreamUrl("http://192.0.0.192/latest/");
    expect(oracleRes.valid).toBe(false);
  });

  it("should block loopback and localhost in production mode", () => {
    expect(validateDownstreamUrl("http://127.0.0.1:8080/admin", { allowLocal: false }).valid).toBe(false);
    expect(validateDownstreamUrl("http://localhost:3000/api", { allowLocal: false }).valid).toBe(false);
    expect(validateDownstreamUrl("http://[::1]:8080", { allowLocal: false }).valid).toBe(false);
  });

  it("should allow loopback and localhost when allowLocal is true (development/test)", () => {
    expect(validateDownstreamUrl("http://127.0.0.1:8080/admin", { allowLocal: true }).valid).toBe(true);
    expect(validateDownstreamUrl("http://localhost:3000/api", { allowLocal: true }).valid).toBe(true);
  });

  it("should block private RFC 1918 subnets in production mode", () => {
    // 10.0.0.0/8
    expect(validateDownstreamUrl("http://10.0.1.5/internal", { allowLocal: false }).valid).toBe(false);
    // 172.16.0.0/12
    expect(validateDownstreamUrl("http://172.20.0.10:9000", { allowLocal: false }).valid).toBe(false);
    // 192.168.0.0/16
    expect(validateDownstreamUrl("http://192.168.1.1/router", { allowLocal: false }).valid).toBe(false);
  });

  it("should reject invalid or unparseable URLs", () => {
    expect(validateDownstreamUrl("not-a-url").valid).toBe(false);
    expect(validateDownstreamUrl("").valid).toBe(false);
  });

  it("should block IPv4-mapped IPv6 addresses for loopback, private IPs, and metadata", () => {
    // IPv4-mapped IPv6 loopback (127.0.0.1)
    expect(validateDownstreamUrl("http://[::ffff:127.0.0.1]/admin", { allowLocal: false }).valid).toBe(false);
    // IPv4-mapped IPv6 in hex notation (::ffff:7f00:1)
    expect(validateDownstreamUrl("http://[::ffff:7f00:1]/admin", { allowLocal: false }).valid).toBe(false);
    // IPv4-mapped IPv6 cloud metadata (169.254.169.254)
    expect(validateDownstreamUrl("http://[::ffff:169.254.169.254]/latest/meta-data/", { allowLocal: true }).valid).toBe(false);
    expect(validateDownstreamUrl("http://[::ffff:a9fe:a9fe]/latest/meta-data/", { allowLocal: true }).valid).toBe(false);
    // IPv4-mapped IPv6 private RFC 1918 (10.0.0.1)
    expect(validateDownstreamUrl("http://[::ffff:10.0.0.1]/internal", { allowLocal: false }).valid).toBe(false);
  });

  it("should block AWS IPv6 IMDS (fd00:ec2::254)", () => {
    const res = validateDownstreamUrl("http://[fd00:ec2::254]/latest/meta-data/");
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("metadata");
  });

  it("should block wildcard DNS rebinding services targeting private IPs or loopback", () => {
    // nip.io
    expect(validateDownstreamUrl("http://127.0.0.1.nip.io/admin", { allowLocal: false }).valid).toBe(false);
    expect(validateDownstreamUrl("http://10.0.0.1.nip.io/api", { allowLocal: false }).valid).toBe(false);
    // sslip.io with hyphenated notation
    expect(validateDownstreamUrl("http://192-168-1-1.sslip.io/status", { allowLocal: false }).valid).toBe(false);
    // localtest.me / lvh.me loopback domains
    expect(validateDownstreamUrl("http://test.localtest.me:8080", { allowLocal: false }).valid).toBe(false);
    expect(validateDownstreamUrl("http://sub.lvh.me", { allowLocal: false }).valid).toBe(false);
  });

  it("should block internal Kubernetes cluster DNS names", () => {
    expect(validateDownstreamUrl("http://kubernetes.default.svc/api", { allowLocal: false }).valid).toBe(false);
    expect(validateDownstreamUrl("http://vault.security.svc.cluster.local:8200/v1/secret", { allowLocal: false }).valid).toBe(false);
  });

  it("should block decimal, octal, and hexadecimal encoded IP addresses", () => {
    // 2130706433 = 127.0.0.1 in decimal integer format
    expect(validateDownstreamUrl("http://2130706433/admin", { allowLocal: false }).valid).toBe(false);
    // 0x7f000001 = 127.0.0.1 in hex format
    expect(validateDownstreamUrl("http://0x7f000001/admin", { allowLocal: false }).valid).toBe(false);
  });
});


