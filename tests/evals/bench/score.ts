/**
 * Scores a finished bench run against the site's manifest:
 * findings precision/recall vs the expected/tolerated/unexpected buckets,
 * spec item coverage, journey/endpoint coverage, budgets, expectations.
 */
import type {
  BenchSiteReport,
  ExpectedFinding,
  Experiment,
  Finding,
  FindingScore,
  FixtureSiteManifest,
} from "@/lib/contracts";
import { detectSiteType } from "@/lib/intents/endpoints";
import type { BenchRun } from "./pipeline";

/** Findings collapse to a rule: digit-normalized title + principle. */
export function ruleKey(title: string, krugPrinciple: string): string {
  const t = title.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  return `${t}|${krugPrinciple}`;
}

function matchFinding(expected: ExpectedFinding, produced: FindingScore): boolean {
  if (!new RegExp(expected.titleMatch, "i").test(produced.title)) return false;
  if (expected.krugPrinciple && expected.krugPrinciple !== produced.krugPrinciple) return false;
  if (expected.severity && expected.severity !== produced.severity) return false;
  return true;
}

/** Groups experiment findings into rule-level scores. */
export function producedFindings(findings: Finding[]): FindingScore[] {
  const byKey = new Map<string, FindingScore>();
  for (const f of findings) {
    const key = ruleKey(f.title, f.krugPrinciple);
    const cur = byKey.get(key);
    if (cur) cur.count += 1;
    else byKey.set(key, { ruleKey: key, title: f.title, severity: f.severity, krugPrinciple: f.krugPrinciple, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
}

export function scoreSite(manifest: FixtureSiteManifest, run: BenchRun, runnerName: string): BenchSiteReport {
  const exp: Experiment = run.experiment;
  const graph = exp.graph ?? { states: [], edges: [] };

  // ── findings buckets ────────────────────────────────────────────────────
  const produced = producedFindings(exp.findings);
  const missing: ExpectedFinding[] = [];
  const unexpected: FindingScore[] = [];
  let accountable = 0;

  for (const p of produced) {
    const matches = (bucket: ExpectedFinding[]) => bucket.some((e) => matchFinding(e, p));
    if (matches(manifest.unexpectedFindings)) {
      p.matchedAs = "unexpected";
      unexpected.push(p);
    } else if (matches(manifest.expectedFindings)) {
      p.matchedAs = "expected";
      accountable += 1;
    } else if (matches(manifest.toleratedFindings)) {
      p.matchedAs = "tolerated";
      accountable += 1;
    }
  }
  for (const e of manifest.expectedFindings) {
    if (!produced.some((p) => p.matchedAs === "expected" && matchFinding(e, p))) missing.push(e);
  }
  const expectedTotal = manifest.expectedFindings.length;
  // Recall counts *expected rules* covered — duplicate produced matches can't inflate it.
  const expectedMatched = expectedTotal - missing.length;
  const recall = expectedTotal === 0 ? 1 : expectedMatched / expectedTotal;
  const precision = produced.length === 0 ? (expectedTotal === 0 ? 1 : 0) : accountable / produced.length;

  // ── spec coverage ───────────────────────────────────────────────────────
  const changes = exp.spec?.changes ?? [];
  const specText = changes.map((c) => `${c.title}\n${c.change}`);
  const matchedItems = manifest.expectedSpecItems.filter((item) =>
    specText.some((t) => new RegExp(item.match, "i").test(t)),
  );
  const itemTotal = manifest.expectedSpecItems.length;
  const coverage = itemTotal === 0 ? 1 : matchedItems.length / itemTotal;

  // ── journeys / endpoints ────────────────────────────────────────────────
  const endpoints = exp.endpoints ?? [];
  const journeys = exp.journeys ?? [];
  const discovered = endpoints.length;
  const reached = journeys.filter((j) => j.goalReached > 0).length;
  const visited = new Set<string>();
  for (const t of exp.simulations) for (const s of t.steps) visited.add(s.stateId);
  const stateCoverage = graph.states.length === 0 ? 0 : visited.size / graph.states.length;

  // ── simulate ────────────────────────────────────────────────────────────
  const outcomes: Record<string, number> = {};
  let goalReached = 0;
  for (const t of exp.simulations) {
    outcomes[t.outcome] = (outcomes[t.outcome] ?? 0) + 1;
    if (t.outcome === "goal-reached") goalReached += 1;
  }
  const goalReachRate = exp.simulations.length === 0 ? 0 : goalReached / exp.simulations.length;

  // ── verify ──────────────────────────────────────────────────────────────
  const runs = exp.browserTests;
  let assertionsPassed = 0;
  let assertionsTotal = 0;
  for (const r of runs) {
    for (const a of r.assertions) {
      assertionsTotal += 1;
      if (a.passed) assertionsPassed += 1;
    }
  }

  // ── discover ────────────────────────────────────────────────────────────
  const endpointsByClass: Partial<Record<string, number>> = {};
  for (const e of endpoints) endpointsByClass[e.class] = (endpointsByClass[e.class] ?? 0) + 1;
  const siteType = exp.graph ? detectSiteType(exp.graph) : undefined;
  const intentCategory = exp.intents?.[0]?.category ?? undefined;
  const classesPresent = new Set(endpoints.map((e) => e.class));
  const expectedEndpointClassesMissing = manifest.expectedEndpointClasses.filter((c) => !classesPresent.has(c));

  // ── compare ─────────────────────────────────────────────────────────────
  const variantRuns = runs.filter((r) => r.variantId);
  const comparison = exp.comparisons[0];
  const baseline = runs.find((r) => r.runId === comparison?.baselineRunId);
  const variant = runs.find((r) => r.runId === comparison?.variantRunId);

  // ── budgets + expectations ──────────────────────────────────────────────
  const overBudget = Object.entries(manifest.budgetsMs)
    .filter(([stage, budget]) => budget !== undefined && (run.durationsMs[stage] ?? 0) > budget)
    .map(([stage]) => stage);

  const expectationFailures: string[] = [];
  const expect = manifest.expectations;
  const checks: Array<[string, number, number]> = [
    ["minGoalReachRate", goalReachRate, expect.minGoalReachRate],
    ["minJourneyCoverage", stateCoverage, expect.minJourneyCoverage],
    ["minFindingsPrecision", precision, expect.minFindingsPrecision],
    ["minFindingsRecall", recall, expect.minFindingsRecall],
    ["minSpecItemCoverage", coverage, expect.minSpecItemCoverage],
  ];
  for (const [name, actual, floor] of checks) {
    if (actual < floor) expectationFailures.push(`${name}: ${actual.toFixed(3)} < ${floor}`);
  }
  for (const c of expectedEndpointClassesMissing) {
    expectationFailures.push(`expectedEndpointClasses: "${c}" not discovered`);
  }
  if (manifest.expectedSiteType && siteType !== manifest.expectedSiteType) {
    expectationFailures.push(`expectedSiteType: "${manifest.expectedSiteType}" != "${siteType ?? "none"}"`);
  }
  if (manifest.expectedIntentCategory && intentCategory !== manifest.expectedIntentCategory) {
    expectationFailures.push(`expectedIntentCategory: "${manifest.expectedIntentCategory}" != "${intentCategory ?? "none"}"`);
  }
  for (const u of unexpected) {
    expectationFailures.push(`unexpectedFinding: "${u.title}"`);
  }
  // Expected findings must be produced — a manifest that declares them always
  // fails when one is missing, regardless of the recall floor.
  for (const m of missing) {
    expectationFailures.push(`missingExpectedFinding: "${m.titleMatch}"`);
  }

  return {
    siteId: manifest.id,
    name: manifest.name,
    goal: manifest.goal,
    runner: runnerName,
    seed: exp.configuration.seed,
    config: exp.configuration,
    discover: {
      states: graph.states.length,
      edges: graph.edges.length,
      siteType,
      intentCategory,
      endpointsByClass: endpointsByClass as BenchSiteReport["discover"]["endpointsByClass"],
      expectedEndpointClassesMissing,
    },
    simulate: {
      trajectories: exp.simulations.length,
      goalReached,
      goalReachRate,
      outcomes,
    },
    journeys: {
      stateCoverage,
      endpointsDiscovered: discovered,
      endpointsReached: reached,
      endpointCoverage: discovered === 0 ? 0 : reached / discovered,
    },
    verify: {
      runs: runs.length,
      passed: runs.filter((r) => r.success).length,
      assertionsPassed,
      assertionsTotal,
    },
    compare: {
      variantRuns: variantRuns.length,
      baselineSuccess: baseline?.success,
      variantSuccess: variant?.success,
    },
    findings: {
      produced,
      missing,
      unexpected,
      recall,
      precision,
    },
    spec: {
      changes: changes.length,
      rebuildPhases: exp.spec?.rebuildPhases.length ?? 0,
      expectedItemsMatched: matchedItems.length,
      expectedItemsTotal: itemTotal,
      coverage,
    },
    durationsMs: run.durationsMs,
    budgetsMs: manifest.budgetsMs,
    overBudget,
    expectationFailures,
  };
}
