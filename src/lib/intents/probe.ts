import { createHash } from "node:crypto";
import type { Endpoint, IntentCategory, SiteState, VisitorPersona } from "../contracts";
import { CLASS_GOAL, inferGoals } from "../rebuild/goals";
import { siteName } from "./classify";
import { discoverEndpoints } from "./endpoints";
import { CLASS_INTENTS } from "./patterns";

const INTENT_ORDER: IntentCategory[] = ["information", "quotation", "proposal"];
export const MAX_PROBE_PERSONAS = 3;

/** Persona archetypes by RFX intent — the three ways a visitor approaches a site. */
const PERSONA_BANK: Record<IntentCategory, { name: string; summary: string }> = {
  information: {
    name: "Info-seeker",
    summary: "Wants to understand what the site offers and find answers fast.",
  },
  quotation: {
    name: "Quote-comparer",
    summary: "Comparing prices, plans or quotes before committing.",
  },
  proposal: {
    name: "Ready-to-act",
    summary: "Ready to sign up, register, buy or get in touch.",
  },
};

/** Persona goal when no discovered endpoint class has a phrasing of its own. */
const GENERIC_GOAL: Record<IntentCategory, string> = {
  information: "Learn what {name} offers",
  quotation: "Find out what it costs",
  proposal: "Sign up or get in touch",
};

function clean(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Build one persona from the endpoints (weight-sorted) that serve its intent category. */
function personaFor(category: IntentCategory, matched: Endpoint[], name: string): VisitorPersona {
  const bank = PERSONA_BANK[category];
  const classes = [...new Set(matched.map((e) => e.class))];
  return {
    personaId: `per_${createHash("sha1").update(category).digest("hex").slice(0, 8)}`,
    name: bank.name,
    summary: bank.summary,
    goal: (matched[0] ? CLASS_GOAL[matched[0].class]?.goal : undefined) ?? GENERIC_GOAL[category].replace("{name}", name),
    intent: category,
    targetEndpointClasses: classes,
    signals: [...new Set(matched.map((e) => clean(e.label)).filter(Boolean))].slice(0, 3),
  };
}

/**
 * First-page probe: derive the experiment goal and up to three visitor personas
 * from the start page's own CTAs, nav items, endpoint classes and title.
 * Runs the rebuild goal-inference machinery with no experiment goal (implied
 * candidates are site-type priors only — a page offering no real signal falls
 * back to "Learn what {site} offers"), then maps each RFX intent category onto
 * a persona whenever the site exposes endpoint classes serving it. A page with
 * no classified surface still yields a single Info-seeker. Deterministic per page.
 */
export function inferGoalAndPersonas(state: SiteState): { goal: string; personas: VisitorPersona[] } {
  const graph = { states: [state], edges: [] };
  const endpoints = discoverEndpoints(graph);
  const goals = inferGoals({ goal: "", graph, endpoints });
  const name = siteName(graph);
  const goal = goals.find((g) => g.source !== "implied")?.goal ?? `Learn what ${name} offers`;

  const personas = INTENT_ORDER.map((category) => ({
    category,
    matched: endpoints.filter((e) => CLASS_INTENTS[e.class].includes(category)),
  }))
    .filter((p) => p.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.reduce((s, e) => s + e.weight, 0) - a.matched.reduce((s, e) => s + e.weight, 0) ||
        INTENT_ORDER.indexOf(a.category) - INTENT_ORDER.indexOf(b.category),
    )
    .slice(0, MAX_PROBE_PERSONAS)
    .map((p) => personaFor(p.category, p.matched, name));

  if (personas.length === 0) personas.push(personaFor("information", [], name));
  return { goal, personas };
}
