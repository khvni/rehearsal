/**
 * Browser backends for bench sites.
 *
 * `FixtureSiteRunner` resolves pages from the manifest's page map — no real
 * browser, fully deterministic; trajectory verification walks the actions'
 * hrefs and evaluates assertions on the final page's extracted content.
 * `HermeticSiteRunner` runs local Chromium against the loopback fixture
 * server and aborts every request leaving the fixture origin.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  AssertionProbe,
  BrowserRunner,
  BrowserRun,
  DomPatch,
  OpenPageResult,
  TrajectoryArgs,
  Viewport,
} from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import { evaluateAssertion, summarizeRun } from "@/lib/browser/types";
import { compilePatches } from "@/lib/variants";
import { assertPublicUrl } from "@/lib/fetch/guards";
import { pageFor, type FixtureSite } from "./sites";

/** AssertionProbe over a fixture page's extracted content. Selectors support tag, #id and .class. */
function fixtureProbe(html: string, url: string): AssertionProbe {
  const extracted = extractPage(html, url);
  const count = (selector: string): number => {
    const s = selector.trim();
    const m = s.match(/^([a-z][a-z0-9]*)?(#[\w-]+|\.[\w-]+)?$/i);
    if (!m || !s) return 0;
    const [, tag, qualifier] = m;
    let re: RegExp;
    if (qualifier?.startsWith("#")) re = new RegExp(`<${tag ?? "[a-z]+"}[^>]*\\bid=["']${qualifier.slice(1)}["']`, "i");
    else if (qualifier?.startsWith(".")) re = new RegExp(`<${tag ?? "[a-z]+"}[^>]*\\bclass=["'][^"']*\\b${qualifier.slice(1)}\\b`, "i");
    else if (tag) re = new RegExp(`<${tag}[\\s>/]`, "i");
    else return 0;
    return (html.match(new RegExp(re.source, "gi")) ?? []).length;
  };
  return {
    bodyText: async () => extracted.visibleText,
    isVisible: async (selector) => count(selector) > 0,
    count: async (selector) => count(selector),
    title: async () => extracted.title,
    url: async () => url,
  };
}

export class FixtureSiteRunner implements BrowserRunner {
  readonly name = "fixture-site";

  constructor(private site: FixtureSite) {}

  async openPage(url: string, viewport: Viewport): Promise<OpenPageResult> {
    void viewport;
    await assertPublicUrl(url);
    const html = pageFor(this.site, new URL(url).pathname);
    if (html === null) throw new Error(`no fixture page for ${url}`);
    return { html };
  }

  /**
   * Replays the simulated trajectory against the page map: each action's href
   * is followed to its page; assertions evaluate on the final page reached.
   * A step fails when its destination is unmapped — same observable behavior
   * as a dead link in a real browser run.
   */
  async runTrajectory(a: TrajectoryArgs): Promise<BrowserRun> {
    const started = Date.now();
    await assertPublicUrl(a.url);
    const errors: string[] = [];
    const steps: BrowserRun["steps"] = [];
    let current = a.url;
    for (const action of a.actions.slice(0, a.maxSteps ?? 64)) {
      const href = action.href;
      if (!href) {
        steps.push({ actionId: action.actionId, label: action.label, ok: true });
        continue;
      }
      const html = pageFor(this.site, new URL(href).pathname);
      if (html === null) {
        steps.push({
          actionId: action.actionId,
          label: action.label,
          ok: false,
          error: `unmapped destination ${href}`,
        });
        errors.push(`step "${action.label}" -> ${href}: no fixture page`);
        break;
      }
      steps.push({ actionId: action.actionId, label: action.label, ok: true });
      current = href;
    }
    const finalHtml = pageFor(this.site, new URL(current).pathname) ?? "";
    const probe = fixtureProbe(finalHtml, current);
    const assertions: BrowserRun["assertions"] = [];
    for (const assertion of a.assertions) {
      assertions.push({ assertion, passed: await evaluateAssertion(probe, assertion) });
    }
    return summarizeRun({ runId: a.runId, viewport: a.viewport, started, steps, assertions, errors, screenshots: [] });
  }

  async close(): Promise<void> {}
}

/**
 * spec-delta's HermeticRunner, generalized over fixture sites: local Chromium,
 * every non-origin request aborted, networkidle so layout metrics settle.
 */
export class HermeticSiteRunner implements BrowserRunner {
  readonly name = "hermetic-chromium";
  private browser: import("playwright").Browser | null = null;

  constructor(
    private site: FixtureSite,
    private origin: string,
    private evidenceDir: string,
  ) {
    mkdirSync(evidenceDir, { recursive: true });
  }

  private async context(viewport: Viewport, patches?: DomPatch[]) {
    const { chromium } = await import("playwright");
    this.browser ??= await chromium.launch({ headless: true });
    const ctx = await this.browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    await ctx.route("**/*", (route) =>
      new URL(route.request().url()).origin === this.origin ? route.continue() : route.abort(),
    );
    if (patches?.length) await ctx.addInitScript(compilePatches(patches));
    return ctx;
  }

  async openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string },
  ): Promise<OpenPageResult> {
    await assertPublicUrl(url);
    const ctx = await this.context(viewport, opts?.patches);
    try {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      const screenshotPath = path.join(this.evidenceDir, `${opts?.shotName ?? "page"}.png`);
      await page.screenshot({ path: screenshotPath });
      const { measurePage } = await import("@/lib/browser/metrics");
      return { html: await page.content(), screenshotPath, metrics: await measurePage(page) };
    } finally {
      await ctx.close();
    }
  }

  async runTrajectory(a: TrajectoryArgs) {
    const started = Date.now();
    const errors: string[] = [];
    await assertPublicUrl(a.url);
    const ctx = await this.context(a.viewport, a.patches);
    try {
      const { executeTrajectory, watchPageErrors } = await import("@/lib/browser/playwright");
      const page = await ctx.newPage();
      watchPageErrors(page, errors);
      const result = await executeTrajectory(page, a, this.evidenceDir, {
        navTimeoutMs: 30000,
        preferClick: false,
      });
      // Aborted third-party requests surface as console errors — a hermeticity artifact.
      const kept = errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/i.test(e));
      return summarizeRun({ runId: a.runId, viewport: a.viewport, started, errors: kept, ...result });
    } catch (e) {
      errors.push(`run: ${String(e).slice(0, 200)}`);
      return summarizeRun({
        runId: a.runId,
        viewport: a.viewport,
        started,
        steps: [],
        assertions: [],
        errors,
        screenshots: [],
      });
    } finally {
      await ctx.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
