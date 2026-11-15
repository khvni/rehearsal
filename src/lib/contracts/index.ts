import { z } from "zod";
import { RunFailure } from "./errors";
import { PageMetrics } from "./metrics";

export * from "./base";
import {
  EndpointClass,
  EXPERIMENT_LIMITS,
  ExperimentConfig,
  IntentCategory,
  RubricDimension,
  UsabilityPrinciple,
  Severity,
  normalizePrincipleFields,
} from "./base";

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

// ── Rebuild: brand extraction ───────────────────────────────────────────────

/** Design signals lifted from one crawled page: declared values from markup plus
 * computed styles when a live browser captured them. */
export const BrandSignals = z.object({
  /** `:root` custom properties (`--brand: #fff`), merged declared + computed. */
  cssVars: z.record(z.string(), z.string()).default({}),
  /** Color values found on the page, most frequent first (declared or computed). */
  colors: z.array(z.string()).default([]),
  /** font-family stacks found, most frequent first. */
  fonts: z.array(z.string()).default([]),
  faviconUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  logoAlt: z.string().optional(),
  /** meta[name=theme-color]. */
  themeColor: z.string().optional(),
  /** og:site_name / application-name / title-derived site name. */
  siteName: z.string().optional(),
  /** Primary nav/header links: label + resolved href. */
  navItems: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
});
export type BrandSignals = z.infer<typeof BrandSignals>;

/** The audited site's design language, rolled up across its crawled states. */
export const BrandProfile = z.object({
  name: z.string(),
  colors: z.object({
    ink: z.string(),
    surface: z.string(),
    muted: z.string(),
    line: z.string(),
    accent: z.string().optional(),
    link: z.string().optional(),
  }),
  fonts: z.object({ sans: z.string(), mono: z.string().optional() }),
  cssVars: z.record(z.string(), z.string()).default({}),
  faviconUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  logoAlt: z.string().optional(),
  navItems: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
  /** CTA labels as the site phrases them ("Apply to attend"), for on-brand buttons. */
  ctaLabels: z.array(z.string()).default([]),
  /** Copy voice, inferred from crawled text. */
  tone: z.enum(["playful", "professional", "technical", "minimal", "expressive"]),
  voiceNotes: z.array(z.string()).default([]),
});
export type BrandProfile = z.infer<typeof BrandProfile>;

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
  /** Design signals captured with the page (declared + computed). */
  brand: BrandSignals.optional(),
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
  /** Emergent-journey outcome: the agent chose to abandon the goal (persona swarm). */
  "dropped-off",
]);
export type TrajectoryOutcome = z.infer<typeof TrajectoryOutcome>;

/** Visitor persona kinds; derived from the intents the site offers (RFX categories). */
export const PersonaKind = z.enum(["info-seeker", "quotation-checker", "proposal-comparer"]);
export type PersonaKind = z.infer<typeof PersonaKind>;

export const Trajectory = z.object({
  trajectoryId: z.string(),
  seed: z.number().int(),
  profile: BehavioralProfile,
  /** Set when the trajectory was produced by a persona agent (swarm mode). */
  persona: PersonaKind.optional(),
  steps: z.array(TrajectoryStep),
  outcome: TrajectoryOutcome,
  backtracks: z.number().int().nonnegative(),
  riskScore: z.number().optional(),
});
export type Trajectory = z.infer<typeof Trajectory>;

// ── Persona swarm ───────────────────────────────────────────────────────────

/** Why a persona agent stopped before reaching the goal. */
export const DropOffReason = z.enum([
  /** Page offered no actionable candidates. */
  "dead-end",
  /** Agent hit maxStepsPerAgent without reaching the goal. */
  "max-steps",
  /** Agent kept revisiting the same states (repetition cap). */
  "going-in-circles",
  /** Repeated navigation/action failures. */
  "error",
  /** Nothing on the page looked relevant to the persona's goal. */
  "nothing-promising",
  /** Page was confusing enough that the persona gave up. */
  "confused",
  /** Persona lost interest before reaching the goal. */
  "lost-interest",
]);
export type DropOffReason = z.infer<typeof DropOffReason>;

/** One step in an agent's journey: the page it landed on and the action it took to leave it. */
export const AgentStep = z.object({
  /** Content-derived hash — matches discovered State.stateHash when the page was crawled. */
  stateHash: z.string(),
  url: z.string(),
  title: z.string(),
  /** The action the agent took to leave this step (absent on the final step). */
  action: z
    .object({
      actionId: z.string().optional(),
      label: z.string(),
      href: z.string().optional(),
      role: z.string().optional(),
    })
    .optional(),
  ok: z.boolean().optional(),
  error: z.string().optional(),
});
export type AgentStep = z.infer<typeof AgentStep>;

/** Where and why an agent abandoned; the first-class result the swarm exists to produce. */
export const AgentDropOff = z.object({
  reason: DropOffReason,
  /** Index into `steps` of the state where the agent gave up. */
  atStep: z.number().int().nonnegative(),
  stateHash: z.string(),
  url: z.string(),
  screenshotPath: z.string().optional(),
});
export type AgentDropOff = z.infer<typeof AgentDropOff>;

export const AgentJourney = z.object({
  agentId: z.string(),
  persona: PersonaKind,
  seed: z.number().int(),
  steps: z.array(AgentStep),
  outcome: z.enum(["goal-reached", "dropped-off"]),
  dropOff: AgentDropOff.optional(),
  /** Times the agent revisited an already-seen stateHash. */
  backtracks: z.number().int().nonnegative().default(0),
});
export type AgentJourney = z.infer<typeof AgentJourney>;

export const PersonaSwarm = z.object({
  seed: z.number().int(),
  viewport: z.string(),
  agents: z.number().int().nonnegative(),
  /** Persona -> number of agents assigned. */
  personaMix: z.record(z.string(), z.number().int().nonnegative()),
  journeys: z.array(AgentJourney),
  /** Drop-off reason -> agent count. */
  dropOffDistribution: z.record(z.string(), z.number().int().nonnegative()),
  /** stateHash -> number of agent steps that visited it (journey popularity heat). */
  stateVisits: z.record(z.string(), z.number().int().nonnegative()),
  /** Agent ids of the most-travelled journeys (highest cumulative state popularity). */
  mostTravelled: z.array(z.string()),
  /** Agent ids of journeys ending at the most common drop-off states. */
  mostDropped: z.array(z.string()),
});
export type PersonaSwarm = z.infer<typeof PersonaSwarm>;

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

// Stored records predate the rename: `krugPrinciple` and older slugs normalize forward.
export const Finding = z.preprocess(
  normalizePrincipleFields,
  z.object({
    findingId: z.string(),
    title: z.string(),
    category: RubricDimension,
    severity: Severity,
    evidenceType: EvidenceType,
    description: z.string(),
    affectedStates: z.array(z.string()),
    affectedActions: z.array(z.string()).default([]),
    evidencePaths: z.array(z.string()).default([]),
    recommendation: z.string(),
    verificationStatus: z.enum(["verified", "reproduced", "unverified"]),
    principle: UsabilityPrinciple,
  }),
);
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

export const SpecChange = z.preprocess(
  normalizePrincipleFields,
  z.object({
    rank: z.number().int().positive(),
    title: z.string(),
    findingId: z.string().optional(),
    principle: UsabilityPrinciple.optional(),
    change: z.string(),
    /** Ordered concrete edits applying this change — names the control or page it lands on. */
    steps: z.array(z.string()).default([]),
    rationale: z.string(),
    effort: z.enum(["S", "M", "L"]),
    evidencePaths: z.array(z.string()).default([]),
  }),
);
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

/** A visitor archetype inferred from a first-page probe: who shows up and what they came to do. */
export const VisitorPersona = z.object({
  /** Stable id derived from the persona's intent category (deterministic across runs). */
  personaId: z.string(),
  /** Display name ("Info-seeker"). */
  name: z.string(),
  /** One line on who this visitor is and how they decide. */
  summary: z.string(),
  /** Visitor-phrased goal this persona pursues. */
  goal: z.string(),
  /** RFX intent category the persona maps to. */
  intent: IntentCategory,
  /** Endpoint classes the site actually exposes that this persona is aiming at. */
  targetEndpointClasses: z.array(EndpointClass).default([]),
  /** Crawled labels (CTAs, nav items, endpoints) the persona was inferred from. */
  signals: z.array(z.string()).default([]),
});
export type VisitorPersona = z.infer<typeof VisitorPersona>;

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

// ── Rebuild: goals + generated pages ────────────────────────────────────────

/** One plausible visitor goal inferred from the crawled site's own CTAs/nav/titles/endpoints. */
export const RebuildGoal = z.object({
  /** Stable id derived from the slug (deterministic across runs). */
  goalId: z.string(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),
  goal: z.string(),
  /** What the inference came from: an explicit CTA, a nav item, a page title, an endpoint class, or site-type defaults. */
  source: z.enum(["experiment-goal", "cta", "nav", "endpoint", "title", "implied"]),
  endpointClass: EndpointClass.optional(),
  /** Best-matching real destination on the audited site. */
  targetUrl: z.string().optional(),
  /** The crawled label this goal was inferred from. */
  sourceLabel: z.string().optional(),
  weight: z.number().min(0).max(1),
});
export type RebuildGoal = z.infer<typeof RebuildGoal>;

/**
 * Structured content for one rebuilt page — the shape Gemini returns and the
 * deterministic template falls back to. The renderer escapes every field.
 */
export interface RebuildPageContent {
  hero: {
    heading: string;
    lede: string;
    ctaLabel: string;
    /** Absolute URL on the audited site the rebuilt CTA leads to. */
    ctaUrl: string;
    /** Small status line next to the CTA ("Applications are open"). */
    statusLine?: string;
  };
  sections: {
    heading: string;
    body?: string;
    bullets?: string[];
    links?: { label: string; url: string }[];
  }[];
  nav: { label: string; url: string }[];
  footer?: { note?: string; links?: { label: string; url: string }[] };
}

/** One self-contained rebuilt page: inline styles, no external scripts, images only from the audited origin. */
export const RebuiltPage = z.object({
  slug: z.string(),
  goal: z.string(),
  title: z.string(),
  /** One line on what changed vs the audited page. */
  summary: z.string(),
  html: z.string(),
  /** Who produced the page content: Gemini or the deterministic template. */
  source: z.enum(["gemini", "template"]),
  bytes: z.number().int().nonnegative(),
});
export type RebuiltPage = z.infer<typeof RebuiltPage>;

/** The rebuild stage's deliverable, stored on the experiment record. */
export const RebuildResult = z.object({
  generatedAt: z.string(),
  brand: BrandProfile,
  goals: z.array(RebuildGoal),
  pages: z.array(RebuiltPage),
  /** LLM adapter name actually used ("gemini", "gemini-fixture"…). */
  llm: z.string(),
});
export type RebuildResult = z.infer<typeof RebuildResult>;

// ── Usage accounting (per-run model calls + tokens) ──────────────────────────

/** Call/token totals for one model provider. `estimated` marks byte-derived
 * estimates (chars/4) when the provider reports no usage metadata. */
export const TokenUsage = z.object({
  calls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  estimated: z.boolean().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

/** Per-run model usage, stamped onto the experiment record at each save. */
export const UsageReport = z.object({
  llm: TokenUsage.optional(),
  jev: TokenUsage.optional(),
});
export type UsageReport = z.infer<typeof UsageReport>;

// ── Spec-applied mockup (preview routes) ────────────────────────────────────

/** One self-contained mockup page stored on the experiment; served raw under /experiments/{id}/preview/. */
export const MockupPage = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  sourceUrl: z.string().url(),
  title: z.string(),
  summary: z.string(),
  /** Full HTML document; already sanitized — no scripts, no external resources. */
  html: z.string(),
  source: z.enum(["gemini", "template"]),
  bytes: z.number().int().nonnegative(),
});
export type MockupPage = z.infer<typeof MockupPage>;

export const MockupResult = z.object({
  generatedAt: z.string(),
  brand: BrandProfile,
  pages: z.array(MockupPage),
  /** LLM adapter name actually used ("gemini", "gemini-fixture"…). */
  llm: z.string(),
});
export type MockupResult = z.infer<typeof MockupResult>;

// ── Experiment ──────────────────────────────────────────────────────────────

export const ExperimentStatus = z.enum([
  "created",
  /** Run accepted; waiting for a pipeline slot or just kicked off as a background job. */
  "queued",
  "discovering",
  "simulating",
  "verifying",
  "analyzing",
  "comparing",
  "rebuilding",
  "complete",
  "failed",
]);

// EXPERIMENT_LIMITS + ExperimentConfig live in base.ts (re-exported above).
/** Experiment ids are generated as `exp_` + 8 hex chars; anything else never reaches storage. */
export const ExperimentId = z.string().regex(/^exp_[0-9a-f]{8}$/);
export type ExperimentId = z.infer<typeof ExperimentId>;

export function isExperimentId(id: unknown): id is ExperimentId {
  return ExperimentId.safeParse(id).success;
}

// Stored experiments may predate EXPERIMENT_LIMITS: accept them, but clamp so a re-run stays bounded.
const StoredExperimentConfig = z
  .object({
    ...ExperimentConfig.shape,
    maxStates: z.number().int().positive().default(30),
    maxDepth: z.number().int().positive().default(3),
    trajectories: z.number().int().positive().default(1000),
    verifyCount: z.number().int().positive().default(8),
    maxAgents: z.number().int().positive().default(200),
    maxStepsPerAgent: z.number().int().positive().default(12),
    maxConcurrentAgents: z.number().int().positive().default(10),
    viewports: z.array(z.enum(["desktop", "mobile"])).default(["desktop", "mobile"]),
  })
  .transform((c): ExperimentConfig => ({
    ...c,
    maxStates: Math.min(c.maxStates, EXPERIMENT_LIMITS.maxStates),
    maxDepth: Math.min(c.maxDepth, EXPERIMENT_LIMITS.maxDepth),
    trajectories: Math.min(c.trajectories, EXPERIMENT_LIMITS.trajectories),
    verifyCount: Math.min(c.verifyCount, EXPERIMENT_LIMITS.verifyCount),
    maxAgents: Math.min(c.maxAgents, EXPERIMENT_LIMITS.maxAgents),
    maxStepsPerAgent: Math.min(c.maxStepsPerAgent, EXPERIMENT_LIMITS.maxStepsPerAgent),
    maxConcurrentAgents: Math.min(c.maxConcurrentAgents, EXPERIMENT_LIMITS.maxConcurrentAgents),
    viewports: [...new Set(c.viewports)],
  }));

/** Serialized mid-crawl state — enough to rebuild the graph and continue the frontier after a suspended step. */
export const DiscoverCheckpoint = z.object({
  /** Index into `configuration.viewports` of the pass in flight. */
  vpIndex: z.number().int().nonnegative(),
  frontier: z.array(
    z.object({
      url: z.string(),
      depth: z.number().int().nonnegative(),
      from: z.object({ stateId: z.string(), actionId: z.string() }).optional(),
    }),
  ),
  attempted: z.array(z.string()),
  /** url -> canonical stateId */
  visited: z.array(z.tuple([z.string(), z.string()])),
  states: z.array(SiteState),
  edges: z.array(z.object({ fromStateId: z.string(), actionId: z.string(), toStateId: z.string() })),
  pageFailures: z.array(RunFailure),
  providerQuotaHit: z.boolean(),
  /** Crawl finished — still pending signature probes (urls), or the already-computed results. */
  signaturePending: z.array(z.string()).optional(),
  signatureDone: z.array(z.object({ url: z.string(), signature: z.string() })).default([]),
});
export type DiscoverCheckpoint = z.infer<typeof DiscoverCheckpoint>;

/** Where a chunked run resumes: the stage to (re)start, how many step slices it has consumed, and discover's crawl state when suspended mid-stage. */
export const RunCheckpoint = z.object({
  stage: z.string(),
  /** Slices consumed on `stage` — bounded by MAX_STAGE_SLICES so a stage that can't finish fails instead of looping. */
  attempt: z.number().int().nonnegative().default(0),
  discover: DiscoverCheckpoint.optional(),
});
export type RunCheckpoint = z.infer<typeof RunCheckpoint>;

export const Experiment = z.object({
  id: z.string(),
  targetUrl: z.string().url(),
  goal: z.string(),
  /** Where `goal` came from: the request, a first-page probe's inference, or a generic default when the probe failed. */
  goalSource: z.enum(["user", "inferred", "default"]).default("user"),
  /** Visitor personas derived from the probed first page; empty when the caller supplied the goal or the probe failed. */
  personas: z.array(VisitorPersona).default([]),
  status: ExperimentStatus,
  createdAt: z.string(),
  /** Dedupe key of `targetUrl`: lowercase host, no hash, no tracking params (utm_ and click ids), no trailing slash. */
  siteKey: z.string().default(""),
  /** Client-supplied dedupe key (Idempotency-Key header or `idempotencyKey` body field); a repeat returns this record. */
  idempotencyKey: z.string().optional(),
  /** Per-page content signatures captured by discover — rescan re-probes these URLs and compares. */
  siteSignatures: z.array(z.object({ url: z.string(), signature: z.string() })).default([]),
  /** Per-run token a `POST /api/internal/run-step` call must present — regenerated at each `scheduleRun`. */
  runToken: z.string().optional(),
  /** Origin the run was scheduled from — run-step hops target it (or `REHEARSAL_ORIGIN` when pinned), never the current request's Host. */
  runOrigin: z.string().optional(),
  /** Persisted progress for a suspended background run — run-step continuations and stale-run resume pick up here. */
  runCheckpoint: RunCheckpoint.optional(),
  configuration: StoredExperimentConfig,
  assertions: z.array(Assertion).default([]),
  graph: StateGraph.optional(),
  simulations: z.array(Trajectory).default([]),
  /** Persona-swarm results (emergent journeys). Absent when the runner fell back to seeded sampling. */
  swarm: PersonaSwarm.optional(),
  browserTests: z.array(BrowserRun).default([]),
  findings: z.array(Finding).default([]),
  variants: z.array(Variant).default([]),
  comparisons: z.array(Comparison).default([]),
  spec: SpecReport.optional(),
  intents: z.array(IntentProfile).optional(),
  endpoints: z.array(Endpoint).optional(),
  journeys: z.array(EndpointJourney).optional(),
  questions: z.array(VisitorQuestion).optional(),
  rebuild: RebuildResult.optional(),
  usage: UsageReport.optional(),
  mockup: MockupResult.optional(),
  errors: z.array(z.string()).default([]),
  /** Structured, coded form of each failure (page loads, stage errors); `errors` keeps the readable lines. */
  failures: z.array(RunFailure).default([]),
});
export type Experiment = z.infer<typeof Experiment>;

/** Result of POST /api/experiments/:id/rescan — what the content check found and whether a re-run kicked. */
export const RescanReport = z.object({
  /** At least one probed page's signature differs from the stored one, or a page no longer loads. */
  changed: z.boolean(),
  /** Pages compared (fresh probe vs stored signature). */
  checked: z.number().int().nonnegative(),
  /** Probed URLs whose signature changed or that no longer load. */
  mismatches: z.array(z.string()),
  /** A different goal was supplied — goal-derived artifacts regenerate on the kept graph. */
  goalChanged: z.boolean(),
  /** A background run was kicked (changed || goalChanged). */
  restarted: z.boolean(),
  note: z.string().optional(),
});
export type RescanReport = z.infer<typeof RescanReport>;

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

export * from "./bench";
export * from "./browser";
export * from "./errors";
export * from "./metrics";
export * from "./ports";
export * from "./sandbox";
export * from "./ui";
export * from "./telemetry";
