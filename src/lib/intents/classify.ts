import type { EndpointClass, IntentCategory, IntentProfile, SiteType, StateGraph } from "../contracts";
import type { LlmClient } from "../analysis/gemini";
import { detectSiteType } from "./endpoints";

const QUOTATION =
  /\b(pric(e|es|ing)|cost|costs|quote|plans?|how much|fees?|rates?|budget|tiers?|discount|afford)\b/g;
const PROPOSAL =
  /\b(sign ?up|register|registration|apply|join|contact|sales|book|buy|purchase|subscribe|trial|get started|submit|enroll|rsvp|hire|partner|sponsor|order|checkout|attend|request)\b/g;
const INFORMATION =
  /\b(what|how|why|when|where|who|learn|understand|find|schedule|agenda|docs|faq|read|watch|about|answers?|see|explore|browse)\b/g;

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;

/**
 * Deterministic goal → RFX intent. Quotation/proposal verbs outweigh generic
 * information verbs ("find pricing" is quotation, not information); ties and
 * no-signal goals default to information.
 */
export function classifyGoal(goal: string): IntentCategory {
  const g = goal.toLowerCase();
  const q = count(QUOTATION, g) * 2;
  const p = count(PROPOSAL, g) * 2;
  const i = count(INFORMATION, g);
  if (q === 0 && p === 0) return "information";
  if (q >= p) return q >= i ? "quotation" : "information";
  return p >= i ? "proposal" : "information";
}

const GOAL_CLASS_PATTERNS: readonly (readonly [EndpointClass, RegExp])[] = [
  ["pricing", /\b(pric(e|es|ing)|cost|quote|plans?|how much|fees?|rates?|tiers?)\b/],
  ["signup", /\b(sign ?up|register|registration|apply|join|enroll|rsvp|get started|create an account|trial|tickets?|attend)\b/],
  ["contact-form", /\b(contact|sales|get in touch|sponsor|partner|request a (demo|quote))\b/],
  ["schedule-event", /\b(schedule|agenda|program(me)?|sessions?|talks|timetable|calendar|events?|lineup)\b/],
  ["demo-video", /\b(video|watch|demo|recordings?|livestream|webinar)\b/],
  ["docs-answers", /\b(docs|documentation|faq|help|support|answers?|guide|how (do|does|to))\b/],
  ["download", /\b(download|install)\b/],
  ["next-steps", /\b(next steps?|newsletter|subscribe|updates)\b/],
];

/** Endpoint classes a goal is aiming at ("find the conference schedule" → schedule-event). */
export function goalTargetClasses(goal: string): EndpointClass[] {
  const g = goal.toLowerCase();
  return GOAL_CLASS_PATTERNS.filter(([, re]) => re.test(g)).map(([cls]) => cls);
}

/**
 * Optional LLM refinement (fast model). Any failure, or the keyless fixture
 * client, falls back to the deterministic classifier.
 */
export async function classifyGoalWithLlm(goal: string, llm?: LlmClient): Promise<IntentCategory> {
  const fallback = classifyGoal(goal);
  if (!llm || llm.name === "gemini-fixture") return fallback;
  try {
    const raw = await llm.complete(
      `Classify this website-visitor goal into one RFX intent category.
information = wants to learn/understand/find answers; quotation = wants prices, plans, costs or a quote;
proposal = wants to commit: sign up, apply, register, buy, contact sales.
GOAL: ${goal}
Return INTENT_CATEGORY as JSON {"category": "information"|"quotation"|"proposal"}.`,
      { json: true },
    );
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as { category?: string };
    if (parsed.category === "information" || parsed.category === "quotation" || parsed.category === "proposal") {
      return parsed.category;
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

/** Intent profile for the experiment's own goal; its target classes are boosted to full weight. */
export function intentForGoal(goal: string, category: IntentCategory = classifyGoal(goal)): IntentProfile {
  const targetEndpointClasses = goalTargetClasses(goal);
  return {
    category,
    goal,
    targetEndpointClasses,
    weightOverrides: Object.fromEntries(targetEndpointClasses.map((c) => [c, 1])),
  };
}

/** Short site name from the start page title ("Acme — Pricing that scales" → "Acme"). */
export function siteName(graph: StateGraph): string {
  const start = graph.states[0];
  if (!start) return "this site";
  const title = start.pageTitle && start.pageTitle !== start.url ? start.pageTitle : new URL(start.url).hostname;
  return title.split(/\s[|:–—·-]\s|:\s/)[0].trim().slice(0, 60) || new URL(start.url).hostname;
}

const DEFAULT_GOALS: Record<SiteType, Record<IntentCategory, [string, EndpointClass[]]>> = {
  event: {
    information: ["find the schedule for {name}", ["schedule-event", "docs-answers"]],
    quotation: ["find ticket prices for {name}", ["pricing"]],
    proposal: ["apply or register to attend {name}", ["signup", "contact-form"]],
  },
  saas: {
    information: ["understand what {name} does", ["docs-answers", "demo-video"]],
    quotation: ["find pricing for {name}", ["pricing", "contact-form"]],
    proposal: ["sign up or contact sales at {name}", ["signup", "contact-form"]],
  },
  commerce: {
    information: ["learn about the products at {name}", ["docs-answers", "demo-video"]],
    quotation: ["find prices at {name}", ["pricing"]],
    proposal: ["buy or check out at {name}", ["signup", "next-steps"]],
  },
  content: {
    information: ["find answers on {name}", ["docs-answers", "demo-video"]],
    quotation: ["find pricing or plans for {name}", ["pricing"]],
    proposal: ["subscribe to or get in touch with {name}", ["next-steps", "contact-form", "signup"]],
  },
};

/** One default goal per RFX category, tailored to the detected site type. */
export function defaultIntentsForSite(graph: StateGraph): IntentProfile[] {
  const type = detectSiteType(graph);
  const name = siteName(graph);
  return (["information", "quotation", "proposal"] as const).map((category) => {
    const [tpl, targets] = DEFAULT_GOALS[type][category];
    return { category, goal: tpl.replace("{name}", name), targetEndpointClasses: targets, weightOverrides: {} };
  });
}
