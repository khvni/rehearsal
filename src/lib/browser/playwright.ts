import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type {
  Assertion,
  AssertionProbe,
  BrowserRun,
  BrowserRunner,
  DomPatch,
  OpenPageResult,
  PlaywrightStepOptions,
  TrajectoryArgs,
  Viewport,
} from "../contracts";
import { assertPublicUrl, politeDelay, robotsAllows } from "../fetch/guards";
import { compilePatches } from "../variants";
import { measurePage } from "./metrics";
import { evaluateAssertion, shouldShoot, summarizeRun } from "./types";

export const DEFAULT_EVIDENCE_DIR = path.join(process.cwd(), "data", "evidence");
const USER_AGENT = "Rehearsal/0.1 (+https://github.com/khvni/rehearsal)";

/** Reject when a page call outlives `ms` — some sites peg the renderer so content()/title() never resolve. */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms (renderer unresponsive)`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const PAGE_CALL_MS = 15000;

export function playwrightProbe(page: Page): AssertionProbe {
  return {
    bodyText: async () => (await page.textContent("body", { timeout: PAGE_CALL_MS })) ?? "",
    isVisible: (s) => page.locator(s).first().isVisible({ timeout: 3000 }),
    count: (s) => withTimeout(page.locator(s).count(), PAGE_CALL_MS, "count"),
    title: () => withTimeout(page.title(), PAGE_CALL_MS, "title"),
    url: async () => page.url(),
  };
}

export async function checkAssertion(page: Page, a: Assertion): Promise<boolean> {
  return evaluateAssertion(playwrightProbe(page), a);
}

/** Shared Playwright trajectory loop used by the local and Bright Data runners. */
export async function executeTrajectory(
  page: Page,
  args: TrajectoryArgs,
  evidenceDir: string,
  opts: PlaywrightStepOptions,
): Promise<{ steps: BrowserRun["steps"]; assertions: BrowserRun["assertions"]; screenshots: string[] }> {
  const steps: BrowserRun["steps"] = [];
  const screenshots: string[] = [];
  const assertions: BrowserRun["assertions"] = [];

  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: opts.navTimeoutMs });
  await page.waitForTimeout(800);
  await settleInterstitial(page);
  const shot0 = path.join(evidenceDir, `${args.runId}_0.png`);
  await page.screenshot({ path: shot0, timeout: PAGE_CALL_MS });
  screenshots.push(shot0);

  const total = Math.min(args.actions.length, args.maxSteps ?? 12);
  for (let i = 0; i < total; i++) {
    const a = args.actions[i];
    try {
      const sameOrigin = !!a.href && a.href.startsWith(new URL(page.url()).origin);
      const loc = a.role === "button" ? page.getByRole("button", { name: a.label }) : page.getByRole("link", { name: a.label });
      if (sameOrigin && !opts.preferClick) {
        await page.goto(a.href!, { waitUntil: "domcontentloaded", timeout: opts.navTimeoutMs });
      } else {
        try {
          await loc.first().click({ timeout: 8000 });
          await page.waitForLoadState("domcontentloaded", { timeout: opts.navTimeoutMs });
        } catch (e) {
          if (!sameOrigin) throw e;
          await page.goto(a.href!, { waitUntil: "domcontentloaded", timeout: opts.navTimeoutMs });
        }
      }
      steps.push({ actionId: a.actionId, label: a.label, ok: true });
    } catch (e) {
      steps.push({ actionId: a.actionId, label: a.label, ok: false, error: String(e).slice(0, 160) });
    }
    if (shouldShoot(i, total)) {
      const shot = path.join(evidenceDir, `${args.runId}_${i + 1}.png`);
      await page.screenshot({ path: shot, timeout: PAGE_CALL_MS }).catch(() => undefined);
      screenshots.push(shot);
    }
  }

  for (const assertion of args.assertions) {
    assertions.push({ assertion, passed: await checkAssertion(page, assertion) });
  }
  return { steps, assertions, screenshots };
}

const INTERSTITIAL_TITLE_RE = /just a moment|checking your browser|one moment, please|please wait/i;

/** Passive JS interstitials (e.g. "Just a moment...") reload into the real page on their own; give them time. */
export async function settleInterstitial(page: Page, timeoutMs = 15000): Promise<void> {
  if (!INTERSTITIAL_TITLE_RE.test(await withTimeout(page.title(), PAGE_CALL_MS, "title").catch(() => ""))) return;
  await page
    .waitForFunction((src) => !new RegExp(src, "i").test(document.title), INTERSTITIAL_TITLE_RE.source, { timeout: timeoutMs })
    .catch(() => undefined);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1200);
}

export function watchPageErrors(page: Page, errors: string[]): void {
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
  });
}

/** Local headless Chromium — the zero-key fallback for dev, evals and e2e. */
export class PlaywrightRunner implements BrowserRunner {
  readonly name = "local-playwright";
  private browser: Browser | null = null;

  constructor(private evidenceDir = DEFAULT_EVIDENCE_DIR) {
    // Edge runtimes (workerd) ship a read-only fs — evidence dir is best-effort.
    try {
      mkdirSync(evidenceDir, { recursive: true });
    } catch {
      /* evidence writes degrade to no-ops */
    }
  }

  private async getBrowser(): Promise<Browser> {
    // Lazy import: playwright can't load on edge runtimes (e.g. Cloudflare Workers);
    // keeping it out of the module graph lets the rest of the app boot there.
    const { chromium } = await import("playwright");
    this.browser ??= await chromium.launch({ headless: true });
    return this.browser;
  }

  private async newContext(viewport: Viewport, patches?: DomPatch[]): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      userAgent: USER_AGENT,
    });
    if (patches && patches.length > 0) await ctx.addInitScript(compilePatches(patches));
    return ctx;
  }

  async openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string },
  ): Promise<OpenPageResult> {
    const target = await assertPublicUrl(url);
    if (!(await robotsAllows(target))) throw new Error(`robots.txt disallows ${target.pathname}`);
    await politeDelay(target);
    const ctx = await this.newContext(viewport, opts?.patches);
    try {
      const page = await ctx.newPage();
      const screenshotPath = path.join(this.evidenceDir, `${opts?.shotName ?? Date.now()}.png`);
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const contentType = res?.headers()["content-type"] ?? "";
      if (contentType && !/html|xml/i.test(contentType)) throw new Error(`Non-HTML response (${contentType}) for ${url}`);
      const finalOrigin = new URL(page.url()).origin;
      if (finalOrigin !== target.origin) throw new Error(`Redirected off-origin to ${finalOrigin}`);
      await page.waitForTimeout(1200);
      await settleInterstitial(page);
      const html = await withTimeout(page.content(), PAGE_CALL_MS, "page.content");
      await page.screenshot({ path: screenshotPath, fullPage: false, timeout: PAGE_CALL_MS });
      const metrics = await withTimeout(measurePage(page), PAGE_CALL_MS, "measurePage");
      return { html, screenshotPath, metrics };
    } finally {
      await ctx.close();
    }
  }

  async runTrajectory(args: TrajectoryArgs): Promise<BrowserRun> {
    const started = Date.now();
    const errors: string[] = [];
    let result: Awaited<ReturnType<typeof executeTrajectory>> = { steps: [], assertions: [], screenshots: [] };
    let ctx: BrowserContext | undefined;
    try {
      await assertPublicUrl(args.url);
      ctx = await this.newContext(args.viewport, args.patches);
      const page = await ctx.newPage();
      watchPageErrors(page, errors);
      result = await executeTrajectory(page, args, this.evidenceDir, { navTimeoutMs: 30000, preferClick: false });
    } catch (e) {
      errors.push(`run: ${String(e).slice(0, 200)}`);
    } finally {
      await ctx?.close();
    }
    return summarizeRun({ runId: args.runId, viewport: args.viewport, started, errors, ...result });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
