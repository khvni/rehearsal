import { z } from "zod";

// ── Leaf primitives ─────────────────────────────────────────────────────────
// No imports from ./index — bench.ts and other domain files build on these.

export const RubricDimension = z.enum([
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
export type RubricDimension = z.infer<typeof RubricDimension>;

export const RUBRIC_DIMENSIONS = RubricDimension.options;

export const UsabilityPrinciple = z.enum([
  "dont-make-users-think",
  "people-scan-they-dont-read",
  "familiar-conventions",
  "obvious-choices",
  "cut-needless-words",
  "where-you-are",
  "homepage-explains-itself",
  "search-and-browse",
  "test-dont-argue",
]);
export type UsabilityPrinciple = z.infer<typeof UsabilityPrinciple>;

/** Plain-language name + one-line summary per principle — the only wording a user ever sees. */
export const USABILITY_PRINCIPLES: Record<UsabilityPrinciple, { title: string; summary: string }> = {
  "dont-make-users-think": {
    title: "Don't make users think",
    summary: "A page should explain itself. Every question a visitor has to stop and answer adds friction.",
  },
  "people-scan-they-dont-read": {
    title: "People scan, they don't read",
    summary: "Visitors glance and pick the first reasonable option, so hierarchy and clickable things must be obvious at a glance.",
  },
  "familiar-conventions": {
    title: "Follow familiar conventions",
    summary: "Use patterns people already know from other sites; innovate only when the new idea clearly beats the convention.",
  },
  "obvious-choices": {
    title: "Make every choice obvious",
    summary: "Each click should be an unambiguous, confident choice — the effort each step takes matters more than the number of clicks.",
  },
  "cut-needless-words": {
    title: "Cut needless words",
    summary: "Cut half the words, then half again. No welcome blather, no instructions nobody reads.",
  },
  "where-you-are": {
    title: "Always show where you are",
    summary: "Any page should answer at a glance: what site this is, what page you're on, the major sections, and how to search.",
  },
  "homepage-explains-itself": {
    title: "The homepage explains itself",
    summary: "The homepage answers in one glance: what this is, what's here, and what to do next.",
  },
  "search-and-browse": {
    title: "Serve both searchers and browsers",
    summary: "Some visitors search, some browse — a visible search plus a browsable hierarchy, never one without the other.",
  },
  "test-dont-argue": {
    title: "Test, don't argue",
    summary: "Check what visitors actually do instead of debating what users like.",
  },
};

/** Slugs used before the plain-language rename; stored records written against them still parse. */
export const LEGACY_PRINCIPLES: Record<string, UsabilityPrinciple> = {
  "dont-make-me-think": "dont-make-users-think",
  "scanning-not-reading": "people-scan-they-dont-read",
  conventions: "familiar-conventions",
  "mindless-choices": "obvious-choices",
  "omit-words": "cut-needless-words",
  navigation: "where-you-are",
  homepage: "homepage-explains-itself",
  "farmers-and-cowmen": "search-and-browse",
  "testing-beats-arguing": "test-dont-argue",
};

/** Rewrite a stored finding/spec-change to the current field name and slugs (`krugPrinciple` → `principle`). */
export function normalizePrincipleFields(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  if (o.principle === undefined && typeof o.krugPrinciple === "string") o.principle = o.krugPrinciple;
  delete o.krugPrinciple;
  if (typeof o.principle === "string") o.principle = LEGACY_PRINCIPLES[o.principle] ?? o.principle;
  return o;
}

export const Severity = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof Severity>;

/** A destination a visitor wants to reach (pricing page, signup, video, form, answers…). */
export const SiteType = z.enum(["event", "saas", "commerce", "content"]);
export type SiteType = z.infer<typeof SiteType>;

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

// Upper bounds on client-supplied budgets: the create route is public, so each one caps crawl, vendor and CPU cost.
export const EXPERIMENT_LIMITS = {
  maxStates: 50,
  maxDepth: 5,
  trajectories: 5000,
  verifyCount: 16,
  maxAgents: 500,
  maxStepsPerAgent: 25,
  maxConcurrentAgents: 50,
} as const;

export const ExperimentConfig = z.object({
  seed: z.number().int().default(1337),
  maxStates: z.number().int().positive().max(EXPERIMENT_LIMITS.maxStates).default(30),
  maxDepth: z.number().int().positive().max(EXPERIMENT_LIMITS.maxDepth).default(3),
  trajectories: z.number().int().positive().max(EXPERIMENT_LIMITS.trajectories).default(1000),
  verifyCount: z.number().int().positive().max(EXPERIMENT_LIMITS.verifyCount).default(8),
  /** Persona swarm bounds — each agent is one browser session on the Browserbase Function. */
  maxAgents: z.number().int().positive().max(EXPERIMENT_LIMITS.maxAgents).default(200),
  maxStepsPerAgent: z.number().int().positive().max(EXPERIMENT_LIMITS.maxStepsPerAgent).default(12),
  maxConcurrentAgents: z.number().int().positive().max(EXPERIMENT_LIMITS.maxConcurrentAgents).default(10),
  viewports: z
    .array(z.enum(["desktop", "mobile"]))
    .max(2)
    .refine((v) => new Set(v).size === v.length, { message: "viewports must be distinct" })
    .default(["desktop", "mobile"]),
});
export type ExperimentConfig = z.infer<typeof ExperimentConfig>;
