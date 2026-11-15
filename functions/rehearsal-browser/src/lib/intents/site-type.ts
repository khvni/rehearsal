import type { SiteType, StateGraph } from "../contracts";

const SITE_SIGNALS: readonly (readonly [SiteType, RegExp])[] = [
  ["event", /\b(schedule|agenda|speakers?|venue|tickets?|conference|summit|keynote|sessions?|attend|workshops?)\b/g],
  ["saas", /\b(pricing|free trial|sign ?up|log ?in|dashboard|api|integrations?|platform|book a demo|docs|teams?)\b/g],
  ["commerce", /(\$\s?\d|€\s?\d|£\s?\d)|\b(add to cart|checkout|cart|buy|shop|per month|free shipping|in stock)\b/g],
  ["content", /\b(blog|articles?|posts?|newsletter|podcast|episodes?|stories)\b/g],
];

/** Count of site-type signals across page text + action labels. */
export function siteSignals(graph: StateGraph): Record<SiteType, number> {
  const hay = graph.states
    .map((s) => `${s.pageTitle}\n${s.visibleText}\n${s.actions.map((a) => a.label).join("\n")}`)
    .join("\n")
    .toLowerCase();
  return Object.fromEntries(SITE_SIGNALS.map(([t, re]) => [t, hay.match(re)?.length ?? 0])) as Record<SiteType, number>;
}

/** Deterministic site type: strongest signal wins; ties resolve in SITE_SIGNALS order; weak → content. */
export function detectSiteType(graph: StateGraph): SiteType {
  const counts = siteSignals(graph);
  let best: SiteType = "content";
  let bestN = 2;
  for (const [t] of SITE_SIGNALS) {
    if (counts[t] > bestN) {
      best = t;
      bestN = counts[t];
    }
  }
  return best;
}
