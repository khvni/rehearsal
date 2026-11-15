import {
  FIRECRAWL_MAX_INTERACT_ACTIONS,
  type EnvVars,
  type FirecrawlAction,
  type FirecrawlClient as FirecrawlClientPort,
  type FirecrawlScrape,
} from "../contracts";
import { assertPublicUrl, politeDelay } from "./guards";

const API_BASE = "https://api.firecrawl.dev/v1";
/** Cap on a single hosted call; the runner's stage timeout still bounds the whole stage. */
const REQUEST_TIMEOUT_MS = 30_000;
const INTERACT_TIMEOUT_MS = 45_000;

// ── JS-shell heuristic ──────────────────────────────────────────────────────

const JS_REQUIRED_RE = /enable javascript|javascript is required|javascript is disabled|requires javascript|needs javascript to (?:run|work|load)/i;
/** A noscript open or close marker. The open side is only `<noscript\b` — no attribute run —
 *  because a stripped block is removed through its closer's end; the opener's `>` is never used.
 *  The close side prefers the full `</noscript…>` tag (attributes ignored per HTML spec, bounded
 *  at 64 chars) and falls back to the bare `</noscript` prefix, which still closes the block —
 *  any over-long attribute tail just re-emits as text. Scanning unbounded attributes (`[^>]*`)
 *  would rescan the tail once per unterminated prefix and stall the event loop on
 *  attacker-controlled HTML. */
const NOSCRIPT_TAG_RE = /<noscript\b|<\/noscript\b[^>]{0,64}>|<\/noscript\b/gi;

/**
 * Remove `<noscript>…</noscript>` blocks in one pass — their warnings persist in fully rendered
 * HTML (framework boilerplate) and must not count toward the JS-shell signals. Tag positions are
 * found on the original string (no lowercased copy, whose length can shift around characters like
 * `İ` and corrupt slices). An unclosed trailing block is kept verbatim.
 */
export function stripNoscript(html: string): string {
  const tags = html.matchAll(NOSCRIPT_TAG_RE);
  let out = "";
  let cursor = 0;
  for (let m = tags.next(); !m.done; m = tags.next()) {
    const tag = m.value;
    if (tag[0].startsWith("</")) continue; // stray closer stays
    out += html.slice(cursor, tag.index);
    let close = tags.next();
    while (!close.done && !close.value[0].startsWith("</")) close = tags.next(); // nested openers are inside the removed block
    if (close.done) {
      out += tag[0]; // unclosed `<noscript` prefix kept verbatim — the tail slice re-emits the rest
      cursor = tag.index + tag[0].length;
      break;
    }
    cursor = close.value.index + close.value[0].length;
  }
  return out + html.slice(cursor);
}
/** Empty framework mount root: `<div id="root"></div>`, `__next`, `__nuxt`, `__svelte`, `___gatsby`, `app`, `ember-view`. */
const EMPTY_APP_ROOT_RE = /<div id="(?:root|app|__next|__nuxt|__svelte|___gatsby|ember-view)"[^>]*>\s*<\/div>/i;
const SCRIPT_TAG_RE = /<script\b/gi;

/**
 * Cheap "this page needs a renderer" judge over the extraction a plain fetch produced.
 * Fires on several weak signals — never on action count alone, so legitimately thin
 * pages (a stub, an empty list view) still map instead of spending a Firecrawl credit.
 */
export function looksLikeJsShell(html: string, extracted: { visibleText: string; actions: unknown[] }): boolean {
  const body = stripNoscript(html);
  const scripts = (body.match(SCRIPT_TAG_RE) ?? []).length;
  const actions = extracted.actions.length;
  const text = extracted.visibleText.trim().length;
  if (JS_REQUIRED_RE.test(body)) return true;
  if (EMPTY_APP_ROOT_RE.test(html) && scripts >= 1 && actions <= 4) return true;
  if (actions === 0 && text < 400 && scripts >= 1) return true;
  if (actions <= 2 && text < 600 && scripts >= 8) return true; // script-dominated thin page
  return false;
}

// ── Client ──────────────────────────────────────────────────────────────────

type FetchImpl = typeof fetch;

/**
 * Firecrawl REST adapter (https://docs.firecrawl.dev/api-reference):
 *   POST /v1/scrape — rendered page fetch (formats: rawHtml + links)
 *   POST /v1/map    — seed-URL link expansion
 *   interact()      — /v1/scrape with a bounded `actions` list; reserved for verify replays
 * Bearer auth via FIRECRAWL_API_KEY. Without the key the client is `available === false`
 * and every method returns null/[]/"" — it never throws on a missing key.
 */
export class FirecrawlClient implements FirecrawlClientPort {
  readonly name = "firecrawl";
  private readonly apiKey: string;
  private readonly fetchImpl: FetchImpl;

  constructor(env: EnvVars = process.env, fetchImpl: FetchImpl = fetch) {
    this.apiKey = (env.FIRECRAWL_API_KEY ?? "").trim();
    this.fetchImpl = fetchImpl;
  }

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  /** PageFetcher port — scrape and hand back the rendered html. `""` (no-op) without a key. */
  async fetchHtml(url: string, opts?: { signal?: AbortSignal }): Promise<string> {
    if (!this.available) return "";
    const scraped = await this.scrape(url, opts);
    if (!scraped?.html) throw new Error(`Firecrawl scrape returned no HTML for ${url}`);
    return scraped.html;
  }

  async scrape(url: string, opts?: { signal?: AbortSignal }): Promise<FirecrawlScrape | null> {
    if (!this.available) return null;
    const u = await assertPublicUrl(url); // every outbound call is egress-guarded
    await politeDelay(u);
    const json = await this.call(
      "/scrape",
      { url: u.toString(), formats: ["rawHtml", "links"], timeout: REQUEST_TIMEOUT_MS - 5_000 },
      opts,
    );
    return this.toScrape(json?.data as Record<string, unknown> | undefined);
  }

  async mapLinks(url: string, limit: number, opts?: { signal?: AbortSignal }): Promise<string[]> {
    if (!this.available) return [];
    const u = await assertPublicUrl(url);
    await politeDelay(u);
    const json = await this.call(
      "/map",
      {
        url: u.toString(),
        limit: Math.max(1, Math.floor(limit)),
        ignoreSitemap: false, // sitemap-first is the cheap path; Firecrawl still crawls when it's absent
        includeSubdomains: false,
        timeout: REQUEST_TIMEOUT_MS - 5_000,
      },
      opts,
    );
    const links = json?.links;
    return Array.isArray(links) ? links.filter((l): l is string => typeof l === "string") : [];
  }

  async interact(url: string, actions: FirecrawlAction[], opts?: { signal?: AbortSignal }): Promise<FirecrawlScrape | null> {
    if (!this.available) return null;
    const u = await assertPublicUrl(url);
    await politeDelay(u);
    const json = await this.call(
      "/scrape",
      {
        url: u.toString(),
        formats: ["rawHtml"],
        timeout: INTERACT_TIMEOUT_MS - 5_000,
        actions: actions.slice(0, FIRECRAWL_MAX_INTERACT_ACTIONS),
      },
      opts,
    );
    return this.toScrape(json?.data as Record<string, unknown> | undefined);
  }

  private toScrape(data: Record<string, unknown> | undefined): FirecrawlScrape {
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    return {
      html: (data?.rawHtml ?? data?.html) as string | undefined,
      markdown: data?.markdown as string | undefined,
      links: Array.isArray(data?.links) ? (data.links as unknown[]).filter((l): l is string => typeof l === "string") : [],
      statusCode: typeof meta.statusCode === "number" ? meta.statusCode : undefined,
      sourceUrl: typeof meta.sourceURL === "string" ? meta.sourceURL : undefined,
    };
  }

  private async call(path: string, body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.any([...(opts?.signal ? [opts.signal] : []), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const label = res.status === 402 ? " Payment Required" : res.status === 429 ? " Too Many Requests" : "";
      throw new Error(`Firecrawl ${path} failed ${res.status}${label}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    if (json.success === false) {
      throw new Error(`Firecrawl ${path} failed: ${String(json.error ?? json.warning ?? "unknown error").slice(0, 200)}`);
    }
    return json;
  }
}
