import { z } from "zod";
import {
  EndpointClass,
  ExperimentConfig,
  IntentCategory,
  KrugPrinciple,
  Severity,
  SiteType,
} from "./base";

// ── Benchmark harness (tests/evals/bench/**, scripts/bench.ts) ──────────────
//
// Fixture-site manifests declare what a benchmark site should produce; the
// harness runs the full pipeline hermetically and scores the experiment against
// them (tests/evals/bench/score.ts). Reports are written under data/bench/
// (gitignored) — never committed.

/** A finding rule the site is expected (or forbidden) to produce. */
export const ExpectedFinding = z.object({
  /** Case-insensitive regex matched against the finding title after digit normalization. */
  titleMatch: z.string().min(1),
  krugPrinciple: KrugPrinciple.optional(),
  severity: Severity.optional(),
});
export type ExpectedFinding = z.infer<typeof ExpectedFinding>;

/** A spec change the site should produce, matched against title + change text. */
export const ExpectedSpecItem = z.object({
  /** Case-insensitive regex matched against `${change.title}\n${change.change}`. */
  match: z.string().min(1),
});
export type ExpectedSpecItem = z.infer<typeof ExpectedSpecItem>;

/** Per-stage wall-clock budget, in ms, reported (not asserted) by the harness. */
export const StageBudgets = z.object({
  discover: z.number().positive().optional(),
  simulate: z.number().positive().optional(),
  verify: z.number().positive().optional(),
  analyze: z.number().positive().optional(),
  compare: z.number().positive().optional(),
  spec: z.number().positive().optional(),
  total: z.number().positive().optional(),
});
export type StageBudgets = z.infer<typeof StageBudgets>;

/** Metric floors the bench eval asserts per site. */
export const BenchExpectations = z.object({
  minGoalReachRate: z.number().min(0).max(1).default(0),
  minJourneyCoverage: z.number().min(0).max(1).default(0),
  minFindingsPrecision: z.number().min(0).max(1).default(0),
  minFindingsRecall: z.number().min(0).max(1).default(0),
  minSpecItemCoverage: z.number().min(0).max(1).default(0),
}).default({
  minGoalReachRate: 0,
  minJourneyCoverage: 0,
  minFindingsPrecision: 0,
  minFindingsRecall: 0,
  minSpecItemCoverage: 0,
});
export type BenchExpectations = z.infer<typeof BenchExpectations>;

/**
 * A benchmark site: its pages (URL path → HTML file, relative to the manifest
 * directory), the goal to run, and what the pipeline should find there.
 * Lives at tests/evals/fixtures/<id>.manifest.json.
 */
export const FixtureSiteManifest = z.object({
  /** Unique site id; the manifest file is named `<id>.manifest.json`. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  /** Visitor goal the experiment runs. */
  goal: z.string().min(1),
  /** URL path where the start page is mounted, e.g. "/code/2026" or "/". */
  mountPath: z.string().startsWith("/"),
  /** URL path -> fixture HTML file relative to the manifest's directory. */
  pages: z.record(z.string().startsWith("/"), z.string()),
  /** Serve a deterministic stub page for unmapped paths under mountPath. */
  stubMissing: z.boolean().default(false),
  /** Clock pinned during the run (stale-date findings); ISO instant. */
  referenceNow: z.string().datetime().optional(),
  expectedSiteType: SiteType.optional(),
  expectedIntentCategory: IntentCategory.optional(),
  /** Endpoint classes that must be discovered. */
  expectedEndpointClasses: z.array(EndpointClass).default([]),
  /** Findings the pipeline must produce (recall denominator). */
  expectedFindings: z.array(ExpectedFinding).default([]),
  /** Findings allowed beyond the expected set; count toward precision. */
  toleratedFindings: z.array(ExpectedFinding).default([]),
  /** Findings that must not appear — every hit is a false positive. */
  unexpectedFindings: z.array(ExpectedFinding).default([]),
  /** Spec changes the report should contain. */
  expectedSpecItems: z.array(ExpectedSpecItem).default([]),
  budgetsMs: StageBudgets.default({}),
  expectations: BenchExpectations,
  /** Pipeline config overrides merged over the harness defaults. */
  config: ExperimentConfig.partial().default({}),
});
export type FixtureSiteManifest = z.infer<typeof FixtureSiteManifest>;

// ── Report shapes ───────────────────────────────────────────────────────────

export const FindingScore = z.object({
  /** Digit-normalized title + krugPrinciple, e.g. "ambiguous link labels (#)|dont-make-me-think". */
  ruleKey: z.string(),
  title: z.string(),
  severity: Severity,
  krugPrinciple: KrugPrinciple,
  count: z.number().int().positive(),
  /** Which manifest bucket the rule matched; absent = unmatched. */
  matchedAs: z.enum(["expected", "tolerated", "unexpected"]).optional(),
});
export type FindingScore = z.infer<typeof FindingScore>;

export const BenchSiteReport = z.object({
  siteId: z.string(),
  name: z.string(),
  goal: z.string(),
  /** Runner backend used ("fixture-site" or "hermetic-chromium"). */
  runner: z.string(),
  seed: z.number().int(),
  config: ExperimentConfig,
  discover: z.object({
    states: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    siteType: SiteType.optional(),
    intentCategory: IntentCategory.optional(),
    endpointsByClass: z.partialRecord(EndpointClass, z.number().int().nonnegative()),
    expectedEndpointClassesMissing: z.array(EndpointClass),
  }),
  simulate: z.object({
    trajectories: z.number().int().nonnegative(),
    goalReached: z.number().int().nonnegative(),
    /** trajectories with outcome "goal-reached" / trajectories. */
    goalReachRate: z.number().min(0).max(1),
    outcomes: z.record(z.string(), z.number().int().nonnegative()),
  }),
  journeys: z.object({
    /** Distinct states visited by >=1 trajectory / states discovered. */
    stateCoverage: z.number().min(0).max(1),
    endpointsDiscovered: z.number().int().nonnegative(),
    endpointsReached: z.number().int().nonnegative(),
    /** endpointsReached / endpointsDiscovered. */
    endpointCoverage: z.number().min(0).max(1),
  }),
  verify: z.object({
    runs: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    assertionsPassed: z.number().int().nonnegative(),
    assertionsTotal: z.number().int().nonnegative(),
  }),
  compare: z.object({
    variantRuns: z.number().int().nonnegative(),
    baselineSuccess: z.boolean().optional(),
    variantSuccess: z.boolean().optional(),
  }),
  findings: z.object({
    produced: z.array(FindingScore),
    /** Expected rules with no produced match. */
    missing: z.array(ExpectedFinding),
    /** Produced rules matching unexpectedFindings — false positives. */
    unexpected: z.array(FindingScore),
    /** |produced ∩ expected| / |expected|. */
    recall: z.number().min(0).max(1),
    /** (expected + tolerated matches) / produced. */
    precision: z.number().min(0).max(1),
  }),
  spec: z.object({
    changes: z.number().int().nonnegative(),
    rebuildPhases: z.number().int().nonnegative(),
    expectedItemsMatched: z.number().int().nonnegative(),
    expectedItemsTotal: z.number().int().nonnegative(),
    /** expectedItemsMatched / expectedItemsTotal (1 when total is 0). */
    coverage: z.number().min(0).max(1),
  }),
  /** Wall-clock ms per stage — measured, not asserted. */
  durationsMs: z.record(z.string(), z.number().nonnegative()),
  budgetsMs: StageBudgets,
  /** Stages whose duration exceeded their configured budget. */
  overBudget: z.array(z.string()),
  /** Manifest expectation keys that failed. */
  expectationFailures: z.array(z.string()),
});
export type BenchSiteReport = z.infer<typeof BenchSiteReport>;

export const BenchReport = z.object({
  generatedAt: z.string(),
  seed: z.number().int(),
  sites: z.array(BenchSiteReport),
  aggregate: z.object({
    sites: z.number().int().nonnegative(),
    goalReachRate: z.number().min(0).max(1),
    journeyCoverage: z.number().min(0).max(1),
    findingsPrecision: z.number().min(0).max(1),
    findingsRecall: z.number().min(0).max(1),
    specItemCoverage: z.number().min(0).max(1),
    expectationFailures: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
});
export type BenchReport = z.infer<typeof BenchReport>;
