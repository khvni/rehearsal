import { z } from "zod";

// ── Leaf primitives ─────────────────────────────────────────────────────────
// No imports from ./index — bench.ts and other domain files build on these.

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

export const ExperimentConfig = z.object({
  seed: z.number().int().default(1337),
  maxStates: z.number().int().positive().default(30),
  maxDepth: z.number().int().positive().default(3),
  trajectories: z.number().int().positive().default(1000),
  verifyCount: z.number().int().positive().default(8),
  viewports: z.array(z.enum(["desktop", "mobile"])).default(["desktop", "mobile"]),
});
export type ExperimentConfig = z.infer<typeof ExperimentConfig>;
