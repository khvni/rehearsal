/**
 * Headless Rehearsal run against a live site (no Next server).
 *
 *   npm run site -- <url> --goal "find pricing" [--max-states 15] [--trajectories 300]
 *                  [--verify 4] [--max-depth 3] [--viewports desktop,mobile] [--timeout-min 5]
 *   npm run site -- --all            # every entry in docs/runs/sites.json
 *   npm run site -- --table          # rebuild docs/runs/README.md from summaries
 *
 * Writes docs/runs/<host>/spec.md + summary.json and refreshes docs/runs/README.md.
 * A site that blocks the browser (403, captcha, bot wall) is recorded with its reason.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Orchestrator } from "../src/lib/orchestrator";
import { specToMarkdown } from "../src/lib/analysis/spec";
import { assertPublicUrl, politeDelay, robotsAllows } from "../src/lib/fetch/guards";
import { SiteRunSummary, type Experiment, type SitePreflight } from "../src/lib/contracts";
import { settleInterstitial, withTimeout } from "../src/lib/browser/playwright";

const ROOT = process.cwd();
const RUNS_DIR = path.join(ROOT, "docs", "runs");
const SITES_FILE = path.join(RUNS_DIR, "sites.json");
const EVENTS_DIR = path.join(ROOT, "data", "events");
const PROBE_UA = "Rehearsal/0.1 (+https://github.com/khvni/rehearsal)";

const BLOCK_PATTERNS: [RegExp, string][] = [
  [/just a moment|cf-chl|checking your browser|cf_chl_opt/i, "Cloudflare challenge"],
  [/attention required!? \| cloudflare/i, "Cloudflare block page"],
  [/px-captcha|perimeterx|press (&amp;|&) hold/i, "PerimeterX/HUMAN captcha"],
  [/datadome|captcha-delivery\.com/i, "DataDome challenge"],
  [/_incapsula_resource|incapsula incident/i, "Imperva/Incapsula block"],
  [/akamai.*(reference|access denied)|errors\.edgesuite\.net/i, "Akamai block"],
  [/g-recaptcha|h-captcha|hcaptcha\.com|are you a robot|verify (that )?you are (a )?human/i, "captcha wall"],
  [/<title>\s*(access denied|403 forbidden|request blocked|pardon our interruption)/i, "access denied page"],
];

interface Args {
  url?: string;
  goal?: string;
  maxStates: number;
  trajectories: number;
  verifyCount: number;
  maxDepth: number;
  viewports: ("desktop" | "mobile")[];
  timeoutMin: number;
  all: boolean;
  tableOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxStates: 15,
    trajectories: 300,
    verifyCount: 4,
    maxDepth: 3,
    viewports: ["desktop"],
    timeoutMin: 5,
    all: false,
    tableOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--goal") args.goal = next();
    else if (a === "--max-states") args.maxStates = Number(next());
    else if (a === "--trajectories") args.trajectories = Number(next());
    else if (a === "--verify") args.verifyCount = Number(next());
    else if (a === "--max-depth") args.maxDepth = Number(next());
    else if (a === "--viewports") args.viewports = next().split(",") as Args["viewports"];
    else if (a === "--timeout-min") args.timeoutMin = Number(next());
    else if (a === "--all") args.all = true;
    else if (a === "--table") args.tableOnly = true;
    else if (!a.startsWith("--")) args.url = a;
    else throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

function detectBlock(status: number | null, html: string): string | undefined {
  const head = html.slice(0, 200_000);
  for (const [re, reason] of BLOCK_PATTERNS) if (re.test(head)) return reason;
  if (status === 401 || status === 403 || status === 429) return `HTTP ${status}`;
  if (status !== null && status >= 500) return `HTTP ${status}`;
  return undefined;
}

/** One polite page load with the same UA as the local runner, to classify blocks and resolve redirects. */
async function preflight(url: string): Promise<SitePreflight> {
  const target = await assertPublicUrl(url);
  await politeDelay(target);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: PROBE_UA, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    await settleInterstitial(page);
    const status = res?.status() ?? null;
    const html = await withTimeout(page.content(), 15000, "page.content");
    const blockReason = detectBlock(status, html);
    const title = await withTimeout(page.title(), 15000, "title");
    return { status, finalUrl: page.url(), title, blocked: !!blockReason, blockReason };
  } catch (e) {
    const error = String(e).replace(/^Error: /, "").slice(0, 240);
    const blockReason = /renderer unresponsive/.test(error) ? "renderer unresponsive in headless Chromium" : "navigation failed";
    return { status: null, finalUrl: url, title: "", blocked: true, blockReason, error };
  } finally {
    await withTimeout(browser.close(), 15000, "browser.close").catch(() => undefined);
  }
}

interface StageEvent {
  stage: string;
  kind: string;
  data?: { durationMs?: number; url?: string; error?: string };
}

function readEvents(id: string): StageEvent[] {
  const p = path.join(EVENTS_DIR, `${id}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StageEvent);
}

const rel = (s: string) => s.split(`${ROOT}${path.sep}`).join("");

function hostSlug(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function runSite(args: Args & { url: string; goal: string }): Promise<SiteRunSummary> {
  const started = Date.now();
  const slug = hostSlug(args.url);
  const outDir = path.join(RUNS_DIR, slug);
  mkdirSync(outDir, { recursive: true });
  console.log(`\n▶ ${args.url} — "${args.goal}"`);

  const pre = await preflight(args.url);
  console.log(`  preflight: status=${pre.status} final=${pre.finalUrl} blocked=${pre.blocked}${pre.blockReason ? ` (${pre.blockReason})` : ""}`);
  // Start from the post-redirect URL so same-origin crawling follows the site's canonical host.
  const targetUrl = !pre.error && pre.finalUrl.startsWith("http") ? pre.finalUrl : args.url;
  const robotsOk = await robotsAllows(new URL(targetUrl)).catch(() => true);

  const orch = new Orchestrator();
  let exp: Experiment | null = null;
  let error: string | undefined;
  let timedOut = false;
  try {
    const created = await orch.createExperiment(targetUrl, args.goal, {
      maxStates: args.maxStates,
      trajectories: args.trajectories,
      verifyCount: args.verifyCount,
      maxDepth: args.maxDepth,
      viewports: args.viewports,
      seed: 1337,
    });
    exp = created;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`timeout after ${args.timeoutMin} min`));
      }, args.timeoutMin * 60_000);
    });
    try {
      exp = await Promise.race([orch.runAll(created.id), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    error = String(e).replace(/^Error: /, "").slice(0, 300);
  }
  if (exp) exp = (await orch.get(exp.id)) ?? exp;
  // Closing the browser also aborts a timed-out runAll still running in the background.
  await withTimeout(orch.dispose(), 15000, "dispose").catch(() => undefined);

  const events = exp ? readEvents(exp.id) : [];
  const durations: Record<string, number> = {};
  for (const ev of events) {
    if ((ev.kind === "ok" || ev.kind === "fail") && typeof ev.data?.durationMs === "number") {
      durations[ev.stage] = Math.max(durations[ev.stage] ?? 0, ev.data.durationMs);
    }
  }
  const pageFails = events
    .filter((ev) => ev.kind === "page-fail")
    .map((ev) => ({ url: ev.data?.url, error: ev.data?.error }));

  const states = exp?.graph?.states ?? [];
  const sims = exp?.simulations ?? [];
  const outcomes: Record<string, number> = {};
  for (const t of sims) outcomes[t.outcome] = (outcomes[t.outcome] ?? 0) + 1;
  const runs = (exp?.browserTests ?? []).filter((r) => !r.variantId);
  const findingsBySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const findingsByEvidence: Record<string, number> = {};
  for (const f of exp?.findings ?? []) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
    findingsByEvidence[f.evidenceType] = (findingsByEvidence[f.evidenceType] ?? 0) + 1;
  }

  // Post-hoc block check on what discovery actually captured (bot walls often return 200).
  const startState = states[0];
  const stateBlock = startState
    ? detectBlock(null, `<title>${startState.pageTitle}</title>${startState.visibleText}`)
    : undefined;
  // A blocked preflight only counts if discovery could not get past it either.
  const discoveryRecovered = states.length > 1 && !stateBlock;
  const blocked = (pre.blocked && !discoveryRecovered) || !!stateBlock || (states.length === 0 && pageFails.length > 0);
  const blockReason =
    stateBlock ??
    (pre.blocked && !discoveryRecovered ? pre.blockReason : undefined) ??
    (states.length === 0 && pageFails[0] ? `discover: ${pageFails[0].error}` : undefined);

  let status: SiteRunSummary["status"];
  if (exp?.status === "complete" && !blocked) status = "complete";
  else if (blocked) status = "blocked";
  else if (timedOut) status = "timeout";
  else status = "error";

  const summary = SiteRunSummary.parse({
    site: slug,
    url: args.url,
    targetUrl,
    goal: args.goal,
    status,
    failureReason: blocked ? blockReason : error,
    error,
    runner: "local-playwright",
    config: {
      maxStates: args.maxStates,
      trajectories: args.trajectories,
      verifyCount: args.verifyCount,
      maxDepth: args.maxDepth,
      viewports: args.viewports,
      seed: 1337,
    },
    preflight: pre,
    robotsAllowsTarget: robotsOk,
    assertions: exp?.assertions ?? [],
    discover: {
      states: states.length,
      edges: exp?.graph?.edges.length ?? 0,
      pageFailures: pageFails.length,
      pageFailureSamples: pageFails.slice(0, 5),
      urls: states.map((s) => s.url),
    },
    simulate: {
      trajectories: sims.length,
      goalReachPct: sims.length ? Math.round((1000 * (outcomes["goal-reached"] ?? 0)) / sims.length) / 10 : 0,
      outcomes,
    },
    verify: {
      runs: runs.length,
      passed: runs.filter((r) => r.success).length,
      failed: runs.filter((r) => !r.success).length,
      // success = navigation completed + goal assertion held; this isolates the assertion itself.
      assertionsPassed: runs.filter((r) => r.assertions.length > 0 && r.assertions.every((a) => a.passed)).length,
      runsWithConsoleErrors: runs.filter((r) => r.consoleErrorCount > 0).length,
      runErrors: runs.flatMap((r) => r.errors.filter((e) => e.startsWith("run:"))).slice(0, 3),
    },
    compare: exp?.comparisons[0]?.deltas ?? null,
    findings: {
      total: exp?.findings.length ?? 0,
      bySeverity: findingsBySeverity,
      byEvidence: findingsByEvidence,
      titles: (exp?.findings ?? []).map((f) => `[${f.severity}] ${f.title}`),
    },
    durationsMs: { ...durations, total: Date.now() - started },
    ranAt: new Date(started).toISOString(),
  });
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (exp?.spec) writeFileSync(path.join(outDir, "spec.md"), rel(specToMarkdown(exp.spec)));
  console.log(
    `  ${status}: states=${summary.discover.states} edges=${summary.discover.edges} goal=${summary.simulate.goalReachPct}% ` +
      `verify=${summary.verify.passed}/${summary.verify.runs} findings=${summary.findings.total} ` +
      `(${Math.round(summary.durationsMs.total / 1000)}s)${summary.failureReason ? ` — ${summary.failureReason}` : ""}`,
  );
  return summary;
}

function writeTable(): void {
  const rows: SiteRunSummary[] = readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(RUNS_DIR, d.name, "summary.json")))
    .map((d) => JSON.parse(readFileSync(path.join(RUNS_DIR, d.name, "summary.json"), "utf8")) as SiteRunSummary)
    .sort((a, b) => a.site.localeCompare(b.site));
  const sec = (ms?: number) => (typeof ms === "number" ? `${Math.round(ms / 1000)}` : "–");
  const sev = (r: SiteRunSummary) => {
    const s = r.findings.bySeverity;
    return `${s.critical ?? 0}/${s.high ?? 0}/${s.medium ?? 0}/${s.low ?? 0}`;
  };
  const lines = [
    "# Multi-site sweep",
    "",
    "Headless `Orchestrator.runAll` against live sites with the keyless stack (local Playwright, fixture Jev/LLM).",
    "Budget: maxStates 15, trajectories 300, verifyCount 4, desktop viewport, seed 1337.",
    "Regenerate one site with `npm run site -- <url> --goal \"...\"`, all with `npm run site -- --all`.",
    "",
    "Columns: HTTP = preflight status; goal % = simulated trajectories reaching the compiled assertion;",
    "verify = browser runs that completed navigation and passed the goal assertion; assert = runs whose goal assertion held",
    "(console errors are reported as a low-severity finding, not a verify failure);",
    "findings = critical/high/medium/low; times in seconds.",
    "",
    "| Site | Goal | Status | HTTP | States | Edges | Goal % | Verify | Assert | Findings c/h/m/l | Discover s | Verify s | Total s | Notes |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const notes = (r.failureReason ?? (r.discover.pageFailures ? `${r.discover.pageFailures} page failures` : ""))
      .replace(/\|/g, "\\|")
      .replace(/\s+/g, " ")
      .slice(0, 140);
    lines.push(
      `| [${r.site}](${r.site}/summary.json) | ${r.goal} | ${r.status} | ${r.preflight.status ?? "–"} | ${r.discover.states} | ${r.discover.edges} | ${r.simulate.goalReachPct} | ${r.verify.passed}/${r.verify.runs} | ${r.verify.assertionsPassed ?? "–"}/${r.verify.runs} | ${sev(r)} | ${sec(r.durationsMs.discover)} | ${sec(r.durationsMs.verify)} | ${sec(r.durationsMs.total)} | ${notes} |`,
    );
  }
  lines.push("", "Each site folder has `summary.json` (full metrics) and, when the pipeline completed, `spec.md`.", "");
  writeFileSync(path.join(RUNS_DIR, "README.md"), lines.join("\n"));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(RUNS_DIR, { recursive: true });
  if (!args.tableOnly) {
    const targets: { url: string; goal: string }[] = args.all
      ? (JSON.parse(readFileSync(SITES_FILE, "utf8")) as { url: string; goal: string }[])
      : args.url && args.goal
        ? [{ url: args.url, goal: args.goal }]
        : [];
    if (targets.length === 0) throw new Error('Usage: npm run site -- <url> --goal "..." | --all | --table');
    for (const t of targets) {
      try {
        await runSite({ ...args, ...t });
      } catch (e) {
        console.error(`  ✗ ${t.url}: ${String(e).slice(0, 300)}`);
      }
      writeTable();
    }
  }
  writeTable();
  console.log(`\nWrote ${path.relative(ROOT, path.join(RUNS_DIR, "README.md"))}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
