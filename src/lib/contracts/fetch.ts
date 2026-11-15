import { z } from "zod";
import type { PageFetcher } from "./ports";

/** One step in a Firecrawl scrape `actions[]` list — see https://docs.firecrawl.dev/features/actions. */
export const FirecrawlAction = z.object({
  type: z.enum(["wait", "screenshot", "click", "write", "press", "scroll", "scrape", "executeJavascript", "pdf"]),
  selector: z.string().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  direction: z.enum(["up", "down"]).optional(),
  milliseconds: z.number().int().positive().optional(),
  code: z.string().optional(),
});
export type FirecrawlAction = z.infer<typeof FirecrawlAction>;

/** Interact replays are bounded: each action executes inside one billed scrape call. */
export const FIRECRAWL_MAX_INTERACT_ACTIONS = 10;

/** Normalized slice of a Firecrawl `/v1/scrape` response that Rehearsal consumes. */
export interface FirecrawlScrape {
  /** Rendered page HTML (`rawHtml` format). Absent when the scrape produced no page. */
  html?: string;
  markdown?: string;
  /** Same-render links Firecrawl extracted — used for graph expansion on JS pages. */
  links: string[];
  statusCode?: number;
  sourceUrl?: string;
}

/**
 * Firecrawl client — the hosted fallback for pages a plain fetch can't render.
 * With no `FIRECRAWL_API_KEY` it is `available === false` and every method no-ops
 * (`null` / `[]` / `""`) without throwing, matching the repo's adapter convention.
 */
export interface FirecrawlClient extends PageFetcher {
  readonly available: boolean;
  /** Rendered scrape of `url`; `null` when unavailable. HTTP errors (402/429/…) still throw. */
  scrape(url: string, opts?: { signal?: AbortSignal }): Promise<FirecrawlScrape | null>;
  /** `/v1/map` link expansion for a seed URL — same-origin filtering happens at the call site. `[]` when unavailable. */
  mapLinks(url: string, limit: number, opts?: { signal?: AbortSignal }): Promise<string[]>;
  /** Reserved for verify replays: scrape after replaying up to FIRECRAWL_MAX_INTERACT_ACTIONS steps. `null` when unavailable. */
  interact(url: string, actions: FirecrawlAction[], opts?: { signal?: AbortSignal }): Promise<FirecrawlScrape | null>;
}
