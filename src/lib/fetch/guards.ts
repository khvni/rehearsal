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

interface RobotsRule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}

const robotsCache = new Map<string, Promise<RobotsRule[]>>();

function robotsPattern(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Parse the `User-agent: *` group(s) of robots.txt into Allow/Disallow rules (wildcards + `$`). */
export function parseRobots(robots: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let groupApplies = false;
  let inUaRun = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!inUaRun) groupApplies = false;
      inUaRun = true;
      if (value === "*") groupApplies = true;
      continue;
    }
    inUaRun = false;
    if (!groupApplies || !value) continue;
    rules.push({ allow: key === "allow", pattern: robotsPattern(value), length: value.length });
  }
  return rules;
}

/** Longest-match robots.txt check (Allow wins ties). Unreachable robots.txt => allowed. */
export function robotsAllowsPath(rules: RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | undefined;
  for (const r of rules) {
    if (!r.pattern.test(pathAndQuery)) continue;
    if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/** Fetch robots.txt following at most 3 redirects, re-validating every hop with `assertPublicUrl`. */
async function fetchRobots(start: string): Promise<string | undefined> {
  let target = await assertPublicUrl(start);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(target, { signal: AbortSignal.timeout(10000), redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      target = await assertPublicUrl(new URL(location, target).toString());
      continue;
    }
    return res.ok ? await res.text() : undefined;
  }
  return undefined;
}

/** True when the target host's robots.txt permits fetching `url` (cached per origin). */
export async function robotsAllows(url: URL): Promise<boolean> {
  let rules = robotsCache.get(url.origin);
  if (!rules) {
    rules = fetchRobots(`${url.origin}/robots.txt`)
      .then((text) => (text === undefined ? [] : parseRobots(text)))
      .catch(() => []);
    robotsCache.set(url.origin, rules);
  }
  return robotsAllowsPath(await rules, `${url.pathname}${url.search}`);
}
