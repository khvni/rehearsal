import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, LaunchOptions, Page } from "playwright";
import type {
  AgentJourney,
  Assertion,
  AssertionProbe,
  BrowserRun,
  BrowserRunner,
  DomPatch,
  JevClient,
  OpenPageResult,
  PersonaJourneyArgs,
  PersonaPage,
  PlaywrightStepOptions,
  SharedLanding,
  TrajectoryArgs,
  Viewport,
} from "../contracts";
import type { startEgressProxy } from "../fetch/egress-proxy";
import { assertPublicUrl, fetchPublic, politeDelay, robotsAllows } from "../fetch/guards";
import { compilePatches } from "../variants";
import { isSameOrigin } from "./extract";
import { measurePage } from "./metrics";
import { LivePagePersonaDriver } from "./persona";
import { chromiumSandboxEnabled } from "./sandbox";
import { captureBrand } from "../rebuild/brand";
import { errorText, evaluateAssertion, evaluateGoalAlternatives, shouldShoot, summarizeRun } from "./types";

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

/** Let client-side rendering finish: wait for network idle, at most `capMs`. */
function settle(page: Page, capMs: number): Promise<void> {
  return page.waitForLoadState("networkidle", { timeout: capMs }).catch(() => undefined);
}

/** Headless Chromium with its sandbox on (Playwright passes --no-sandbox unless chromiumSandbox is set). */
export async function launchChromium(sandbox = chromiumSandboxEnabled(), options: LaunchOptions = {}): Promise<Browser> {
  // Lazy import: playwright can't load on edge runtimes (e.g. Cloudflare Workers);
  // keeping it out of the module graph lets the rest of the app boot there.
  const { chromium } = await import("playwright");
  return chromium.launch({ ...options, headless: true, chromiumSandbox: sandbox });
}

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

/** Throw when the page has landed on a non-public http(s) URL (redirect, DNS rebinding, click-through). */
export async function assertPublicPage(page: Page): Promise<void> {
  const url = page.url();
  if (/^https?:/i.test(url)) await assertPublicUrl(url);
}

/** Shared Playwright trajectory loop used by the local and hosted-browser runners. */
export async function executeTrajectory(
  page: Page,
  args: TrajectoryArgs,
  evidenceDir: string,
  opts: PlaywrightStepOptions,
): Promise<{ steps: BrowserRun["steps"]; assertions: BrowserRun["assertions"]; goalAlternatives?: BrowserRun["assertions"]; screenshots: string[] }> {
  const steps: BrowserRun["steps"] = [];
  const screenshots: string[] = [];
  const assertions: BrowserRun["assertions"] = [];

  await assertPublicUrl(args.url);
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: opts.navTimeoutMs });
  await assertPublicPage(page);
  await settle(page, 800);
  await settleInterstitial(page);
  await assertPublicPage(page);
  const shot0 = path.join(evidenceDir, `${args.runId}_0.png`);
  await page
    .screenshot({ path: shot0, timeout: PAGE_CALL_MS })
    .then(() => screenshots.push(shot0))
    .catch(() => undefined);

  const total = Math.min(args.actions.length, args.maxSteps ?? 12);
  for (let i = 0; i < total; i++) {
    const a = args.actions[i];
    try {
      const href = a.href && isSameOrigin(a.href, new URL(page.url()).origin) ? a.href : null;
      const gotoHref = async (target: string) => {
        await assertPublicUrl(target);
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: opts.navTimeoutMs });
      };
      const loc = a.role === "button" ? page.getByRole("button", { name: a.label }) : page.getByRole("link", { name: a.label });
      if (href && !opts.preferClick) {
        await gotoHref(href);
      } else {
        try {
          await loc.first().click({ timeout: 8000 });
          await page.waitForLoadState("domcontentloaded", { timeout: opts.navTimeoutMs });
        } catch (e) {
          if (!href) throw e;
          await gotoHref(href);
        }
      }
      steps.push({ actionId: a.actionId, label: a.label, ok: true });
    } catch (e) {
      steps.push({ actionId: a.actionId, label: a.label, ok: false, error: errorText(e, 160) });
    }
    await assertPublicPage(page);
    if (shouldShoot(i, total)) {
      const shot = path.join(evidenceDir, `${args.runId}_${i + 1}.png`);
      await page
        .screenshot({ path: shot, timeout: PAGE_CALL_MS })
        .then(() => screenshots.push(shot))
        .catch(() => undefined);
    }
  }

  for (const assertion of args.assertions) {
    assertions.push({ assertion, passed: await checkAssertion(page, assertion) });
  }
  const goalAlternatives = await evaluateGoalAlternatives(playwrightProbe(page), args.goalAlternatives);
  return { steps, assertions, goalAlternatives, screenshots };
}

const INTERSTITIAL_TITLE_RE = /just a moment|checking your browser|one moment, please|please wait/i;

/** Passive JS interstitials (e.g. "Just a moment...") reload into the real page on their own; give them time. */
export async function settleInterstitial(page: Page, timeoutMs = 15000): Promise<void> {
  if (!INTERSTITIAL_TITLE_RE.test(await withTimeout(page.title(), PAGE_CALL_MS, "title").catch(() => ""))) return;
  await page
    .waitForFunction((src) => !new RegExp(src, "i").test(document.title), INTERSTITIAL_TITLE_RE.source, { timeout: timeoutMs })
    .catch(() => undefined);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await settle(page, 1200);
}

export function watchPageErrors(page: Page, errors: string[]): void {
  page.on("pageerror", (e) => errors.push(`pageerror: ${errorText(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${errorText(m.text())}`);
  });
}

/** Local headless Chromium — the zero-key fallback for dev, evals and e2e. */
export class PlaywrightRunner implements BrowserRunner {
  readonly name = "local-playwright";
  private browser: Promise<Browser> | null = null;
  private egress: Awaited<ReturnType<typeof startEgressProxy>> | null = null;
  private jev?: JevClient;

  constructor(
    private evidenceDir = DEFAULT_EVIDENCE_DIR,
    private sandbox = chromiumSandboxEnabled(),
    jev?: JevClient,
  ) {
    this.jev = jev;
    // Edge runtimes (workerd) ship a read-only fs — evidence dir is best-effort.
    try {
      mkdirSync(evidenceDir, { recursive: true });
    } catch {
      /* evidence writes degrade to no-ops */
    }
  }

  private getBrowser(): Promise<Browser> {
    this.browser ??= this.launch().catch((e) => {
      this.browser = null;
      throw e;
    });
    return this.browser;
  }

  private async launch(): Promise<Browser> {
    // Lazy imports: playwright and node:http can't load on edge runtimes (e.g. Cloudflare Workers).
    const { startEgressProxy } = await import("../fetch/egress-proxy");
    this.egress ??= await startEgressProxy();
    // Playwright forces loopback through the proxy too (no implicit <-loopback> bypass).
    return launchChromium(this.sandbox, { proxy: { server: this.egress.server } });
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
      await assertPublicPage(page);
      const finalOrigin = new URL(page.url()).origin;
      if (finalOrigin !== target.origin) throw new Error(`Redirected off-origin to ${finalOrigin}`);
      await settle(page, 1200);
      await settleInterstitial(page);
      await assertPublicPage(page);
      const html = await withTimeout(page.content(), PAGE_CALL_MS, "page.content");
      const shotOk = await page
        .screenshot({ path: screenshotPath, fullPage: false, timeout: PAGE_CALL_MS })
        .then(() => true)
        .catch(() => false);
      const metrics = await withTimeout(measurePage(page), PAGE_CALL_MS, "measurePage");
      const brand = await withTimeout(captureBrand(page), PAGE_CALL_MS, "captureBrand").catch(() => undefined);
      return { html, screenshotPath: shotOk ? screenshotPath : undefined, metrics, brand };
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
      errors.push(`run: ${errorText(e)}`);
    } finally {
      await ctx?.close();
    }
    return summarizeRun({ runId: args.runId, viewport: args.viewport, started, errors, ...result });
  }

  /**
   * Fetch the swarm's landing page once (robots.txt + politeDelay on the one
   * request) so a swarm pays politeness per run, not per agent. Agents replay
   * the captured response into their own contexts — no further requests to the
   * landing URL. Off-origin redirects and non-HTML responses throw, in which
   * case runPersonaSwarm falls back to per-agent fetches.
   */
  async captureLandingPage(url: string): Promise<SharedLanding> {
    const target = await assertPublicUrl(url);
    if (!(await robotsAllows(target))) throw new Error(`robots.txt disallows ${target.pathname}`);
    const hops: SharedLanding["hops"] = [];
    const res = await fetchPublic(
      url,
      { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(30000) },
      {
        requireSameOrigin: true,
        onHop: (r) => {
          const headers = Object.fromEntries(r.headers);
          delete headers["set-cookie"];
          const cookies = r.headers.getSetCookie();
          if (cookies.length) headers["set-cookie"] = cookies.join("\n");
          hops.push({ url: r.url, status: r.status, headers });
        },
      },
    );
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html|xml/i.test(contentType)) throw new Error(`Non-HTML response (${contentType}) for ${url}`);
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    hops[hops.length - 1].body = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { url: res.url, hops };
  }

  async runPersonaJourney(args: PersonaJourneyArgs): Promise<AgentJourney> {
    const landing = args.landing;
    if (landing) {
      await assertPublicUrl(landing.url);
    } else {
      const target = await assertPublicUrl(args.url);
      if (!(await robotsAllows(target))) throw new Error(`robots.txt disallows ${target.pathname}`);
      await politeDelay(target);
    }
    const ctx = await this.newContext(args.viewport);
    try {
      if (landing) {
        // Replay the whole hop chain — redirect statuses, Location headers and
        // per-hop Set-Cookie (with the hop URL's default path) all re-execute
        // inside the context. Replayed headers must not describe the wire
        // encoding: stored bodies are the raw response bytes, so charset is
        // left for the browser to apply. Each hop is served once; an agent
        // navigating back to a landing-chain URL later gets a real request,
        // not the stale capture.
        const pending = new Map(landing.hops.map((h) => [h.url, h]));
        await ctx.route(
          (u) => pending.has(u.toString()),
          (route) => {
            const hop = pending.get(route.request().url())!;
            pending.delete(hop.url);
            const headers = { ...hop.headers };
            delete headers["content-encoding"];
            delete headers["content-length"];
            delete headers["transfer-encoding"];
            return route.fulfill({
              status: hop.status,
              headers,
              body: hop.body ? Buffer.from(hop.body, "base64") : undefined,
            });
          },
        );
      }
      const page = await ctx.newPage();
      await page.goto(landing?.hops[0]?.url ?? args.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await assertPublicPage(page);
      await settle(page, 800);
      await settleInterstitial(page);
      await assertPublicPage(page);
      const driver = new LivePagePersonaDriver(page as PersonaPage, args.viewport, this.evidenceDir, 30000);
      const { personaJourneyLoop } = await import("../simulation/persona");
      const { selectJev } = await import("../decisions/jev");
      return await personaJourneyLoop(driver, args.jev ?? this.jev ?? selectJev(), args);
    } finally {
      await ctx.close();
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await browser?.then((b) => b.close(), () => undefined);
    await this.egress?.close();
    this.egress = null;
  }
}
