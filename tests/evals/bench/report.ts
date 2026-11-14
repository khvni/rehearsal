/**
 * Aggregates per-site bench reports and renders the markdown summary.
 * `generatedAt` is wall-clock by design — reports are evidence, not gate input;
 * determinism is proven by comparing reports with timing fields stripped.
 */
import type { BenchReport, BenchSiteReport } from "@/lib/contracts";

export function buildReport(seed: number, sites: BenchSiteReport[]): BenchReport {
  const n = sites.length || 1;
  const mean = (f: (s: BenchSiteReport) => number) =>
    sites.reduce((acc, s) => acc + f(s), 0) / n;
  return {
    generatedAt: new Date().toISOString(),
    seed,
    sites,
    aggregate: {
      sites: sites.length,
      goalReachRate: mean((s) => s.simulate.goalReachRate),
      journeyCoverage: mean((s) => s.journeys.stateCoverage),
      findingsPrecision: mean((s) => s.findings.precision),
      findingsRecall: mean((s) => s.findings.recall),
      specItemCoverage: mean((s) => s.spec.coverage),
      expectationFailures: sites.reduce((acc, s) => acc + s.expectationFailures.length, 0),
      durationMs: sites.reduce((acc, s) => acc + (s.durationsMs.total ?? 0), 0),
    },
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ms = (x: number | undefined) => (x === undefined ? "—" : `${x.toFixed(0)}ms`);
const esc = (s: string) => s.replace(/\|/g, "\\|");

const STAGES = ["discover", "simulate", "verify", "analyze", "compare", "spec", "total"];

export function renderMarkdown(report: BenchReport): string {
  const a = report.aggregate;
  const lines: string[] = [
    "# Bench report",
    "",
    `seed=${report.seed} · sites=${a.sites} · generatedAt=${report.generatedAt}`,
    "",
    "| metric | value |",
    "|---|---|",
    `| goal-reached rate | ${pct(a.goalReachRate)} |`,
    `| journey coverage (states visited) | ${pct(a.journeyCoverage)} |`,
    `| findings precision | ${pct(a.findingsPrecision)} |`,
    `| findings recall | ${pct(a.findingsRecall)} |`,
    `| spec item coverage | ${pct(a.specItemCoverage)} |`,
    `| expectation failures | ${a.expectationFailures} |`,
    `| total time | ${ms(a.durationMs)} |`,
    "",
  ];

  for (const s of report.sites) {
    lines.push(
      `## ${s.name} (\`${s.siteId}\`)`,
      "",
      `goal: "${s.goal}" · runner=${s.runner} · ` +
        `states=${s.discover.states} edges=${s.discover.edges}` +
        (s.discover.siteType ? ` · type=${s.discover.siteType}` : "") +
        (s.discover.intentCategory ? ` · intent=${s.discover.intentCategory}` : ""),
      "",
      "| metric | value |",
      "|---|---|",
      `| trajectories / goal-reached | ${s.simulate.trajectories} / ${s.simulate.goalReached} (${pct(s.simulate.goalReachRate)}) |`,
      `| state coverage | ${pct(s.journeys.stateCoverage)} |`,
      `| endpoints reached | ${s.journeys.endpointsReached}/${s.journeys.endpointsDiscovered} (${pct(s.journeys.endpointCoverage)}) |`,
      `| verify runs passed | ${s.verify.passed}/${s.verify.runs} · assertions ${s.verify.assertionsPassed}/${s.verify.assertionsTotal} |`,
      `| findings precision/recall | ${pct(s.findings.precision)} / ${pct(s.findings.recall)} |`,
      `| spec items | ${s.spec.expectedItemsMatched}/${s.spec.expectedItemsTotal} · changes=${s.spec.changes} · phases=${s.spec.rebuildPhases} |`,
      `| outcomes | ${Object.entries(s.simulate.outcomes).map(([k, v]) => `${k}:${v}`).join(" ")} |`,
      "",
      "### Findings",
      "",
      "| title | severity | bucket | count |",
      "|---|---|---|---|",
      ...s.findings.produced.map(
        (f) => `| ${esc(f.title)} | ${f.severity} | ${f.matchedAs ?? "—"} | ${f.count} |`,
      ),
      ...(s.findings.missing.length
        ? ["", `**missing (expected, not produced):** ${s.findings.missing.map((f) => `\`${f.titleMatch}\``).join(", ")}`]
        : []),
      "",
      "### Stage timing vs budget",
      "",
      "| stage | duration | budget | over? |",
      "|---|---|---|---|",
      ...STAGES.map((stage) => {
        const d = s.durationsMs[stage];
        const b = s.budgetsMs[stage as keyof typeof s.budgetsMs];
        return `| ${stage} | ${ms(d)} | ${ms(b)} | ${b !== undefined && d !== undefined && d > b ? "**yes**" : "—"} |`;
      }),
      "",
    );
    if (s.expectationFailures.length) {
      lines.push("### Expectation failures", "", ...s.expectationFailures.map((f) => `- ${esc(f)}`), "");
    }
  }
  return lines.join("\n");
}
