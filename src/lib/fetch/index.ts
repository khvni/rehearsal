import type { PageFetcher } from "../contracts";
import { assertPublicUrl, fetchPublic, politeDelay } from "./guards";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RehearsalBot/0.1";


/** Plain fetch — the always-available fallback. */
export class PlainFetcher implements PageFetcher {
  readonly name = "plain-fetch";

  async fetchHtml(url: string, opts?: { signal?: AbortSignal }): Promise<string> {
    const res = await fetchPublic(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.any([...(opts?.signal ? [opts.signal] : []), AbortSignal.timeout(30000)]),
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    return res.text();
  }
}

/** Browserbase Fetch API (via Stagehand's browserbase.fetch): browserless HTTP fetch with optional proxies. */
export class BrowserbaseFetcher implements PageFetcher {
  readonly name = "browserbase-fetch";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.BROWSERBASE_API_KEY ?? "";
    if (!this.apiKey) throw new Error("BrowserbaseFetcher requires BROWSERBASE_API_KEY");
  }

  async fetchHtml(url: string, opts?: { signal?: AbortSignal }): Promise<string> {
    const u = await assertPublicUrl(url);
    await politeDelay(u);
    const { browserbase } = await import("@browserbasehq/stagehand");
    const work = browserbase.fetch({ url: u.toString(), apiKey: this.apiKey, format: "raw", proxies: true });
    // The SDK call can't be aborted in flight — the signal bounds the wait.
    const res = opts?.signal
      ? await Promise.race([
          work,
          new Promise<never>((_, reject) => {
            const s = opts.signal!;
            if (s.aborted) reject(s.reason);
            else s.addEventListener("abort", () => reject(s.reason), { once: true });
          }),
        ])
      : await work;
    if (res.statusCode >= 400) throw new Error(`Browserbase fetch failed: ${res.statusCode}`);
    return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  }
}

/** Priority: Browserbase Fetch (Node hosts only: Stagehand cannot load on workerd) → plain fetch. */
export function selectFetcher(): PageFetcher {
  const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (process.env.BROWSERBASE_API_KEY && !onWorkers) return new BrowserbaseFetcher();
  return new PlainFetcher();
}
