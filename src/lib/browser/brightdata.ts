import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { BrowserRun, DomPatch, Viewport } from "../contracts";
import { assertPublicUrl } from "../fetch/guards";
import { compilePatches } from "../variants";
import { measurePage } from "./metrics";
import { DEFAULT_EVIDENCE_DIR, executeTrajectory, watchPageErrors } from "./playwright";
import { summarizeRun, type BrowserRunner, type EnvVars, type OpenPageResult, type TrajectoryArgs } from "./types";

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
    mkdirSync(evidenceDir, { recursive: true });
  }

  private async withSession<T>(
    viewport: Viewport,
    patches: DomPatch[] | undefined,
    fn: (page: Page) => Promise<T>,
  ): Promise<T> {
    const browser: Browser = await chromium.connectOverCDP(this.endpoint);
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
      await page.waitForTimeout(1200);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const metrics = await measurePage(page);
      return { html: await page.content(), screenshotPath, metrics };
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
      errors.push(`run: ${String(e).slice(0, 200)}`);
    }
    return summarizeRun({ runId: args.runId, viewport: args.viewport, started, errors, ...result });
  }

  async close(): Promise<void> {
    // Sessions are opened and closed per call.
  }
}
