import { z } from "zod";
import { PageMetrics } from "./metrics";

// ── Krug rubric ─────────────────────────────────────────────────────────────

export const KrugDimension = z.enum([
  "clarity",
  "navigation",
  "hierarchy",
  "cognitive-effort",
  "copy-economy",
  "consistency",
  "feedback",
  "recovery",
  "responsive",
  "goal-completion",
]);
export type KrugDimension = z.infer<typeof KrugDimension>;

export const KRUG_DIMENSIONS = KrugDimension.options;

export const KrugPrinciple = z.enum([
  "dont-make-me-think",
  "scanning-not-reading",
  "conventions",
  "mindless-choices",
  "omit-words",
  "navigation",
  "homepage",
  "farmers-and-cowmen",
  "testing-beats-arguing",
]);
export type KrugPrinciple = z.infer<typeof KrugPrinciple>;

// ── Browser ─────────────────────────────────────────────────────────────────

export const Viewport = z.object({
  name: z.enum(["desktop", "mobile"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Viewport = z.infer<typeof Viewport>;

export const VIEWPORTS: Record<Viewport["name"], Viewport> = {
  desktop: { name: "desktop", width: 1440, height: 900 },
  mobile: { name: "mobile", width: 390, height: 844 },
};

// ── Graph ───────────────────────────────────────────────────────────────────

export const ActionType = z.enum(["click", "fill", "select", "navigate", "scroll", "back"]);

export const ActionNode = z.object({
  actionId: z.string(),
  stateId: z.string(),
  type: ActionType,
  label: z.string(),
  role: z.string().optional(),
  locator: z.string().optional(),
  href: z.string().optional(),
  destinationStateId: z.string().optional(),
  enabled: z.boolean().default(true),
  safeToExecute: z.boolean().default(true),
});
export type ActionNode = z.infer<typeof ActionNode>;

export const SiteState = z.object({
  stateId: z.string(),
  url: z.string().url(),
  viewport: Viewport,
  pageTitle: z.string(),
  visibleText: z.string(),
  actions: z.array(ActionNode),
  screenshotPath: z.string().optional(),
  stateHash: z.string(),
  metrics: PageMetrics.optional(),
  metadata: z
    .object({
      modalOpen: z.boolean().optional(),
      loading: z.boolean().optional(),
      error: z.string().optional(),
    })
    .optional(),
});
export type SiteState = z.infer<typeof SiteState>;

export const StateGraph = z.object({
  states: z.array(SiteState),
  edges: z.array(
    z.object({
      fromStateId: z.string(),
      actionId: z.string(),
      toStateId: z.string(),
    }),
  ),
});
export type StateGraph = z.infer<typeof StateGraph>;

// ── Decisions (Jev / System One) ────────────────────────────────────────────

export const DecisionQuestion = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    name: z.string(),
    instructions: z.string(),
    criteria: z.record(z.string(), z.string()),
  }),
  z.object({
    type: z.literal("noul"),
    name: z.string(),
    instructions: z.string(),
    criteria: z.object({ true: z.string(), false: z.string() }),
  }),
  z.object({
    type: z.literal("score"),
    name: z.string(),
    instructions: z.string(),
    criteria: z.record(z.string(), z.string()),
  }),
]);
export type DecisionQuestion = z.infer<typeof DecisionQuestion>;

export const DecisionResult = z.object({
  question: z.string(),
  type: z.enum(["choice", "noul", "score"]),
  // choice: option -> probability; noul: {"true": p, "false": 1-p}; score: level -> probability
  distribution: z.record(z.string(), z.number()),
  selected: z.string().optional(),
});
export type DecisionResult = z.infer<typeof DecisionResult>;

// ── Simulation ──────────────────────────────────────────────────────────────

export const BehavioralProfile = z.enum(["goal-directed", "impatient", "exploratory"]);
export type BehavioralProfile = z.infer<typeof BehavioralProfile>;

export const TrajectoryStep = z.object({
  stateId: z.string(),
  actionId: z.string().optional(),
});
export type TrajectoryStep = z.infer<typeof TrajectoryStep>;

export const TrajectoryOutcome = z.enum([
  "goal-reached",
  "terminal-failure",
  "repetition-limit",
  "max-depth",
  "dead-end",
]);
export type TrajectoryOutcome = z.infer<typeof TrajectoryOutcome>;

export const Trajectory = z.object({
  trajectoryId: z.string(),
  seed: z.number().int(),
  profile: BehavioralProfile,
  steps: z.array(TrajectoryStep),
  outcome: TrajectoryOutcome,
  backtracks: z.number().int().nonnegative(),
  riskScore: z.number().optional(),
});
export type Trajectory = z.infer<typeof Trajectory>;

// ── Verification ────────────────────────────────────────────────────────────

export const Assertion = z.object({
  kind: z.enum([
    "url-matches",
    "text-present",
    "text-absent",
    "element-visible",
    "element-present",
    "title-matches",
  ]),
  selector: z.string().optional(),
  value: z.string(),
});
export type Assertion = z.infer<typeof Assertion>;

export const BrowserRun = z.object({
  runId: z.string(),
  trajectoryId: z.string().optional(),
  variantId: z.string().optional(),
  viewport: Viewport,
  success: z.boolean(),
  steps: z.array(
    z.object({
      actionId: z.string().optional(),
      label: z.string(),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  ),
  assertions: z.array(z.object({ assertion: Assertion, passed: z.boolean() })),
  errors: z.array(z.string()),
  /** Page/console errors observed during the run — data for findings, not part of `success`. */
  consoleErrorCount: z.number().int().nonnegative().default(0),
  screenshotPaths: z.array(z.string()),
  durationMs: z.number().int().nonnegative(),
});
export type BrowserRun = z.infer<typeof BrowserRun>;

// ── Findings ────────────────────────────────────────────────────────────────

export const EvidenceType = z.enum([
  "verified-failure",
  "reproducible-concern",
  "hypothesis",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const Severity = z.enum(["critical", "high", "medium", "low"]);

export const Finding = z.object({
  findingId: z.string(),
  title: z.string(),
  category: KrugDimension,
  severity: Severity,
  evidenceType: EvidenceType,
  description: z.string(),
  affectedStates: z.array(z.string()),
  affectedActions: z.array(z.string()).default([]),
  evidencePaths: z.array(z.string()).default([]),
  recommendation: z.string(),
  verificationStatus: z.enum(["verified", "reproduced", "unverified"]),
  krugPrinciple: KrugPrinciple,
});
export type Finding = z.infer<typeof Finding>;

// ── Variants ────────────────────────────────────────────────────────────────

export const DomPatch = z.object({
  op: z.enum([
    "replaceText",
    "relabel",
    "setStyle",
    "setAttribute",
    "insertNotice",
    "reorder",
  ]),
  selector: z.string(),
  value: z.string(),
  newText: z.string().optional(),
});
export type DomPatch = z.infer<typeof DomPatch>;

export const Variant = z.object({
  variantId: z.string(),
  findingId: z.string(),
  description: z.string(),
  patches: z.array(DomPatch).min(1),
  status: z.enum(["proposed", "applied", "verified", "rejected"]),
});
export type Variant = z.infer<typeof Variant>;

export const Comparison = z.object({
  baselineRunId: z.string(),
  variantRunId: z.string(),
  deltas: z.object({
    goalCompleted: z.object({ baseline: z.boolean(), variant: z.boolean() }),
    interactionCount: z.object({ baseline: z.number(), variant: z.number() }),
    backtracks: z.object({ baseline: z.number(), variant: z.number() }),
    failedInteractions: z.object({ baseline: z.number(), variant: z.number() }),
    runtimeErrors: z.object({ baseline: z.number(), variant: z.number() }),
    findingReproduces: z.boolean(),
  }),
});
export type Comparison = z.infer<typeof Comparison>;

// ── Spec report (the deliverable) ───────────────────────────────────────────

export const SpecChange = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  findingId: z.string().optional(),
  krugPrinciple: KrugPrinciple.optional(),
  change: z.string(),
  rationale: z.string(),
  effort: z.enum(["S", "M", "L"]),
  evidencePaths: z.array(z.string()).default([]),
});
export type SpecChange = z.infer<typeof SpecChange>;

export const SpecReport = z.object({
  targetUrl: z.string().url(),
  goal: z.string(),
  generatedAt: z.string(),
  baselineRunIds: z.array(z.string()).default([]),
  summary: z.string(),
  changes: z.array(SpecChange),
  rebuildPhases: z.array(
    z.object({
      name: z.string(),
      goal: z.string(),
      items: z.array(z.string()),
    }),
  ),
});
export type SpecReport = z.infer<typeof SpecReport>;

// ── Intents + endpoints (RFX-style: Information / Quotation / Proposal) ────

export const IntentCategory = z.enum(["information", "quotation", "proposal"]);
export type IntentCategory = z.infer<typeof IntentCategory>;

export const EndpointClass = z.enum([
  "pricing",
  "signup",
  "demo-video",
  "contact-form",
  "docs-answers",
  "next-steps",
  "schedule-event",
  "download",
  "other",
]);
export type EndpointClass = z.infer<typeof EndpointClass>;

/** A destination a visitor wants to reach (pricing page, signup, video, form, answers…). */
export const SiteType = z.enum(["event", "saas", "commerce", "content"]);
export type SiteType = z.infer<typeof SiteType>;

export const Endpoint = z.object({
  endpointId: z.string(),
  class: EndpointClass,
  url: z.string().url(),
  label: z.string(),
  weight: z.number().min(0).max(1),
  /** Graph state that *is* the endpoint (when it was discovered as a page). */
  stateId: z.string().optional(),
  /** State + action a visitor uses to reach it (CTA, link, button). */
  sourceStateId: z.string().optional(),
  actionId: z.string().optional(),
  intent: z.array(IntentCategory),
});
export type Endpoint = z.infer<typeof Endpoint>;

export const IntentProfile = z.object({
  category: IntentCategory,
  goal: z.string(),
  targetEndpointClasses: z.array(EndpointClass),
  weightOverrides: z.partialRecord(EndpointClass, z.number().min(0).max(1)).default({}),
});
export type IntentProfile = z.infer<typeof IntentProfile>;

/** Seeded journey stats toward one endpoint: how often and how deep it is reached. */
export const EndpointJourney = z.object({
  endpointId: z.string(),
  trajectories: z.number().int().nonnegative(),
  goalReached: z.number().int().nonnegative(),
  medianSteps: z.number().nonnegative().optional(),
  /** Action labels along the shortest reaching path (the journey a visitor takes). */
  samplePath: z.array(z.string()).default([]),
});
export type EndpointJourney = z.infer<typeof EndpointJourney>;

/** A question a visitor is likely to have, and whether the site gives them a path to the answer. */
export const VisitorQuestion = z.object({
  questionId: z.string(),
  intent: IntentCategory,
  question: z.string(),
  expectedEndpointClasses: z.array(EndpointClass),
  answered: z.boolean(),
  answeredBy: z
    .object({ stateId: z.string(), url: z.string(), evidence: z.string() })
    .optional(),
  importance: z.number().min(0).max(1),
  /** Where the question came from: the checked-in bank, the site's own copy, or LLM refinement. */
  source: z.enum(["bank", "context", "llm"]).optional(),
  /** Answer keywords (LLM-proposed questions carry their own detector words). */
  keywords: z.array(z.string()).optional(),
});
export type VisitorQuestion = z.infer<typeof VisitorQuestion>;

// ── Activity feed (what the agent is doing, live) ───────────────────────────

/** Activity events stored per experiment are capped to the newest N. */
export const ACTIVITY_EVENT_LIMIT = 500;

export const ActivityKind = z.enum([
  "info",
  "fetch",
  "map",
  "decide",
  "browser",
  "assert",
  "finding",
  "error",
]);
export type ActivityKind = z.infer<typeof ActivityKind>;

/** One line of the live feed: an observable thing the agent did. */
export const ActivityEvent = z.object({
  ts: z.string(),
  /** Pipeline stage the event belongs to, or "run" for run-level failures. */
  stage: z.string(),
  kind: ActivityKind,
  message: z.string(),
  url: z.string().optional(),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

// ── Experiment ──────────────────────────────────────────────────────────────

export const ExperimentStatus = z.enum([
  "created",
  "discovering",
  "simulating",
  "verifying",
  "analyzing",
  "comparing",
  "complete",
  "failed",
]);

// Upper bounds on client-supplied budgets: the create route is public, so each one caps crawl, vendor and CPU cost.
export const EXPERIMENT_LIMITS = { maxStates: 50, maxDepth: 5, trajectories: 5000, verifyCount: 16 } as const;

export const ExperimentConfig = z.object({
  seed: z.number().int().default(1337),
  maxStates: z.number().int().positive().max(EXPERIMENT_LIMITS.maxStates).default(30),
  maxDepth: z.number().int().positive().max(EXPERIMENT_LIMITS.maxDepth).default(3),
  trajectories: z.number().int().positive().max(EXPERIMENT_LIMITS.trajectories).default(1000),
  verifyCount: z.number().int().positive().max(EXPERIMENT_LIMITS.verifyCount).default(8),
  viewports: z
    .array(z.enum(["desktop", "mobile"]))
    .max(2)
    .refine((v) => new Set(v).size === v.length, { message: "viewports must be distinct" })
    .default(["desktop", "mobile"]),
});
export type ExperimentConfig = z.infer<typeof ExperimentConfig>;

/** Experiment ids are generated as `exp_` + 8 hex chars; anything else never reaches storage. */
export const ExperimentId = z.string().regex(/^exp_[0-9a-f]{8}$/);
export type ExperimentId = z.infer<typeof ExperimentId>;

export function isExperimentId(id: unknown): id is ExperimentId {
  return ExperimentId.safeParse(id).success;
}

export const Experiment = z.object({
  id: z.string(),
  targetUrl: z.string().url(),
  goal: z.string(),
  status: ExperimentStatus,
  createdAt: z.string(),
  configuration: ExperimentConfig,
  assertions: z.array(Assertion).default([]),
  graph: StateGraph.optional(),
  simulations: z.array(Trajectory).default([]),
  browserTests: z.array(BrowserRun).default([]),
  findings: z.array(Finding).default([]),
  variants: z.array(Variant).default([]),
  comparisons: z.array(Comparison).default([]),
  spec: SpecReport.optional(),
  intents: z.array(IntentProfile).optional(),
  endpoints: z.array(Endpoint).optional(),
  journeys: z.array(EndpointJourney).optional(),
  questions: z.array(VisitorQuestion).optional(),
  errors: z.array(z.string()).default([]),
});
export type Experiment = z.infer<typeof Experiment>;

/** Headless live-site run digest written by scripts/run-site.ts to docs/runs/<host>/summary.json. */
export const SitePreflight = z.object({
  status: z.number().int().nullable(),
  finalUrl: z.string(),
  title: z.string(),
  blocked: z.boolean(),
  blockReason: z.string().optional(),
  error: z.string().optional(),
});
export type SitePreflight = z.infer<typeof SitePreflight>;

export const SiteRunSummary = z.object({
  site: z.string(),
  url: z.string().url(),
  targetUrl: z.string().url(),
  goal: z.string(),
  status: z.enum(["complete", "blocked", "disallowed", "timeout", "error"]),
  failureReason: z.string().optional(),
  error: z.string().optional(),
  runner: z.string(),
  config: z.object({
    maxStates: z.number().int(),
    trajectories: z.number().int(),
    verifyCount: z.number().int(),
    maxDepth: z.number().int(),
    viewports: z.array(Viewport.shape.name),
    seed: z.number().int(),
  }),
  preflight: SitePreflight,
  robotsAllowsTarget: z.boolean(),
  assertions: z.array(Assertion),
  discover: z.object({
    states: z.number().int(),
    edges: z.number().int(),
    pageFailures: z.number().int(),
    pageFailureSamples: z.array(z.object({ url: z.string().optional(), error: z.string().optional() })),
    urls: z.array(z.string()),
  }),
  simulate: z.object({
    trajectories: z.number().int(),
    goalReachPct: z.number(),
    outcomes: z.record(z.string(), z.number().int()),
  }),
  verify: z.object({
    runs: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    assertionsPassed: z.number().int(),
    runsWithConsoleErrors: z.number().int(),
    runErrors: z.array(z.string()),
  }),
  compare: Comparison.shape.deltas.nullable(),
  endpoints: z.object({
    intent: IntentCategory.optional(),
    total: z.number().int(),
    /** Per endpoint class: endpoints found vs. reached by at least one seeded journey. */
    byClass: z.partialRecord(EndpointClass, z.object({ found: z.number().int(), reached: z.number().int() })),
  }),
  findings: z.object({
    total: z.number().int(),
    bySeverity: z.record(z.string(), z.number().int()),
    byEvidence: z.record(z.string(), z.number().int()),
    titles: z.array(z.string()),
  }),
  durationsMs: z.record(z.string(), z.number()),
  ranAt: z.string(),
});
export type SiteRunSummary = z.infer<typeof SiteRunSummary>;

export * from "./browser";
export * from "./metrics";
export * from "./ports";
export * from "./ui";
export * from "./telemetry";
