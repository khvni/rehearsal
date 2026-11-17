/**
 * Fire-and-forget job scheduling. On Workers the work rides `ctx.waitUntil` so it
 * survives the response — but only for a bounded window (empirically ~30s), so
 * long pipeline runs self-continue via `POST /api/internal/run-step` hops, each
 * of which gets its own window. Elsewhere work runs as a detached promise in
 * this process (the Node dev/server process persists) and steps loop in-process.
 */
import { assertPublicUrl, selfService } from "./fetch/guards";

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
  if (!isWorkersRuntime()) return;
  try {
    // REHEARSAL_ORIGIN pins the hop to the canonical deployment origin — a
    // request arriving through an alias still continues there. Otherwise the
    // hop targets the run's stored creation origin, so a spoofed Host on a
    // resume/GET can't carry the per-run token elsewhere. Loopback self-hops
    // skip the SSRF guard — it refuses private addresses like a local workerd
    // dev server; a Host-spoofed loopback only reaches a worker when the
    // request already routed to it.
    const hopOrigin = process.env.REHEARSAL_ORIGIN ?? opts.origin;
    if (!hopOrigin) return;
    const target = `${hopOrigin}/api/internal/run-step`;
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, token: opts.token }),
    };
    // A Worker's fetch() to its own Custom Domain never reaches it, so the hop
    // goes through the self service binding when deployed; that always lands
    // on this Worker whatever the URL host, so the SSRF guard doesn't apply.
    const self = await selfService();
    if (self) {
      await self.fetch(target, init);
      return;
    }
    const parsed = new URL(target);
    const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
    if (!loopback) await assertPublicUrl(target);
    await fetch(target, init);
  } catch {
    /* the watchdog resume path covers a lost hop */
  }
}


