/**
 * D1-backed per-IP daily rate limiting for the public demo.
 * Fails open — a missing DB binding or query error never blocks a request
 * (adapters no-op without keys). D1 writes are atomic unlike KV reads, which
 * cache ~60s at the edge and undercount rapid bursts.
 */

interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
}
interface D1Binding {
  prepare(sql: string): D1Prepared;
}

async function db(): Promise<D1Binding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as { DB?: D1Binding }).DB ?? null;
  } catch {
    return null;
  }
}

/** Rate-limit key for the caller: the client IP, with IPv6 collapsed to its /64 (one subscriber's allocation). */
export function clientIp(req: Request): string {
  const raw = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return raw ? ipBucket(raw) : "anonymous";
}

/** IPv4 as-is (including IPv4-mapped IPv6); any other IPv6 address → its normalized `/64` prefix. */
export function ipBucket(ip: string): string {
  const addr = ip
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "")
    .toLowerCase();
  if (!addr.includes(":")) return addr;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped) return mapped[1];
  // An embedded dotted-quad tail is the low 32 bits — two groups that never reach the /64 prefix.
  const hex = addr.replace(/\d{1,3}(?:\.\d{1,3}){3}$/, "0:0");
  const parts = hex.split("::");
  if (parts.length > 2) return addr;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return addr;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return addr;
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

/** true = within budget; false = over `max` hits today for `key`. */
export async function underDailyLimit(key: string, max: number): Promise<boolean> {
  const d1 = await db();
  if (!d1) return true;
  try {
    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS rate_limits (
           key TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
           PRIMARY KEY (key, day)
         )`,
      )
      .run();
    const row = await d1
      .prepare(
        `INSERT INTO rate_limits (key, day, count) VALUES (?,?,1)
         ON CONFLICT (key, day) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(key, new Date().toISOString().slice(0, 10))
      .first<{ count: number }>();
    return (row?.count ?? 0) <= max;
  } catch {
    return true;
  }
}

/** Public-demo caps on pipeline work against an existing experiment (stage POSTs, rescans). */
export const RUN_PER_IP_PER_DAY = 10;
export const RUN_PER_EXPERIMENT_PER_DAY = 6;

/**
 * Counts one pipeline run for the caller and for experiment `id`; false once
 * either daily budget is spent. A caller over its own budget never consumes
 * the experiment's, so one client can't lock others out of an experiment.
 */
export async function underRunLimit(req: Request, id: string): Promise<boolean> {
  if (!(await underDailyLimit(`exp-run-ip:${clientIp(req)}`, RUN_PER_IP_PER_DAY))) return false;
  return underDailyLimit(`exp-run:${id}`, RUN_PER_EXPERIMENT_PER_DAY);
}
