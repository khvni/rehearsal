import {
  FIRECRAWL_MAX_INTERACT_ACTIONS,
  type EnvVars,
  type FirecrawlAction,
  type FirecrawlClient as FirecrawlClientPort,
  type FirecrawlScrape,
} from "../contracts";
import { isQuotaStatus, reportProviderQuota } from "../telemetry";
import { assertPublicUrl, politeDelay } from "./guards";

const API_BASE = "https://api.firecrawl.dev/v1";
/** Cap on a single hosted call; the runner's stage timeout still bounds the whole stage. */
const REQUEST_TIMEOUT_MS = 30_000;
const INTERACT_TIMEOUT_MS = 45_000;
/** Minimum spacing between calls to api.firecrawl.dev: Firecrawl bills and rate-limits
 *  per minute, so a crawl that rescues several JS-shell pages in a row otherwise bursts
 *  into 429s. Distinct from politeDelay, which paces the *target* host. */
const API_MIN_INTERVAL_MS = 5_000;
/** 429 handling: retry honoring Retry-After (else exponential backoff), then mark the
 *  account quota-exhausted so later calls fall back without spending another retry cycle. */
const QUOTA_MAX_RETRIES = 2;
const QUOTA_BACKOFF_BASE_MS = 10_000;
const QUOTA_BACKOFF_MAX_MS = 45_000;
/** Total backoff a call may spend retrying 429s. Kept under a run step's ~20s slice so a
 *  Worker run still checkpoints between pages; a Retry-After past this exhausts instead. */
const QUOTA_RETRY_BUDGET_MS = 20_000;
/** Quota windows are per-minute: exhaustion lifts after this long so a later run can
 *  use hosted fallback again once Firecrawl resets the budget. */
const QUOTA_COOLDOWN_MS = 60_000;

// Quota and pacing apply to the API key (the account), not a client instance — module-level
// so parallel crawls on this isolate share both instead of bursting together.
let apiSlotAt = 0;
let quotaExhaustedUntil = 0;
const quotaExhausted = () => Date.now() < quotaExhaustedUntil;

/** Test hook: forget the shared pacing slot and quota cooldown. */
export function resetFirecrawlRateLimit(): void {
  apiSlotAt = 0;
  quotaExhaustedUntil = 0;
}

/** Positive-int env override with a floor of 0 and a sane default (tests shrink the waits). */
function intEnv(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** `Retry-After` in seconds or HTTP-date form; undefined when absent/unparseable. */
function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after")?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Math.min(Number(raw) * 1000, QUOTA_BACKOFF_MAX_MS);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.min(Math.max(0, at - Date.now()), QUOTA_BACKOFF_MAX_MS);
}

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
  private readonly quotaRetries: number;
  private readonly quotaBackoffBaseMs: number;
  private readonly apiMinIntervalMs: number;

  constructor(env: EnvVars = process.env, fetchImpl: FetchImpl = fetch) {
    this.apiKey = (env.FIRECRAWL_API_KEY ?? "").trim();
    this.fetchImpl = fetchImpl;
    this.quotaRetries = intEnv(env.FIRECRAWL_429_RETRIES, QUOTA_MAX_RETRIES);
    this.quotaBackoffBaseMs = intEnv(env.FIRECRAWL_429_BACKOFF_MS, QUOTA_BACKOFF_BASE_MS);
    this.apiMinIntervalMs = intEnv(env.FIRECRAWL_MIN_INTERVAL_MS, API_MIN_INTERVAL_MS);
  }

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  /** PageFetcher port — scrape and hand back the rendered html. `""` (no-op) without a key. */
  async fetchHtml(url: string, opts?: { signal?: AbortSignal }): Promise<string> {
    if (!this.available || quotaExhausted()) return "";
    const scraped = await this.scrape(url, opts);
    if (!scraped?.html) throw new Error(`Firecrawl scrape returned no HTML for ${url}`);
    return scraped.html;
  }

  async scrape(url: string, opts?: { signal?: AbortSignal }): Promise<FirecrawlScrape | null> {
    if (!this.available || quotaExhausted()) return null;
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
    if (!this.available || quotaExhausted()) return [];
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
    if (!this.available || quotaExhausted()) return null;
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

  /** Serialize calls to api.firecrawl.dev at ~1 per apiMinIntervalMs — the per-minute
   *  quota trips on bursts, not on the target host's politeness spacing. */
  private async paceApi(): Promise<void> {
    if (process.env.REHEARSAL_ALLOW_PRIVATE === "1") return; // hermetic tests
    const now = Date.now();
    const slot = Math.max(now, apiSlotAt);
    apiSlotAt = slot + this.apiMinIntervalMs;
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  }

  private sleep(ms: number): Promise<void> {
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  }

  private async call(path: string, body: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<Record<string, unknown>> {
    if (quotaExhausted()) return {}; // callers treat "no data" as the clean fallback
    let waitedMs = 0;
    for (let attempt = 0; ; attempt++) {
      await this.paceApi();
      const res = await this.fetchImpl(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.any([...(opts?.signal ? [opts.signal] : []), AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (isQuotaStatus(res.status)) await reportProviderQuota("firecrawl", res.status, path);
        if (res.status === 429 && attempt < this.quotaRetries) {
          const waitMs = retryAfterMs(res) ?? Math.min(this.quotaBackoffBaseMs * 2 ** attempt, QUOTA_BACKOFF_MAX_MS);
          if (waitedMs + waitMs <= QUOTA_RETRY_BUDGET_MS) {
            waitedMs += waitMs;
            await this.sleep(waitMs);
            continue;
          }
          // The wait would outlive the run slice — exhaust instead of stalling the crawl.
        }
        if (isQuotaStatus(res.status)) quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
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
}
