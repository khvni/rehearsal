// Shared-secret gate (src/proxy.ts) and the process-wide pipeline concurrency cap (stage route).

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True when `authorization` carries `token` as `Bearer <token>` or as the Basic-auth password (any username). */
export function hasAccess(authorization: string | null, token: string): boolean {
  if (!authorization) return false;
  const [scheme, value = ""] = authorization.trim().split(/\s+/, 2);
  if (/^bearer$/i.test(scheme)) return safeEqual(value, token);
  if (!/^basic$/i.test(scheme)) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  return colon >= 0 && safeEqual(decoded.slice(colon + 1), token);
}

const DEFAULT_MAX_CONCURRENT_RUNS = 2;
const g = globalThis as unknown as { __rehearsalActiveRuns?: number };

export function maxConcurrentRuns(): number {
  const n = Number(process.env.REHEARSAL_MAX_CONCURRENT_RUNS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_CONCURRENT_RUNS;
}

/** Run `work` if a pipeline slot is free; resolves `{ busy: true }` without running it when the cap is reached. */
export async function withRunSlot<T>(work: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  const active = g.__rehearsalActiveRuns ?? 0;
  if (active >= maxConcurrentRuns()) return { busy: true };
  g.__rehearsalActiveRuns = active + 1;
  try {
    return { busy: false, value: await work() };
  } finally {
    g.__rehearsalActiveRuns = (g.__rehearsalActiveRuns ?? 1) - 1;
  }
}
