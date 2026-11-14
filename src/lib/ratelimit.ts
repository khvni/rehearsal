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

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
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
