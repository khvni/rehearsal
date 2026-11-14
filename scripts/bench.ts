/**
 * Rehearsal bench — the benchmark harness.
 *
 * Runs every fixture site in tests/evals/fixtures/*.manifest.json through the
 * full pipeline (discover → spec) hermetically, scores it against the site's
 * manifest, and writes a report to --out (default data/bench/):
 *   report.json   — BenchReport (contract: src/lib/contracts/bench.ts)
 *   report.md     — markdown summary (goal-reach rate, coverage, findings
 *                   precision/recall, spec item coverage, stage budgets)
 *
 *   npm run bench                          # fixture runner (no browser)
 *   npm run bench -- --browser             # hermetic chromium
 *   npm run bench -- --site aie-code-2026  # one site
 *   npm run bench -- --check               # exit 1 on expectation failures
 *
 * Determinism (AGENTS.md rule 3): seeded RNG in the simulation, counter UUIDs,
 * manifests may pin `referenceNow`; report `generatedAt`/durations are the only
 * wall-clock fields — strip them to compare runs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";

// stateIds/actionIds/experiment ids come from randomUUID, and FixtureJevClient's
// tiebreak jitter is keyed by actionId — a counter keeps outcomes reproducible.
// syncBuiltinESMExports propagates the patch to every module's live binding,
// including ones already imported.
const nodeCrypto = process.getBuiltinModule("node:crypto");
let uuidCounter = 0;
nodeCrypto.randomUUID = () =>
  `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`;
syncBuiltinESMExports();

// Fixture sites run on loopback — assertPublicUrl would otherwise refuse them.
process.env.REHEARSAL_ALLOW_PRIVATE ??= "1";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT = path.resolve(opt("--out", path.join("data", "bench")));
const SITE_FILTER = opt("--site", "");
const SEED = Number(opt("--seed", "1337"));
const BROWSER = flag("--browser");
const CHECK = flag("--check");

async function main() {
  const { loadManifests, loadSite, serveSite } = await import("../tests/evals/bench/sites");
  const { FixtureSiteRunner, HermeticSiteRunner } = await import("../tests/evals/bench/runner");
  const { runBenchSite } = await import("../tests/evals/bench/pipeline");
  const { scoreSite } = await import("../tests/evals/bench/score");
  const { buildReport, renderMarkdown } = await import("../tests/evals/bench/report");

  const manifests = loadManifests().filter((m) => !SITE_FILTER || m.id === SITE_FILTER);
  if (SITE_FILTER && manifests.length === 0) {
    console.error(`no fixture site manifest matching "${SITE_FILTER}"`);
    process.exit(2);
  }
  if (manifests.length === 0) {
    console.error("no fixture site manifests found under tests/evals/fixtures/");
    process.exit(2);
  }

  mkdirSync(OUT, { recursive: true });
  const siteReports = [];
  for (const manifest of manifests) {
    const site = loadSite(manifest);
    const served = await serveSite(site);
    const runner = BROWSER
      ? new HermeticSiteRunner(site, served.origin, path.join(OUT, "evidence", manifest.id))
      : new FixtureSiteRunner(site);
    try {
      const run = await runBenchSite(site, runner, { seed: SEED, targetUrl: served.targetUrl });
      const report = scoreSite(manifest, run, runner.name);
      siteReports.push(report);
      console.log(
        `${manifest.id}: goal-reach ${(report.simulate.goalReachRate * 100).toFixed(1)}% · ` +
          `findings p/r ${report.findings.precision.toFixed(2)}/${report.findings.recall.toFixed(2)} · ` +
          `spec ${report.spec.expectedItemsMatched}/${report.spec.expectedItemsTotal} · ` +
          `${report.expectationFailures.length} failures`,
      );
    } finally {
      await runner.close();
      await served.close();
    }
  }

  const report = buildReport(SEED, siteReports);
  writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const md = renderMarkdown(report);
  writeFileSync(path.join(OUT, "report.md"), md);
  console.log(`\nreport: ${path.join(OUT, "report.json")} (+ report.md)\n\n${md}`);

  if (CHECK && report.aggregate.expectationFailures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
