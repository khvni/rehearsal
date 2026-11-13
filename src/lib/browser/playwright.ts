import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Assertion, BrowserRun, DomPatch, Viewport } from "../contracts";
import { assertPublicUrl } from "../fetch/guards";
import { compilePatches } from "../variants";
import { measurePage } from "./metrics";
import {
  evaluateAssertion,
  shouldShoot,
  summarizeRun,
  type AssertionProbe,
  type BrowserRunner,
  type OpenPageResult,
  type TrajectoryArgs,
} from "./types";

export const DEFAULT_EVIDENCE_DIR = path.join(process.cwd(), "data", "evidence");
const USER_AGENT = "Rehearsal/0.1 (+https://github.com/khvni/rehearsal)";

export function playwrightProbe(page: Page): AssertionProbe {
  return {
    bodyText: async () => (await page.textContent("body")) ?? "",
    isVisible: (s) => page.locator(s).first().isVisible({ timeout: 3000 }),
    count: (s) => page.locator(s).count(),
    title: () => page.title(),
    url: async () => page.url(),
  };
}

export async function checkAssertion(page: Page, a: Assertion): Promise<boolean> {
  return evaluateAssertion(playwrightProbe(page), a);
}

export interface PlaywrightStepOptions {
  /** Navigation timeout for goto/load waits. */
  navTimeoutMs: number;
  /** Prefer clicking a same-origin link over page.goto (keeps remote sessions on one in-page flow). */
  preferClick: boolean;
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
  const shot0 = path.join(evidenceDir, `${args.runId}_0.png`);
  await page.screenshot({ path: shot0 });
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
      await page.screenshot({ path: shot }).catch(() => undefined);
      screenshots.push(shot);
    }
  }

  for (const assertion of args.assertions) {
    assertions.push({ assertion, passed: await checkAssertion(page, assertion) });
  }
  return { steps, assertions, screenshots };
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
    mkdirSync(evidenceDir, { recursive: true });
  }

  private async getBrowser(): Promise<Browser> {
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
    await assertPublicUrl(url);
    const ctx = await this.newContext(viewport, opts?.patches);
    try {
      const page = await ctx.newPage();
      const screenshotPath = path.join(this.evidenceDir, `${opts?.shotName ?? Date.now()}.png`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      const metrics = await measurePage(page);
      return { html: await page.content(), screenshotPath, metrics };
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
