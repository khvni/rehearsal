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
    if (lower === "::1" || lower === "::" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
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
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** Resolve `hostname` and return the address to connect to; throws if it is blocked or private.
 *  Every resolved address must be public, so a mixed DNS answer cannot slip a private one through.
 *  REHEARSAL_ALLOW_PRIVATE=1 permits localhost/private targets (tests only). */
export async function resolvePublicHost(hostname: string): Promise<string> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (ipaddr.isIP(host)) {
    if (process.env.REHEARSAL_ALLOW_PRIVATE !== "1" && isPrivateIp(host)) throw new Error(`Blocked private IP: ${host}`);
    return host;
  }
  if (process.env.REHEARSAL_ALLOW_PRIVATE === "1") return (await dns.lookup(host)).address;
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Blocked hostname: ${host}`);
  }
  const addresses = await dns.lookup(host, { all: true });
  if (addresses.length === 0) throw new Error(`Hostname did not resolve: ${host}`);
  const blocked = addresses.find((a) => isPrivateIp(a.address));
  if (blocked) throw new Error(`Hostname resolves to private IP: ${host} -> ${blocked.address}`);
  return addresses[0].address;
}

/** Assert a target URL is a public http(s) page. Throws on violation.
 *  REHEARSAL_ALLOW_PRIVATE=1 permits localhost/private targets (tests only). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (process.env.REHEARSAL_ALLOW_PRIVATE === "1") return url;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked protocol: ${url.protocol}`);
  }
  await resolvePublicHost(url.hostname);
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
  /** Literal pieces between `*` wildcards; the first is a required prefix. */
  segments: string[];
  /** Trailing `$`: the last segment must end the path. */
  anchored: boolean;
  length: number;
}

const robotsCache = new Map<string, Promise<RobotsRule[]>>();

const MAX_ROBOTS_BYTES = 500 * 1024; // Google's robots.txt limit
const MAX_ROBOTS_RULE_LENGTH = 512;
const MAX_ROBOTS_RULES = 2000;

function robotsRule(allow: boolean, value: string): RobotsRule {
  const anchored = value.endsWith("$");
  const segments = (anchored ? value.slice(0, -1) : value).split("*");
  return { allow, segments, anchored, length: value.length };
}

/** Linear wildcard match: each literal segment is found once, left to right, with `indexOf`. */
function robotsRuleMatches(rule: RobotsRule, path: string): boolean {
  const { segments, anchored } = rule;
  const first = segments[0];
  if (!path.startsWith(first)) return false;
  if (segments.length === 1) return anchored ? path.length === first.length : true;
  let pos = first.length;
  const lastIndex = segments.length - 1;
  for (let i = 1; i < lastIndex; i++) {
    const at = path.indexOf(segments[i], pos);
    if (at === -1) return false;
    pos = at + segments[i].length;
  }
  const last = segments[lastIndex];
  if (anchored) return path.length - last.length >= pos && path.endsWith(last);
  return path.indexOf(last, pos) !== -1;
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
    if (!groupApplies || !value || value.length > MAX_ROBOTS_RULE_LENGTH) continue;
    rules.push(robotsRule(key === "allow", value));
    if (rules.length >= MAX_ROBOTS_RULES) break;
  }
  return rules;
}

/** Longest-match robots.txt check (Allow wins ties). Unreachable robots.txt => allowed. */
export function robotsAllowsPath(rules: RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | undefined;
  for (const r of rules) {
    if (!robotsRuleMatches(r, pathAndQuery)) continue;
    if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

const MAX_REDIRECTS = 3;

/** `fetch` that follows at most 3 redirects itself, re-validating every hop with `assertPublicUrl`. */
export async function fetchPublic(start: string, init: RequestInit = {}): Promise<Response> {
  let target = await assertPublicUrl(start);
  for (let hop = 0; ; hop++) {
    await politeDelay(target);
    const res = await fetch(target, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel();
    if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects for ${start}`);
    target = await assertPublicUrl(new URL(location, target).toString());
  }
}

async function fetchRobots(start: string): Promise<string | undefined> {
  const res = await fetchPublic(start, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    await res.body?.cancel();
    return undefined;
  }
  return readCapped(res, MAX_ROBOTS_BYTES);
}

/** Read at most `maxBytes` of a response body as UTF-8, cancelling the rest. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = value.subarray(0, maxBytes - total);
    text += decoder.decode(take, { stream: true });
    total += take.length;
  }
  await reader.cancel().catch(() => undefined);
  return text + decoder.decode();
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
