/**
 * Fire-and-forget job scheduling. On Workers the work rides `ctx.waitUntil` so it
 * survives the response — but only for a bounded window (empirically ~30s), so
 * long pipeline runs self-continue via `POST /api/internal/run-step` hops, each
 * of which gets its own window. Elsewhere work runs as a detached promise in
 * this process (the Node dev/server process persists) and steps loop in-process.
 */
import { assertPublicUrl } from "./fetch/guards";

export async function runInBackground(work: () => Promise<void>): Promise<void> {
  // navigator.userAgent is the cheapest Workers check — no import cost off-Workers.
  if (navigator.userAgent !== "Cloudflare-Workers") {
    void work();
    return;
  }
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(work());
      return;
    }
  } catch {
    /* context unavailable — fall through to detached */
  }
  void work();
}

export function isWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * Kick the next pipeline slice on Workers. The hop lands as a fresh request with
 * its own waitUntil window; a dropped hop is covered by the stall watchdog
 * (resume() / the experiment page's poll). Non-Workers run steps in-process —
 * nothing to do.
 */
export async function continueRun(id: string, opts: { origin?: string; token?: string }): Promise<void> {
  if (!isWorkersRuntime() || !opts.origin) return;
  try {
    const target = `${opts.origin}/api/internal/run-step`;
    const parsed = new URL(target);
    const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
    // Pin the hop to REHEARSAL_ORIGIN when configured: a request whose Host was
    // spoofed can't carry the per-run token to a foreign origin. Loopback
    // self-hops skip the SSRF guard — a request that reached this origin is
    // already trusted, and the guard refuses private addresses like a local
    // workerd dev server.
    const pinned = process.env.REHEARSAL_ORIGIN;
    if (pinned && parsed.origin !== pinned) return;
    if (!loopback) await assertPublicUrl(target);
    await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, token: opts.token }),
    });
  } catch {
    /* the watchdog resume path covers a lost hop */
  }
}
