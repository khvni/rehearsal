import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Locator, ModelConfig, Page, Stagehand, StagehandBrowser } from "@browserbasehq/stagehand";
import type {
  AgentDriver,
  AgentJourney,
  AgentRunArgs,
  AgentTargetInfo,
  AssertionProbe,
  BrowserRun,
  BrowserRunner,
  DomPatch,
  EnvVars,
  OpenPageResult,
  PersonaJourneyArgs,
  PersonaPage,
  StagehandRunnerOptions,
  TrajectoryAction,
  TrajectoryArgs,
  Viewport,
} from "../contracts";
import { assertPublicUrl, politeDelay, robotsAllows } from "../fetch/guards";
import { compilePatches } from "../variants";
import { agentLoop } from "./agent";
import { isSameOrigin } from "./extract";
import { chromiumSandboxEnabled } from "./sandbox";
import { measurePage } from "./metrics";
import { captureBrand } from "../rebuild/brand";
import { LivePagePersonaDriver } from "./persona";
import { DEFAULT_EVIDENCE_DIR } from "./playwright";
import { logEvent } from "../telemetry";
import { errorText, evaluateAssertion, evaluateGoalAlternatives, shouldShoot, summarizeRun } from "./types";

const NAV_TIMEOUT_MS = 60_000;
/** Stagehand only exposes console events, so forward uncaught errors/rejections to console.error. */
const PAGE_ERROR_BRIDGE = `(() => {
  window.addEventListener("error", (e) => console.error("pageerror: " + (e.message || e.error)));
  window.addEventListener("unhandledrejection", (e) => console.error("pageerror: " + e.reason));
})();`;

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

function stableSelector(a: TrajectoryAction, labelledBy: string[] = []): string {
  const text = xpathLiteral(a.label.trim());
  const match = [`normalize-space(.)=${text}`, `@aria-label=${text}`, ...labelledBy.map((ids) => `@aria-labelledby=${xpathLiteral(ids)}`)].join(" or ");
  return a.role === "button"
    ? `xpath=//*[self::button or @role="button" or self::input[@type="submit" or @type="button"]][${match} or @value=${text}]`
    : `xpath=//*[self::a or @role="link"][${match}]`;
}

async function firstVisible(page: Page, selector: string): Promise<Locator | null> {
  const all = page.locator(selector);
  const n = await all.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const loc = all.nth(i);
    if (await loc.isVisible().catch(() => false)) return loc;
  }
  return null;
}

/**
 * Runs in the page: resolve an observe() selector (xpath= or CSS) and describe its nearest form
 * control ancestor, so a span inside a submit button still reads as that button.
 */
function inspectTarget(selector: string): AgentTargetInfo | null {
  const node = selector.startsWith("xpath=")
    ? document.evaluate(selector.slice(6), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
    : document.querySelector(selector);
  if (!(node instanceof Element)) return null;
  const el = node.closest("button, input, textarea, select, option, label") ?? node;
  return {
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute("type") ?? "").toLowerCase(),
    role: (el.getAttribute("role") ?? "").toLowerCase(),
    inForm: el.closest("form") !== null || ("form" in el && el.form instanceof HTMLFormElement),
    editable: el instanceof HTMLElement && el.isContentEditable,
  };
}

/** Let client-side rendering finish: wait for network idle, at most `capMs`. */
function settle(page: Page, capMs: number): Promise<void> {
  return page.waitForLoadState("networkidle", capMs).catch(() => undefined);
}

/** Reject a page that redirected off the target origin or onto a non-public address. */
async function assertLanded(page: Page, target: URL): Promise<void> {
  const finalUrl = await page.url();
  if (!isSameOrigin(finalUrl, target.origin)) throw new Error(`Redirected off-origin to ${new URL(finalUrl).origin}`);
  await assertPublicUrl(finalUrl);
}

/** After a step navigates, drop a non-public page before screenshots or assertions can read it. */
async function leaveIfNotPublic(page: Page): Promise<void> {
  try {
    await assertPublicUrl(await page.url());
  } catch (e) {
    await page.goto("about:blank").catch(() => undefined);
    throw e;
  }
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
 * Browserbase Stagehand (v4). `openPage` captures pool one browser session per
 * viewport for a whole crawl (one paid session instead of one per state);
 * `runTrajectory`/`runAgentTask` still get isolated sessions — init scripts and
 * console listeners must not leak between runs. Steps try a deterministic
 * locator first and fall back to `act()` — natural-language, self-healing —
 * when the label no longer matches.
 */
export class StagehandRunner implements BrowserRunner {
  readonly name: string;
  private evidenceDir: string;
  /** Pooled capture sessions for `openPage`, keyed by run scope + viewport — one
   * paid Browserbase session per crawl instead of one per state; scopes keep
   * concurrent runs on one runner from sharing pages or closing each other. */
  private captures = new Map<
    string,
    { scope?: string; session: Promise<{ browser: StagehandBrowser; sh: Stagehand; page: Page }> }
  >();

  constructor(private opts: StagehandRunnerOptions) {
    if (opts.env === "browserbase" && !opts.browserbaseApiKey) {
      throw new Error("StagehandRunner(browserbase) requires BROWSERBASE_API_KEY");
    }
    this.name = `stagehand-${opts.env}`;
    this.evidenceDir = opts.evidenceDir ?? DEFAULT_EVIDENCE_DIR;
    // Edge runtimes (workerd) ship a read-only fs — evidence dir is best-effort.
    try {
      mkdirSync(this.evidenceDir, { recursive: true });
    } catch {
      /* evidence writes degrade to no-ops */
    }
  }

  /** True when act() has a model: explicit config, or Browserbase's Model Gateway. */
  get canAct(): boolean {
    return !!this.opts.model || this.opts.env === "browserbase";
  }

  get supportsAgent(): boolean {
    return this.canAct;
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
        ? this.opts.browserbaseSessionId
          ? await browserbase.connect({
              apiKey: this.opts.browserbaseApiKey!,
              sessionId: this.opts.browserbaseSessionId,
              ...(this.opts.browserbaseExtensionId ? { extensionId: this.opts.browserbaseExtensionId } : {}),
            })
          : await browserbase.launch({
              apiKey: this.opts.browserbaseApiKey!,
              ...(this.opts.browserbaseProjectId ? { projectId: this.opts.browserbaseProjectId } : {}),
              browserSettings: {
                viewport: vp,
                ...(this.opts.browserbaseExtensionId ? { extensionId: this.opts.browserbaseExtensionId } : {}),
              },
            })
        : await localBrowser.launch({
            headless: true,
            viewport: vp,
            chromiumSandbox: this.opts.chromiumSandbox ?? chromiumSandboxEnabled(),
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

  /** The launch half of `withSession`, kept alive so a crawl reuses one session per viewport. */
  private async captureSession(
    viewport: Viewport,
  ): Promise<{ browser: StagehandBrowser; sh: Stagehand; page: Page }> {
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
            chromiumSandbox: this.opts.chromiumSandbox ?? chromiumSandboxEnabled(),
            ...(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {}),
          });
    // Anything after launch failing must not leak the paid session.
    try {
      const sh = await Stagehand.create({ browser, selfHeal: true, ...(this.opts.model ? { model: this.opts.model } : {}) });
      const page = (await browser.context.activePage()) ?? (await browser.context.newPage());
      await page.setViewportSize(vp.width, vp.height);
      logEvent({ stage: "discover", kind: "browser-session", data: { runner: this.name, viewport: `${vp.width}x${vp.height}`, pooled: true } });
      return { browser, sh, page };
    } catch (e) {
      await browser.close().catch(() => undefined);
      throw e;
    }
  }

  private async capturePage(viewport: Viewport, scope?: string): Promise<Page> {
    const key = `${scope ?? ""}|${viewport.width}x${viewport.height}`;
    let entry = this.captures.get(key);
    if (!entry) {
      entry = { scope, session: this.captureSession(viewport) };
      this.captures.set(key, entry);
    }
    try {
      return (await entry.session).page;
    } catch (e) {
      this.captures.delete(key);
      throw e;
    }
  }

  /** Drop pooled capture sessions for one run scope (or all when omitted) — called when a discover stage ends. */
  async releaseCaptures(scope?: string): Promise<void> {
    const entries = [...this.captures.entries()].filter(([, e]) => scope === undefined || e.scope === scope);
    for (const [key] of entries) this.captures.delete(key);
    for (const [, e] of entries) {
      const session = await e.session.catch(() => undefined);
      await session?.sh.close().catch(() => undefined);
      await session?.browser.close().catch(() => undefined);
    }
  }

  /** Best-effort screenshot: returns the evidence path, or null on read-only runtimes. */
  private async shoot(page: Page, name: string): Promise<string | null> {
    try {
      const file = path.join(this.evidenceDir, `${name}.png`);
      writeFileSync(file, await page.screenshot());
      return file;
    } catch {
      return null;
    }
  }

  async openPage(
    url: string,
    viewport: Viewport,
    opts?: { patches?: DomPatch[]; shotName?: string; scope?: string },
  ): Promise<OpenPageResult> {
    const target = await assertPublicUrl(url);
    if (!this.opts.politenessHandledByCaller) {
      if (!(await robotsAllows(target))) throw new Error(`robots.txt disallows ${target.pathname}`);
      await politeDelay(target);
    }
    // Patched captures need an isolated context (init scripts would leak across pages).
    if (opts?.patches?.length) {
      return this.withSession(viewport, opts.patches, async (_sh, page) => {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
        await assertLanded(page, target);
        await settle(page, 1200);
        const screenshotPath = await this.shoot(page, String(opts?.shotName ?? Date.now()));
        const metrics = await measurePage(page);
        const html = await page.evaluate<string>("document.documentElement.outerHTML");
        const brand = await captureBrand(page).catch(() => undefined);
        return { html, screenshotPath: screenshotPath ?? undefined, metrics, brand };
      });
    }
    const page = await this.capturePage(viewport, opts?.scope);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await assertLanded(page, target);
    await settle(page, 1200);
    const screenshotPath = await this.shoot(page, String(opts?.shotName ?? Date.now()));
    const metrics = await measurePage(page);
    const html = await page.evaluate<string>("document.documentElement.outerHTML");
    const brand = await captureBrand(page).catch(() => undefined);
    return { html, screenshotPath: screenshotPath ?? undefined, metrics, brand };
  }

  private async step(sh: Stagehand, page: Page, a: TrajectoryAction): Promise<void> {
    const origin = new URL(await page.url()).origin;
    if (a.href && isSameOrigin(a.href, origin)) {
      await assertPublicUrl(a.href);
      await page.goto(a.href, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await leaveIfNotPublic(page);
      return;
    }
    let loc = await firstVisible(page, stableSelector(a));
    if (!loc) {
      const labelledBy = await page.evaluate((label) => {
        const text = (node: Node, referenced = false): string => {
          if (!referenced && node instanceof Element && node.getAttribute("aria-hidden") === "true") return "";
          if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
          return Array.from(node.childNodes, (child) => text(child)).join("");
        };
        return Array.from(document.querySelectorAll("[aria-labelledby]"))
          .map((el) => el.getAttribute("aria-labelledby")!)
          .filter((ids) => ids.trim().split(/\s+/).map((id) => {
            const el = document.getElementById(id);
            return el ? text(el, true) : "";
          }).join(" ").replace(/\s+/g, " ").trim() === label);
      }, a.label);
      if (labelledBy.length) loc = await firstVisible(page, stableSelector(a, labelledBy));
    }
    if (loc) {
      await loc.click();
    } else if (this.canAct) {
      const res = await sh.act(`click the ${a.role === "button" ? "button" : "link"} labelled "${a.label}"`, { page });
      if (!res.data.success) throw new Error(`act failed: ${res.data.message}`);
    } else {
      throw new Error(`no element labelled "${a.label}" and no Stagehand model configured for act()`);
    }
    await page.waitForLoadState("domcontentloaded", NAV_TIMEOUT_MS).catch(() => undefined);
    await leaveIfNotPublic(page);
  }

  /** Wire console/page errors into `errors`, navigate to the start URL, and take the `_0` shot. */
  private async startRun(page: Page, args: TrajectoryArgs, target: URL, errors: string[], screenshots: string[]): Promise<void> {
    await page.addInitScript(PAGE_ERROR_BRIDGE);
    await page.on("console", (ev) => {
      const p = ev.params as { type?: string; args?: { value?: unknown }[] };
      if (p.type === "error") {
        const text = (p.args ?? []).map((x) => String(x.value ?? "")).join(" ");
        errors.push(`console: ${errorText(text)}`);
      }
    });
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await assertLanded(page, target);
    await settle(page, 800);
    const shot0 = await this.shoot(page, `${args.runId}_0`);
    if (shot0) screenshots.push(shot0);
  }

  async runTrajectory(args: TrajectoryArgs): Promise<BrowserRun> {
    const started = Date.now();
    const errors: string[] = [];
    const steps: BrowserRun["steps"] = [];
    const screenshots: string[] = [];
    const assertions: BrowserRun["assertions"] = [];
    let goalAlternatives: BrowserRun["assertions"] = [];
    try {
      const target = await assertPublicUrl(args.url);
      await this.withSession(args.viewport, args.patches, async (sh, page) => {
        await this.startRun(page, args, target, errors, screenshots);

        const total = Math.min(args.actions.length, args.maxSteps ?? 12);
        for (let i = 0; i < total; i++) {
          const a = args.actions[i];
          try {
            await this.step(sh, page, a);
            steps.push({ actionId: a.actionId, label: a.label, ok: true });
          } catch (e) {
            steps.push({ actionId: a.actionId, label: a.label, ok: false, error: errorText(e, 160) });
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
        goalAlternatives = await evaluateGoalAlternatives(probe, args.goalAlternatives);
      });
    } catch (e) {
      errors.push(`run: ${errorText(e)}`);
    }
    return summarizeRun({ runId: args.runId, viewport: args.viewport, started, steps, assertions, goalAlternatives, errors, screenshots });
  }

  /** Agent-driven verify: observe/act over the live page via `agentLoop`. */
  async runAgentTask(args: AgentRunArgs): Promise<BrowserRun> {
    const started = Date.now();
    const errors: string[] = [];
    const screenshots: string[] = [];
    let run: BrowserRun | undefined;
    try {
      const target = await assertPublicUrl(args.url);
      await this.withSession(args.viewport, args.patches, async (sh, page) => {
        await this.startRun(page, args, target, errors, screenshots);
        const driver: AgentDriver = {
          observe: async (instruction) => {
            const res = await sh.observe(instruction, { page });
            return res.data.map(({ selector, description, method }) => ({ selector, description, method }));
          },
          inspect: (selector) => page.evaluate(inspectTarget, selector).catch(() => null),
          act: async (instruction, target) => {
            const action = { selector: target.selector, description: instruction, method: target.method ?? "click", arguments: [] };
            const res = await sh.act(action, { page });
            await page.waitForLoadState("domcontentloaded", NAV_TIMEOUT_MS).catch(() => undefined);
            await leaveIfNotPublic(page);
            return { ok: res.data.success, detail: res.data.message };
          },
          extract: async (instruction, schema) =>
            (schema ? await sh.extract(instruction, schema as Parameters<Stagehand["extract"]>[1], { page }) : await sh.extract(instruction, { page })).data,
          probe: () => stagehandProbe(page),
        };
        run = await agentLoop(driver, args, (name) => this.shoot(page, name));
      });
    } catch (e) {
      errors.push(`run: ${errorText(e)}`);
    }
    return summarizeRun({
      runId: args.runId,
      viewport: args.viewport,
      started,
      steps: run?.steps ?? [],
      assertions: run?.assertions ?? [],
      goalAlternatives: run?.goalAlternatives,
      errors: [...errors, ...(run?.errors ?? [])],
      screenshots: [...screenshots, ...(run?.screenshotPaths ?? [])],
    });
  }

  /** Persona-agent journey: extraction snapshot → batched Jev scoring → seeded pick → act, per step. */
  async runPersonaJourney(args: PersonaJourneyArgs): Promise<AgentJourney> {
    const target = await assertPublicUrl(args.url);
    if (!this.opts.politenessHandledByCaller) {
      if (!(await robotsAllows(target))) throw new Error(`robots.txt disallows ${target.pathname}`);
      await politeDelay(target);
    }
    return this.withSession(args.viewport, undefined, async (_sh, page) => {
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await settle(page, 800);
      await leaveIfNotPublic(page);
      const driver = new LivePagePersonaDriver(
        page as unknown as PersonaPage,
        args.viewport,
        this.evidenceDir,
        NAV_TIMEOUT_MS,
      );
      const { personaJourneyLoop } = await import("../simulation/persona");
      const { selectJev } = await import("../decisions/jev");
      return personaJourneyLoop(driver, args.jev ?? this.opts.jev ?? selectJev(), args);
    });
  }

  async close(): Promise<void> {
    await this.releaseCaptures();
  }
}
