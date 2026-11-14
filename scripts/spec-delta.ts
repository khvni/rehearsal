/**
 * Rehearsal spec delta — "visual proof instead of diffs".
 *
 * Runs the full pipeline (discover → spec) hermetically on the checked-in AIE fixture,
 * writes a compact summary, diffs it against tests/golden/aie-code-2026.summary.json and
 * renders the PR comment markdown. Optionally screenshots the experiment dashboard.
 *
 *   npm run spec:delta                        # summary + diff + comment.md
 *   npm run spec:delta -- --screenshot        # also `next start` (or `next dev`) + dashboard PNG
 *   npm run spec:delta -- --update-golden     # rewrite the golden from this run
 *
 * Exits non-zero only when the pipeline crashes or produces nothing; deltas are informational.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import type { Browser, BrowserContext } from "playwright";
import type { BrowserRunner, DomPatch, Experiment, OpenPageResult, TrajectoryArgs, Viewport } from "../src/lib/contracts";
import { summarizeRun } from "../src/lib/browser/types";
import { executeTrajectory, launchChromium, watchPageErrors } from "../src/lib/browser/playwright";
import { measurePage } from "../src/lib/browser/metrics";
import { compilePatches } from "../src/lib/variants";
import { assertPublicUrl } from "../src/lib/fetch/guards";

// ── Determinism ─────────────────────────────────────────────────────────────
// stateIds/actionIds/experiment ids come from randomUUID, and FixtureJevClient's tiebreak
// jitter is keyed by actionId — a counter keeps simulated outcomes reproducible run to run.
// Patched on the builtin module object before the orchestrator is loaded.
const nodeCrypto = process.getBuiltinModule("node:crypto");
let uuidCounter = 0;
nodeCrypto.randomUUID = () =>
  `${(uuidCounter++).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000` as `${string}-${string}-${string}-${string}-${string}`;
syncBuiltinESMExports();

export const SEED = 1337;
export const CONFIG = {
  seed: SEED,
  maxStates: 12,
  maxDepth: 3,
  trajectories: 200,
  verifyCount: 2,
  viewports: ["desktop" as const],
};
const GOAL = "find the conference schedule";
const FIXTURE_PATH = "/code/2026";

const ROOT = process.cwd();
const GOLDEN = path.join(ROOT, "tests", "golden", "aie-code-2026.summary.json");
const FIXTURE = path.join(ROOT, "tests", "evals", "fixtures", "aie-code-2026.html");
const MARKER = "<!-- rehearsal-spec-delta -->";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = path.resolve(opt("--out", path.join("data", "spec-delta")));

// ── Summary contract ────────────────────────────────────────────────────────

export interface FindingSummary {
  ruleOrTitle: string;
  severity: Experiment["findings"][number]["severity"];
  principle: string;
  count: number;
}
export interface EndpointSummary {
  class: string;
  /** Endpoints of this class discovered. */
  count: number;
  /** How many of them seeded journeys reached. */
  reached: number;
  /** Highest weight in the class. */
  weight: number;
}
export interface SpecDeltaSummary {
  fixture: string;
  goal: string;
  config: typeof CONFIG;
  states: number;
  edges: number;
  trajectories: number;
  goalReached: number;
  /** Baseline trajectories replayed in a real browser. */
  verified: number;
  verifiedPassed: number;
  findings: FindingSummary[];
  endpoints: EndpointSummary[];
  specSections: string[];
}

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 } as const;
/** Titles embed counts ("Ambiguous link labels (4)"); normalize so the key is the rule. */
const ruleKey = (title: string) => title.replace(/\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim();
const round = (n: number) => Math.round(n * 1000) / 1000;

export function summarize(exp: Experiment, specMarkdown: string): SpecDeltaSummary {
  const findings = new Map<string, FindingSummary>();
  for (const f of exp.findings) {
    const key = `${ruleKey(f.title)}|${f.krugPrinciple}`;
    const cur = findings.get(key);
    if (!cur) findings.set(key, { ruleOrTitle: ruleKey(f.title), severity: f.severity, principle: f.krugPrinciple, count: 1 });
    else {
      cur.count++;
      if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[cur.severity]) cur.severity = f.severity;
    }
  }
  const reachedIds = new Set((exp.journeys ?? []).filter((j) => j.goalReached > 0).map((j) => j.endpointId));
  const endpoints = new Map<string, EndpointSummary>();
  for (const e of exp.endpoints ?? []) {
    const cur = endpoints.get(e.class) ?? { class: e.class, count: 0, reached: 0, weight: 0 };
    cur.count++;
    if (reachedIds.has(e.endpointId)) cur.reached++;
    cur.weight = Math.max(cur.weight, round(e.weight));
    endpoints.set(e.class, cur);
  }
  const baseline = exp.browserTests.filter((r) => !r.variantId);
  return {
    fixture: "tests/evals/fixtures/aie-code-2026.html",
    goal: exp.goal,
    config: CONFIG,
    states: exp.graph?.states.length ?? 0,
    edges: exp.graph?.edges.length ?? 0,
    trajectories: exp.simulations.length,
    goalReached: exp.simulations.filter((t) => t.outcome === "goal-reached").length,
    verified: baseline.length,
    verifiedPassed: baseline.filter((r) => r.success).length,
    findings: [...findings.values()].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.ruleOrTitle.localeCompare(b.ruleOrTitle),
    ),
    endpoints: [...endpoints.values()].sort((a, b) => b.weight - a.weight || a.class.localeCompare(b.class)),
    specSections: specMarkdown
      .split("\n")
      .filter((l) => /^#{2,3} /.test(l))
      .map((l) => ruleKey(l.replace(/^#{2,3} /, ""))),
  };
}

// ── Diff + comment ──────────────────────────────────────────────────────────

export interface SpecDelta {
  added: FindingSummary[];
  removed: FindingSummary[];
  severityChanged: { ruleOrTitle: string; principle: string; from: string; to: string }[];
  countChanged: { ruleOrTitle: string; principle: string; from: number; to: number }[];
  endpoints: { class: string; before?: EndpointSummary; after?: EndpointSummary }[];
  sectionsAdded: string[];
  sectionsRemoved: string[];
  counts: { key: string; before: number; after: number }[];
  changed: boolean;
}

export function diffSummaries(golden: SpecDeltaSummary, current: SpecDeltaSummary): SpecDelta {
  const key = (f: FindingSummary) => `${f.ruleOrTitle}|${f.principle}`;
  const before = new Map(golden.findings.map((f) => [key(f), f]));
  const after = new Map(current.findings.map((f) => [key(f), f]));
  const added = current.findings.filter((f) => !before.has(key(f)));
  const removed = golden.findings.filter((f) => !after.has(key(f)));
  const severityChanged: SpecDelta["severityChanged"] = [];
  const countChanged: SpecDelta["countChanged"] = [];
  for (const [k, a] of after) {
    const b = before.get(k);
    if (!b) continue;
    if (b.severity !== a.severity) severityChanged.push({ ruleOrTitle: a.ruleOrTitle, principle: a.principle, from: b.severity, to: a.severity });
    if (b.count !== a.count) countChanged.push({ ruleOrTitle: a.ruleOrTitle, principle: a.principle, from: b.count, to: a.count });
  }
  const classes = [...new Set([...golden.endpoints, ...current.endpoints].map((e) => e.class))].sort();
  const endpoints = classes
    .map((c) => ({ class: c, before: golden.endpoints.find((e) => e.class === c), after: current.endpoints.find((e) => e.class === c) }))
    .filter(({ before: b, after: a }) => JSON.stringify(b) !== JSON.stringify(a));
  const sectionsAdded = current.specSections.filter((s) => !golden.specSections.includes(s));
  const sectionsRemoved = golden.specSections.filter((s) => !current.specSections.includes(s));
  const countKeys = ["states", "edges", "trajectories", "goalReached", "verified", "verifiedPassed"] as const;
  const counts = countKeys.map((k) => ({ key: k, before: golden[k], after: current[k] }));
  const changed =
    added.length + removed.length + severityChanged.length + countChanged.length + endpoints.length +
      sectionsAdded.length + sectionsRemoved.length > 0 || counts.some((c) => c.before !== c.after);
  return { added, removed, severityChanged, countChanged, endpoints, sectionsAdded, sectionsRemoved, counts, changed };
}

const esc = (s: string) => s.replace(/\|/g, "\\|");
const fmtDelta = (b: number, a: number) => (a === b ? `${a}` : `${b} → **${a}** (${a > b ? "+" : ""}${a - b})`);
const fmtEndpoint = (e?: EndpointSummary) => (e ? `${e.reached}/${e.count} reached · w ${e.weight}` : "—");

export function renderComment(golden: SpecDeltaSummary | null, current: SpecDeltaSummary, d: SpecDelta | null): string {
  const L: string[] = [MARKER, "## Rehearsal spec delta", ""];
  L.push(
    `Full pipeline on \`${current.fixture}\` (goal: “${current.goal}”, seed ${current.config.seed}, ` +
      `maxStates ${current.config.maxStates}, ${current.config.trajectories} trajectories, verifyCount ${current.config.verifyCount}), ` +
      `diffed against \`tests/golden/aie-code-2026.summary.json\`.`,
    "",
  );
  if (!golden || !d) {
    L.push("> No golden found — run `npm run spec:delta -- --update-golden` and commit it.", "");
  } else {
    L.push(d.changed ? "**Spec changed vs. golden.** If intended, run `npm run spec:delta -- --update-golden` and commit." : "**No delta vs. golden.**", "");
  }

  L.push("### Graph & verification", "", "| | golden | this PR |", "|---|---:|---:|");
  for (const k of ["states", "edges", "trajectories", "goalReached", "verified", "verifiedPassed"] as const) {
    L.push(`| ${k} | ${golden ? golden[k] : "—"} | ${golden ? fmtDelta(golden[k], current[k]) : current[k]} |`);
  }
  L.push("");

  if (d) {
    L.push("### Findings");
    if (d.added.length + d.removed.length + d.severityChanged.length + d.countChanged.length === 0) {
      L.push("", `No finding changes (${current.findings.length} finding rules).`);
    } else {
      L.push("", "| change | finding | severity | principle |", "|---|---|---|---|");
      for (const f of d.added) L.push(`| ➕ added | ${esc(f.ruleOrTitle)}${f.count > 1 ? ` ×${f.count}` : ""} | ${f.severity} | \`${f.principle}\` |`);
      for (const f of d.removed) L.push(`| ➖ removed | ${esc(f.ruleOrTitle)}${f.count > 1 ? ` ×${f.count}` : ""} | ${f.severity} | \`${f.principle}\` |`);
      for (const f of d.severityChanged) L.push(`| ↕ severity | ${esc(f.ruleOrTitle)} | ${f.from} → **${f.to}** | \`${f.principle}\` |`);
      for (const f of d.countChanged) L.push(`| # count | ${esc(f.ruleOrTitle)} (${f.from} → **${f.to}**) | | \`${f.principle}\` |`);
    }
    L.push("", "### Endpoint coverage");
    if (d.endpoints.length === 0) {
      L.push("", "No endpoint coverage changes.");
    } else {
      L.push("", "| class | golden | this PR |", "|---|---|---|");
      for (const e of d.endpoints) L.push(`| \`${e.class}\` | ${fmtEndpoint(e.before)} | ${fmtEndpoint(e.after)} |`);
    }
    if (d.sectionsAdded.length + d.sectionsRemoved.length > 0) {
      L.push("", "### Spec sections");
      for (const s of d.sectionsAdded) L.push(`- ➕ ${s}`);
      for (const s of d.sectionsRemoved) L.push(`- ➖ ${s}`);
    }
    L.push("");
  }

  L.push("<details><summary>Current findings and endpoints</summary>", "");
  L.push("| finding | severity | principle | count |", "|---|---|---|---:|");
  for (const f of current.findings) L.push(`| ${esc(f.ruleOrTitle)} | ${f.severity} | \`${f.principle}\` | ${f.count} |`);
  L.push("", "| endpoint class | reached / discovered | top weight |", "|---|---|---:|");
  for (const e of current.endpoints) L.push(`| \`${e.class}\` | ${e.reached}/${e.count} | ${e.weight} |`);
  L.push("", "</details>", "");
  L.push("### Dashboard", "", "{{DASHBOARD}}", "", "<sub>Informational only — deltas never fail the PR. {{RUN_LINK}}</sub>");
  return L.join("\n");
}

// ── Hermetic fixture server + browser runner ────────────────────────────────

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Serves the AIE fixture at /code/2026; every other same-origin page is a tiny deterministic stub. */
function startFixtureServer(html: string): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === FIXTURE_PATH || url.pathname === `${FIXTURE_PATH}/`) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(html);
    }
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nAllow: /\n");
    }
    if (url.pathname.startsWith(FIXTURE_PATH) && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      const slug = url.pathname.slice(FIXTURE_PATH.length + 1).split("/").filter(Boolean);
      const name = escapeHtml(slug.join(" / ").replace(/-/g, " "));
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(
        `<!doctype html><html><head><title>${name} — AI Engineer Code Summit 2026</title></head>` +
          `<body><nav><a href="${FIXTURE_PATH}">AI Engineer Code Summit</a></nav><main><h1>${name}</h1>` +
          `<p>Session details for ${name}. Wednesday November 11 – Thursday November 12, 2026.</p></main></body></html>`,
      );
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, origin: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}` });
    }),
  );
}

/** Local Chromium that aborts every request leaving the fixture origin and waits for networkidle. */
class HermeticRunner implements BrowserRunner {
  readonly name = "hermetic-playwright";
  private browser: Browser | null = null;

  constructor(
    private origin: string,
    private evidenceDir: string,
  ) {
    mkdirSync(evidenceDir, { recursive: true });
  }

  private async context(viewport: Viewport, patches?: DomPatch[]): Promise<BrowserContext> {
    this.browser ??= await launchChromium();
    const ctx = await this.browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await ctx.route("**/*", (route) =>
      new URL(route.request().url()).origin === this.origin ? route.continue() : route.abort(),
    );
    if (patches?.length) await ctx.addInitScript(compilePatches(patches));
    return ctx;
  }

  async openPage(url: string, viewport: Viewport, opts?: { patches?: DomPatch[]; shotName?: string }): Promise<OpenPageResult> {
    await assertPublicUrl(url);
    const ctx = await this.context(viewport, opts?.patches);
    try {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      const screenshotPath = path.join(this.evidenceDir, `${opts?.shotName ?? "page"}.png`);
      await page.screenshot({ path: screenshotPath });
      return { html: await page.content(), screenshotPath, metrics: await measurePage(page) };
    } finally {
      await ctx.close();
    }
  }

  async runTrajectory(a: TrajectoryArgs) {
    const started = Date.now();
    const errors: string[] = [];
    let result: Awaited<ReturnType<typeof executeTrajectory>> = { steps: [], assertions: [], screenshots: [] };
    await assertPublicUrl(a.url);
    const ctx = await this.context(a.viewport, a.patches);
    try {
      const page = await ctx.newPage();
      watchPageErrors(page, errors);
      result = await executeTrajectory(page, a, this.evidenceDir, { navTimeoutMs: 30000, preferClick: false });
    } catch (e) {
      errors.push(`run: ${String(e).slice(0, 200)}`);
    } finally {
      await ctx.close();
    }
    // Aborted third-party requests surface as console errors; they're an artifact of hermeticity.
    const kept = errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/i.test(e));
    return summarizeRun({ runId: a.runId, viewport: a.viewport, started, errors: kept, ...result });
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

// ── Dashboard screenshot ────────────────────────────────────────────────────

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  await assertPublicUrl(url);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dashboard did not start at ${url} within ${timeoutMs}ms`);
}

async function screenshotDashboard(experimentId: string, outPng: string): Promise<void> {
  const port = Number(opt("--port", "3123"));
  const built = existsSync(path.join(ROOT, ".next", "BUILD_ID"));
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child: ChildProcess = spawn(process.execPath, [nextBin, built ? "start" : "dev", "-p", String(port)], {
    cwd: ROOT,
    // JSON store only: the pipeline wrote to data/experiments, so a configured DB would not have this experiment.
    env: { ...process.env, DATABASE_URL: "", TIGERDATA_URL: "", NODE_ENV: built ? "production" : "development", REHEARSAL_BROWSER: "playwright" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const base = `http://127.0.0.1:${port}`;
  let browser: Browser | null = null;
  try {
    await waitForHttp(`${base}/api/experiments/${experimentId}`, 90000);
    browser = await launchChromium();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await assertPublicUrl(`${base}/experiments/${experimentId}`);
    await page.goto(`${base}/experiments/${experimentId}`, { waitUntil: "load", timeout: 60000 });
    await page.getByRole("heading", { name: "Findings" }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: outPng, fullPage: true });
  } finally {
    await browser?.close();
    child.kill("SIGTERM");
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const started = Date.now();
  mkdirSync(OUT, { recursive: true });
  process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // loopback fixture origin only; all other requests are aborted

  const [{ Orchestrator }, { FixtureJevClient }, { FixtureLlmClient }, { JsonFileStore }, { specToMarkdown }] = await Promise.all([
    import("../src/lib/orchestrator"),
    import("../src/lib/decisions/jev"),
    import("../src/lib/analysis/gemini"),
    import("../src/lib/storage"),
    import("../src/lib/analysis/spec"),
  ]);

  const { server, origin } = await startFixtureServer(readFileSync(FIXTURE, "utf8"));
  const runner = new HermeticRunner(origin, path.join(OUT, "evidence"));
  const orch = new Orchestrator({
    runner,
    jev: new FixtureJevClient(),
    llm: new FixtureLlmClient(),
    store: new JsonFileStore(), // data/experiments — what the dashboard reads
    fetcher: { name: "fixture-fetch", fetchHtml: async () => "User-agent: *\nAllow: /\n" },
  });

  let exp: Experiment;
  try {
    const created = await orch.createExperiment(`${origin}${FIXTURE_PATH}`, GOAL, CONFIG);
    exp = await orch.runAll(created.id);
  } finally {
    await orch.dispose();
    await new Promise((r) => server.close(r));
  }

  if (!exp.graph || exp.graph.states.length === 0) throw new Error("pipeline produced no states (discover failed)");
  if (!exp.spec) throw new Error("pipeline produced no spec");

  const summary = summarize(exp, specToMarkdown(exp.spec));
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(path.join(OUT, "experiment-id"), exp.id);

  if (flag("--update-golden")) {
    mkdirSync(path.dirname(GOLDEN), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(summary, null, 2) + "\n");
    console.log(`golden updated: ${path.relative(ROOT, GOLDEN)}`);
  }

  const golden: SpecDeltaSummary | null = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : null;
  const delta = golden ? diffSummaries(golden, summary) : null;
  writeFileSync(path.join(OUT, "delta.json"), JSON.stringify(delta, null, 2) + "\n");

  if (flag("--screenshot")) {
    // Dashboard capture is best-effort: a render failure must not discard the pipeline report.
    try {
      await screenshotDashboard(exp.id, path.join(OUT, "dashboard.png"));
    } catch (e) {
      console.warn("spec-delta: dashboard screenshot failed (continuing)\n", e);
    }
  }

  writeFileSync(path.join(OUT, "comment.md"), renderComment(golden, summary, delta));
  console.log(
    `spec-delta: ${summary.states} states, ${summary.edges} edges, ${summary.trajectories} trajectories, ` +
      `${summary.findings.length} finding rules, ${summary.endpoints.length} endpoint classes — ` +
      `${delta ? (delta.changed ? "CHANGED vs golden" : "no delta") : "no golden"} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
  console.log(`wrote ${path.relative(ROOT, OUT)}/{summary.json,delta.json,comment.md${flag("--screenshot") ? ",dashboard.png" : ""}}`);
}

main().catch((e) => {
  console.error("spec-delta: pipeline crashed\n", e);
  process.exit(1);
});
