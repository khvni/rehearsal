import { z } from "zod";

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

export const ExperimentConfig = z.object({
  seed: z.number().int().default(1337),
  maxStates: z.number().int().positive().default(30),
  maxDepth: z.number().int().positive().default(3),
  trajectories: z.number().int().positive().default(1000),
  verifyCount: z.number().int().positive().default(8),
  viewports: z.array(z.enum(["desktop", "mobile"])).default(["desktop", "mobile"]),
});
export type ExperimentConfig = z.infer<typeof ExperimentConfig>;

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
