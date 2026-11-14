/**
 * Fire-and-forget job scheduling. On Workers the work rides `ctx.waitUntil` so it
 * survives the response; elsewhere it runs as a detached promise in this process
 * (the Node dev/server process persists).
 */
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
