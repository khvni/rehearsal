import type { PageFetcher } from "../contracts";
import { assertPublicUrl, fetchPublic, politeDelay } from "./guards";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RehearsalBot/0.1";

/** Plain fetch — the always-available fallback. */
export class PlainFetcher implements PageFetcher {
  readonly name = "plain-fetch";

  async fetchHtml(url: string): Promise<string> {
    await politeDelay(await assertPublicUrl(url));
    const res = await fetchPublic(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    return res.text();
  }
}

/**
 * Bright Data scraping fetch (Web Unlocker-style zone request).
 * Active only when BRIGHTDATA_API_KEY + BRIGHTDATA_ZONE are set.
 */
export class BrightDataFetcher implements PageFetcher {
  readonly name = "brightdata";
  private apiKey: string;
  private zone: string;

  constructor() {
    this.apiKey = process.env.BRIGHTDATA_API_KEY ?? "";
    this.zone = process.env.BRIGHTDATA_ZONE ?? "";
    if (!this.apiKey || !this.zone) {
      throw new Error("BrightDataFetcher requires BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE");
    }
  }

  async fetchHtml(url: string): Promise<string> {
    const u = await assertPublicUrl(url);
    await politeDelay(u);
    const res = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ zone: this.zone, url: u.toString(), format: "raw" }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Bright Data request failed: ${res.status}`);
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

  async fetchHtml(url: string): Promise<string> {
    const u = await assertPublicUrl(url);
    await politeDelay(u);
    const { browserbase } = await import("@browserbasehq/stagehand");
    const res = await browserbase.fetch({ url: u.toString(), apiKey: this.apiKey, format: "raw", proxies: true });
    if (res.statusCode >= 400) throw new Error(`Browserbase fetch failed: ${res.statusCode}`);
    return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  }
}

/** Priority: Bright Data Web Unlocker → Browserbase Fetch → plain fetch. */
export function selectFetcher(): PageFetcher {
  if (process.env.BRIGHTDATA_API_KEY && process.env.BRIGHTDATA_ZONE) {
    try {
      return new BrightDataFetcher();
    } catch {
      // fall through
    }
  }
  if (process.env.BROWSERBASE_API_KEY) return new BrowserbaseFetcher();
  return new PlainFetcher();
}
