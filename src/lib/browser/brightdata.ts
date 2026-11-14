import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "playwright";
import type { BrowserRun, BrowserRunner, DomPatch, EnvVars, OpenPageResult, TrajectoryArgs, Viewport } from "../contracts";
import { assertPublicUrl } from "../fetch/guards";
import { compilePatches } from "../variants";
import { measurePage } from "./metrics";
import { captureBrand } from "../rebuild/brand";
import { DEFAULT_EVIDENCE_DIR, assertPublicPage, executeTrajectory, watchPageErrors } from "./playwright";
import { errorText, summarizeRun } from "./types";

const BRIGHTDATA_HOST = "brd.superproxy.io:9222";
/** Bright Data recommends a 2-minute navigation timeout for sites that need unlocking. */
const BRIGHTDATA_NAV_TIMEOUT_MS = 120_000;

/**
 * Resolve the Browser API CDP endpoint: BRIGHTDATA_BROWSER_WS (full wss URL) or
 * BRIGHTDATA_BROWSER_USER + BRIGHTDATA_BROWSER_PASSWORD (zone credentials).
 */
export function brightDataBrowserEndpoint(env: EnvVars = process.env): string | null {
  if (env.BRIGHTDATA_BROWSER_WS) return env.BRIGHTDATA_BROWSER_WS;
  const user = env.BRIGHTDATA_BROWSER_USER;
  const pass = env.BRIGHTDATA_BROWSER_PASSWORD;
  if (user && pass) return `wss://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${BRIGHTDATA_HOST}`;
  return null;
}

/**
 * Move `user:pass@` out of the CDP URL into a Basic Authorization header, so the
 * credentials never appear in Playwright's connection errors. Same bytes the ws
 * client would send for URL userinfo (it uses the still-percent-encoded parts).
 */
export function cdpConnectOptions(endpoint: string): { wsEndpoint: string; headers: Record<string, string> } {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { wsEndpoint: endpoint, headers: {} };
  }
  if (!url.username && !url.password) return { wsEndpoint: endpoint, headers: {} };
  const auth = btoa(`${url.username}:${url.password}`);
  url.username = "";
  url.password = "";
  return { wsEndpoint: url.toString(), headers: { Authorization: `Basic ${auth}` } };
}

/**
 * Bright Data Browser API (Scraping Browser) over CDP.
 *
 * Session rules: a session is pinned to one domain (navigate_domains_limit), closes
 * after 5 min idle and has a hard max length. To stay well inside them every
 * captured state gets its own fresh session with exactly one initial navigation,
 * and each trajectory gets one session that starts with one navigation and then
 * moves by clicking (same-origin goto only as a fallback).
 */
export class BrightDataBrowserRunner implements BrowserRunner {
  readonly name = "brightdata-browser-api";

  constructor(
    private endpoint: string,
    private evidenceDir = DEFAULT_EVIDENCE_DIR,
  ) {
    // Edge runtimes (workerd) ship a read-only fs — evidence dir is best-effort.
    try {
      mkdirSync(evidenceDir, { recursive: true });
    } catch {
      /* evidence writes degrade to no-ops */
    }
  }

  private async withSession<T>(
    viewport: Viewport,
    patches: DomPatch[] | undefined,
    fn: (page: Page) => Promise<T>,
  ): Promise<T> {
    // Lazy import so playwright stays out of the module graph on edge runtimes.
    const { chromium } = await import("playwright");
    const { wsEndpoint, headers } = cdpConnectOptions(this.endpoint);
    const browser: Browser = await chromium.connectOverCDP(wsEndpoint, { headers });
    try {
      const ctx = browser.contexts()[0] ?? (await browser.newContext());
      const page = await ctx.newPage();
      page.setDefaultNavigationTimeout(BRIGHTDATA_NAV_TIMEOUT_MS);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (patches && patches.length > 0) await page.addInitScript(compilePatches(patches));
      return await fn(page);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  async openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string },
  ): Promise<OpenPageResult> {
    await assertPublicUrl(url);
    return this.withSession(viewport, opts?.patches, async (page) => {
      const screenshotPath = path.join(this.evidenceDir, `${opts?.shotName ?? Date.now()}.png`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: BRIGHTDATA_NAV_TIMEOUT_MS });
      // Redirect hops aren't re-checked by goto — reject a page that landed non-public.
      await assertPublicPage(page);
      await page.waitForTimeout(1200);
      const shotOk = await page.screenshot({ path: screenshotPath, fullPage: false }).then(() => true).catch(() => false);
      const metrics = await measurePage(page);
      const brand = await captureBrand(page).catch(() => undefined);
      return { html: await page.content(), screenshotPath: shotOk ? screenshotPath : undefined, metrics, brand };
    });
  }

  async runTrajectory(args: TrajectoryArgs): Promise<BrowserRun> {
    const started = Date.now();
    const errors: string[] = [];
    let result: Awaited<ReturnType<typeof executeTrajectory>> = { steps: [], assertions: [], screenshots: [] };
    try {
      await assertPublicUrl(args.url);
      result = await this.withSession(args.viewport, args.patches, async (page) => {
        watchPageErrors(page, errors);
        return executeTrajectory(page, args, this.evidenceDir, {
          navTimeoutMs: BRIGHTDATA_NAV_TIMEOUT_MS,
          preferClick: true,
        });
      });
    } catch (e) {
      errors.push(`run: ${errorText(e)}`);
    }
    return summarizeRun({ runId: args.runId, viewport: args.viewport, started, errors, ...result });
  }

  async close(): Promise<void> {
    // Sessions are opened and closed per call.
  }
}
