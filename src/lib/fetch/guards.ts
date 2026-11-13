import { promises as dns } from "node:dns";
import ipaddr from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254", // cloud metadata endpoints
]);

function isPrivateIp(ip: string): boolean {
  if (ipaddr.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** Assert a target URL is a public http(s) page. Throws on violation.
 *  REHEARSAL_ALLOW_PRIVATE=1 permits localhost/private targets (tests only). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (process.env.REHEARSAL_ALLOW_PRIVATE === "1") return url;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked protocol: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Blocked hostname: ${host}`);
  }
  if (ipaddr.isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`Blocked private IP: ${host}`);
    return url;
  }
  const { address } = await dns.lookup(host);
  if (isPrivateIp(address)) throw new Error(`Hostname resolves to private IP: ${host} -> ${address}`);
  return url;
}

// ── Politeness ──────────────────────────────────────────────────────────────

const lastRequestAt = new Map<string, number>();
const MIN_INTERVAL_MS = 2000;

/** Rate-limit requests to ~1 per 2s per target host. */
export async function politeDelay(url: URL): Promise<void> {
  const host = url.hostname;
  const now = Date.now();
  const last = lastRequestAt.get(host) ?? 0;
  const waitMs = Math.max(0, MIN_INTERVAL_MS - (now - last));
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  lastRequestAt.set(host, Date.now());
}

/** Return disallowed path prefixes for `url` per robots.txt; [] on any failure. */
export async function robotsDisallowed(url: URL, fetcher: (u: string) => Promise<string>): Promise<string[]> {
  try {
    const robots = await fetcher(`${url.protocol}//${url.host}/robots.txt`);
    const lines = robots.split("\n");
    let uaApplies = false;
    const disallowed: string[] = [];
    for (const line of lines) {
      const l = line.trim();
      if (/^user-agent:\s*\*/i.test(l)) uaApplies = true;
      else if (/^user-agent:/i.test(l)) uaApplies = false;
      else if (uaApplies && /^disallow:/i.test(l)) {
        const p = l.replace(/^disallow:/i, "").trim();
        if (p) disallowed.push(p);
      }
    }
    return disallowed;
  } catch {
    return [];
  }
}
