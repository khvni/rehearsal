import { assertPublicUrl, politeDelay } from "./guards";

export interface PageFetcher {
  /** Fetch fully-rendered or raw HTML for a public URL. */
  fetchHtml(url: string): Promise<string>;
  readonly name: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RehearsalBot/0.1";

/** Plain fetch — the always-available fallback. */
export class PlainFetcher implements PageFetcher {
  readonly name = "plain-fetch";

  async fetchHtml(url: string): Promise<string> {
    const u = await assertPublicUrl(url);
    await politeDelay(u);
    const res = await fetch(u, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
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

export function selectFetcher(): PageFetcher {
  if (process.env.BRIGHTDATA_API_KEY && process.env.BRIGHTDATA_ZONE) {
    try {
      return new BrightDataFetcher();
    } catch {
      // fall through
    }
  }
  return new PlainFetcher();
}
