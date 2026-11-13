import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModelConfig, Page, Stagehand, StagehandBrowser } from "@browserbasehq/stagehand";
import type { BrowserRun, DomPatch, Viewport } from "../contracts";
import { assertPublicUrl } from "../fetch/guards";
import { compilePatches } from "../variants";
import { DEFAULT_EVIDENCE_DIR } from "./playwright";
import {
  evaluateAssertion,
  shouldShoot,
  summarizeRun,
  type AssertionProbe,
  type BrowserRunner,
  type EnvVars,
  type OpenPageResult,
  type TrajectoryAction,
  type TrajectoryArgs,
} from "./types";

export type StagehandEnv = "browserbase" | "local";

export interface StagehandRunnerOptions {
  env: StagehandEnv;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  /** Local Chrome/Chromium binary for env=local (Stagehand does not bundle a browser). */
  executablePath?: string;
  model?: ModelConfig;
  evidenceDir?: string;
}

const NAV_TIMEOUT_MS = 60_000;

/**
 * Stagehand model config. Stagehand does not read env vars, so we resolve them here:
 * STAGEHAND_MODEL (+ STAGEHAND_MODEL_API_KEY) wins; otherwise our GEMINI_API_KEY is
 * reused with the Gemini fast model; otherwise undefined, which on Browserbase means
 * the Browserbase Model Gateway picks a model.
 */
export function stagehandModelFromEnv(env: EnvVars = process.env): ModelConfig | undefined {
  const name = env.STAGEHAND_MODEL;
  if (name && /^(openai|anthropic|google|groq|cerebras)\//.test(name)) {
    const apiKey = env.STAGEHAND_MODEL_API_KEY || (name.startsWith("google/") ? env.GEMINI_API_KEY : undefined);
    return { modelName: name as ModelConfig["modelName"], ...(apiKey ? { apiKey } : {}) };
  }
  if (env.GEMINI_API_KEY) {
    return { modelName: `google/${env.GEMINI_MODEL_FAST ?? "gemini-4-hydrogen"}`, apiKey: env.GEMINI_API_KEY };
  }
  return undefined;
}

function xpathLiteral(s: string): string {
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  return `concat(${s
    .split('"')
    .map((part) => `"${part}"`)
    .join(`, '"', `)})`;
}

function stableSelector(a: TrajectoryAction): string {
  const text = xpathLiteral(a.label.trim());
  const match = `normalize-space(.)=${text} or @aria-label=${text}`;
  return a.role === "button"
    ? `xpath=//*[self::button or @role="button" or self::input[@type="submit" or @type="button"]][${match} or @value=${text}]`
    : `xpath=//*[self::a or @role="link"][${match}]`;
}

function stagehandProbe(page: Page): AssertionProbe {
  return {
    bodyText: () => page.evaluate<string>("document.body ? document.body.textContent || '' : ''"),
    isVisible: (s) => page.locator(s).first().isVisible(),
    count: (s) => page.locator(s).count(),
    title: () => page.title(),
    url: () => page.url(),
  };
}

/**
 * Browserbase Stagehand (v4). Each call gets its own browser (a Browserbase session,
 * or a local Chrome for env=local). Steps try a deterministic locator first and fall
 * back to `act()` — natural-language, self-healing — when the label no longer matches.
 */
export class StagehandRunner implements BrowserRunner {
  readonly name: string;
  private evidenceDir: string;

  constructor(private opts: StagehandRunnerOptions) {
    if (opts.env === "browserbase" && !opts.browserbaseApiKey) {
      throw new Error("StagehandRunner(browserbase) requires BROWSERBASE_API_KEY");
    }
    this.name = `stagehand-${opts.env}`;
    this.evidenceDir = opts.evidenceDir ?? DEFAULT_EVIDENCE_DIR;
    mkdirSync(this.evidenceDir, { recursive: true });
  }

  /** True when act() has a model: explicit config, or Browserbase's Model Gateway. */
  get canAct(): boolean {
    return !!this.opts.model || this.opts.env === "browserbase";
  }

  private async withSession<T>(
    viewport: Viewport,
    patches: DomPatch[] | undefined,
    fn: (sh: Stagehand, page: Page) => Promise<T>,
  ): Promise<T> {
    const { Stagehand, browserbase, localBrowser } = await import("@browserbasehq/stagehand");
    const vp = { width: viewport.width, height: viewport.height };
    const browser: StagehandBrowser =
      this.opts.env === "browserbase"
        ? await browserbase.launch({
            apiKey: this.opts.browserbaseApiKey!,
            ...(this.opts.browserbaseProjectId ? { projectId: this.opts.browserbaseProjectId } : {}),
            browserSettings: { viewport: vp },
          })
        : await localBrowser.launch({
            headless: true,
            viewport: vp,
            ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
          });
    let sh: Stagehand | undefined;
    try {
      sh = await Stagehand.create({ browser, selfHeal: true, ...(this.opts.model ? { model: this.opts.model } : {}) });
      if (patches && patches.length > 0) await browser.context.addInitScript(compilePatches(patches));
      const page = (await browser.context.activePage()) ?? (await browser.context.newPage());
      await page.setViewportSize(vp.width, vp.height);
      return await fn(sh, page);
    } finally {
      await sh?.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }

  private async shoot(page: Page, name: string): Promise<string> {
    const file = path.join(this.evidenceDir, `${name}.png`);
    writeFileSync(file, await page.screenshot());
    return file;
  }

  async openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string },
  ): Promise<OpenPageResult> {
    await assertPublicUrl(url);
    return this.withSession(viewport, opts?.patches, async (_sh, page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.waitForTimeout(1200);
      const screenshotPath = await this.shoot(page, String(opts?.shotName ?? Date.now()));
      const html = await page.evaluate<string>("document.documentElement.outerHTML");
      return { html, screenshotPath };
    });
  }

  private async step(sh: Stagehand, page: Page, a: TrajectoryAction): Promise<void> {
    const origin = new URL(await page.url()).origin;
    if (a.href && a.href.startsWith(origin)) {
      await page.goto(a.href, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      return;
    }
    const loc = page.locator(stableSelector(a)).first();
    if ((await loc.count().catch(() => 0)) > 0) {
      await loc.click();
    } else if (this.canAct) {
      const res = await sh.act(`click the ${a.role === "button" ? "button" : "link"} labelled "${a.label}"`, { page });
      if (!res.data.success) throw new Error(`act failed: ${res.data.message}`);
    } else {
      throw new Error(`no element labelled "${a.label}" and no Stagehand model configured for act()`);
    }
    await page.waitForLoadState("domcontentloaded", NAV_TIMEOUT_MS).catch(() => undefined);
  }

  async runTrajectory(args: TrajectoryArgs): Promise<BrowserRun> {
    const started = Date.now();
    const errors: string[] = [];
    const steps: BrowserRun["steps"] = [];
    const screenshots: string[] = [];
    const assertions: BrowserRun["assertions"] = [];
    try {
      await assertPublicUrl(args.url);
      await this.withSession(args.viewport, args.patches, async (sh, page) => {
        await page.on("console", (ev) => {
          const p = ev.params as { type?: string; args?: { value?: unknown }[] };
          if (p.type === "error") {
            const text = (p.args ?? []).map((x) => String(x.value ?? "")).join(" ");
            errors.push(`console: ${text.slice(0, 200)}`);
          }
        });
        await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
        await page.waitForTimeout(800);
        screenshots.push(await this.shoot(page, `${args.runId}_0`));

        const total = Math.min(args.actions.length, args.maxSteps ?? 12);
        for (let i = 0; i < total; i++) {
          const a = args.actions[i];
          try {
            await this.step(sh, page, a);
            steps.push({ actionId: a.actionId, label: a.label, ok: true });
          } catch (e) {
            steps.push({ actionId: a.actionId, label: a.label, ok: false, error: String(e).slice(0, 160) });
          }
          if (shouldShoot(i, total)) {
            const shot = await this.shoot(page, `${args.runId}_${i + 1}`).catch(() => null);
            if (shot) screenshots.push(shot);
          }
        }
        const probe = stagehandProbe(page);
        for (const assertion of args.assertions) {
          assertions.push({ assertion, passed: await evaluateAssertion(probe, assertion) });
        }
      });
    } catch (e) {
      errors.push(`run: ${String(e).slice(0, 200)}`);
    }
    return summarizeRun({ runId: args.runId, viewport: args.viewport, started, steps, assertions, errors, screenshots });
  }

  async close(): Promise<void> {
    // Sessions are opened and closed per call.
  }
}
