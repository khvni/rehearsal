import { randomUUID } from "node:crypto";
import type { RunLeaseStore } from "../contracts";
import { selectRunLeaseStore } from "../storage";
import { logEvent } from "../telemetry";

let isolateId: string | undefined;

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

/** True when REHEARSAL_ACCESS_TOKEN is configured and `req` presents it (operator access, past public-demo caps). */
export function presentsAccessToken(req: Request): boolean {
  const token = process.env.REHEARSAL_ACCESS_TOKEN;
  return Boolean(token) && hasAccess(req.headers.get("authorization"), token!);
}

const DEFAULT_MAX_CONCURRENT_RUNS = 8;

export function runSlotTtlMs(): number {
  const configured = Number(process.env.REHEARSAL_RUN_SLOT_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 330_000;
}

export function maxConcurrentRuns(): number {
  const n = Number(process.env.REHEARSAL_MAX_CONCURRENT_RUNS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_CONCURRENT_RUNS;
}

/** Run `work` if a pipeline slot is free; resolves `{ busy: true }` without running it when the cap is reached. */
export async function withRunSlot<T>(work: () => Promise<T>, waitMs = 0, now = Date.now, leases: RunLeaseStore = selectRunLeaseStore()): Promise<{ busy: true } | { busy: false; value: T }> {
  const deadline = now() + waitMs;
  const holder = randomUUID();
  const limit = maxConcurrentRuns();
  while (!await leases.acquireSlot(holder, limit, runSlotTtlMs(), now())) {
    if (now() >= deadline) {
      logEvent({ stage: "admission", kind: "slot-busy", data: { isolateId: isolateId ??= randomUUID(), limit } });
      return { busy: true };
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - now())));
  }
  logEvent({ stage: "admission", kind: "slot-acquired", data: { isolateId: isolateId ??= randomUUID(), limit } });
  try {
    return { busy: false, value: await work() };
  } finally {
    await leases.release(holder).catch(() => undefined);
  }
}

const RUN_QUEUE_RETRY_MS = 5_000;

/**
 * `withRunSlot` for background jobs: instead of resolving busy, retries until a
 * slot frees so an accepted run can outlive its request. The returned promise
 * resolves when `work` finishes — on Workers it goes to `ctx.waitUntil`.
 */
export function enqueueRun(work: () => Promise<void>, retryMs = RUN_QUEUE_RETRY_MS): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const attempt = () => {
      void withRunSlot(async () => {
        try {
          await work();
          resolve();
        } catch (e) {
          reject(e);
        }
      }).then((r) => {
        if (r.busy) setTimeout(attempt, retryMs);
      }).catch(reject);
    };
    attempt();
  });
}
