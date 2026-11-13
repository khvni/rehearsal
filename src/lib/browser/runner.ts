import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Assertion, BrowserRun, DomPatch, Viewport } from "../contracts";
import { assertPublicUrl } from "../fetch/guards";
import { compilePatches } from "../variants";
import { extractPage } from "./extract";

/**
 * Playwright execution — local Chromium by default, Bright Data remote
 * browser over CDP when BRIGHTDATA_BROWSER_WS is set.
 */
export class PlaywrightRunner {
  private browser: Browser | null = null;

  readonly name: string;

  constructor(private evidenceDir = path.join(process.cwd(), "data", "evidence")) {
    this.name = process.env.BRIGHTDATA_BROWSER_WS ? "brightdata-cdp" : "local-chromium";
    mkdirSync(evidenceDir, { recursive: true });
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    const ws = process.env.BRIGHTDATA_BROWSER_WS;
    if (ws) {
      this.browser = await chromium.connectOverCDP(ws);
    } else {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  private async newContext(viewport: Viewport, patches?: DomPatch[]): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      userAgent: "Rehearsal/0.1 (+https://github.com/khvni/rehearsal)",
    });
    if (patches && patches.length > 0) {
      await ctx.addInitScript(compilePatches(patches));
    }
    return ctx;
  }

  /** Load a page and return rendered HTML + screenshot path. */
  async openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string },
  ): Promise<{ html: string; screenshotPath: string; page?: Page; ctx?: BrowserContext }> {
    await assertPublicUrl(url);
    const ctx = await this.newContext(viewport, opts?.patches);
    const page = await ctx.newPage();
    const shotPath = path.join(this.evidenceDir, `${opts?.shotName ?? Date.now()}.png`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: shotPath, fullPage: false });
      const html = await page.content();
      return { html, screenshotPath: shotPath, page, ctx };
    } catch (e) {
      await ctx.close();
      throw e;
    }
  }

  /** Execute an action sequence + assertions; record evidence. */
  async runTrajectory(args: {
    url: string;
    viewport: Viewport;
    actions: { actionId?: string; label: string; href?: string; role?: string }[];
    assertions: Assertion[];
    runId: string;
    patches?: DomPatch[];
    maxSteps?: number;
  }): Promise<BrowserRun> {
    const started = Date.now();
    const steps: BrowserRun["steps"] = [];
    const errors: string[] = [];
    const screenshots: string[] = [];
    const assertionResults: BrowserRun["assertions"] = [];

    let ctx: BrowserContext | undefined;
    try {
      ctx = await this.newContext(args.viewport, args.patches);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
      });

      await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);
      const shot0 = path.join(this.evidenceDir, `${args.runId}_0.png`);
      await page.screenshot({ path: shot0 });
      screenshots.push(shot0);

      const maxSteps = args.maxSteps ?? 12;
      for (let i = 0; i < Math.min(args.actions.length, maxSteps); i++) {
        const a = args.actions[i];
        try {
          if (a.href && a.href.startsWith(new URL(page.url()).origin)) {
            await page.goto(a.href, { waitUntil: "domcontentloaded", timeout: 20000 });
            steps.push({ actionId: a.actionId, label: a.label, ok: true });
          } else {
            const loc = a.role === "button" ? page.getByRole("button", { name: a.label }) : page.getByRole("link", { name: a.label });
            await loc.first().click({ timeout: 8000 });
            await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
            steps.push({ actionId: a.actionId, label: a.label, ok: true });
          }
        } catch (e) {
          steps.push({ actionId: a.actionId, label: a.label, ok: false, error: String(e).slice(0, 160) });
        }
        if (i % 3 === 2 || i === Math.min(args.actions.length, maxSteps) - 1) {
          const shot = path.join(this.evidenceDir, `${args.runId}_${i + 1}.png`);
          await page.screenshot({ path: shot }).catch(() => undefined);
          screenshots.push(shot);
        }
      }

      for (const assertion of args.assertions) {
        assertionResults.push({ assertion, passed: await checkAssertion(page, assertion) });
      }
    } catch (e) {
      errors.push(`run: ${String(e).slice(0, 200)}`);
    } finally {
      await ctx?.close();
    }

    const failedAssertions = assertionResults.filter((a) => !a.passed).length;
    return {
      runId: args.runId,
      viewport: args.viewport,
      success: errors.length === 0 && failedAssertions === 0 && steps.every((s) => s.ok),
      steps,
      assertions: assertionResults,
      errors,
      screenshotPaths: screenshots,
      durationMs: Date.now() - started,
    };
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

export async function checkAssertion(page: Page, a: Assertion): Promise<boolean> {
  try {
    switch (a.kind) {
      case "text-present": {
        const text = (await page.textContent("body")) ?? "";
        return text.toLowerCase().includes(a.value.toLowerCase());
      }
      case "text-absent": {
        const text = (await page.textContent("body")) ?? "";
        return !text.toLowerCase().includes(a.value.toLowerCase());
      }
      case "element-visible":
        return a.selector ? page.locator(a.selector).first().isVisible({ timeout: 3000 }) : false;
      case "element-present":
        return a.selector ? (await page.locator(a.selector).count()) > 0 : false;
      case "title-matches":
        return (await page.title()).toLowerCase().includes(a.value.toLowerCase());
      case "url-matches":
        return page.url().toLowerCase().includes(a.value.toLowerCase());
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export { extractPage };
