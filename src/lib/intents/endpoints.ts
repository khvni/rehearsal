import { createHash } from "node:crypto";
import type { Assertion, Endpoint, EndpointClass, IntentProfile, SiteState, SiteType, StateGraph } from "../contracts";
import { CLASS_INTENTS, classifyAction, classifyText, pathWords } from "./patterns";


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
  return Object.fromEntries(SITE_SIGNALS.map(([t, re]) => [t, hay.match(re)?.length ?? 0])) as Record<
    SiteType,
    number
  >;
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

/** How important each endpoint class is for a visitor to reach, by site type (0-1). */
export const CLASS_IMPORTANCE: Record<SiteType, Record<EndpointClass, number>> = {
  event: {
    "schedule-event": 1, signup: 0.95, pricing: 0.7, "docs-answers": 0.6, "demo-video": 0.6,
    "contact-form": 0.5, "next-steps": 0.5, download: 0.3, other: 0.1,
  },
  saas: {
    pricing: 1, signup: 0.95, "contact-form": 0.8, "docs-answers": 0.75, "demo-video": 0.7,
    "next-steps": 0.5, download: 0.5, "schedule-event": 0.3, other: 0.1,
  },
  commerce: {
    pricing: 1, signup: 0.7, "next-steps": 0.6, "contact-form": 0.5, "docs-answers": 0.5,
    "demo-video": 0.4, download: 0.3, "schedule-event": 0.2, other: 0.1,
  },
  content: {
    "docs-answers": 1, "demo-video": 0.8, "next-steps": 0.7, signup: 0.6, "contact-form": 0.6,
    download: 0.5, pricing: 0.4, "schedule-event": 0.4, other: 0.1,
  },
};

/** Classes a site of this type is expected to expose (missing-endpoint-class finding). */
export const EXPECTED_CLASSES: Record<SiteType, EndpointClass[]> = {
  event: ["schedule-event", "signup"],
  saas: ["pricing", "signup"],
  commerce: ["pricing"],
  content: [],
};

const MAX_PER_CLASS = 5;

interface Candidate {
  key: string;
  cls: EndpointClass;
  url: string;
  label: string;
  stateId?: string;
  sourceStateId?: string;
  actionId?: string;
  occurrences: number;
  onStart: boolean;
  order: number;
}

function endpointKeyUrl(raw: string): string {
  try {
    const u = new URL(raw.replace(/&amp;/g, "&"));
    u.hash = "";
    u.searchParams.delete("t");
    let s = u.toString().replace(/\?$/, "");
    if (u.pathname !== "/" && s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw;
  }
}

function classifyState(state: SiteState): EndpointClass | null {
  return classifyText(pathWords(state.url));
}

/**
 * Classify each discovered state (by URL path) and each CTA/link (by label +
 * destination path) into endpoint classes, merge duplicates, and weight them.
 * Pure + deterministic for a given graph.
 */
export function discoverEndpoints(graph: StateGraph, opts: { intents?: IntentProfile[] } = {}): Endpoint[] {
  const start = graph.states[0];
  if (!start) return [];
  const stateByKey = new Map(graph.states.map((s) => [endpointKeyUrl(s.url), s]));
  const edgeTo = new Map(graph.edges.map((e) => [`${e.fromStateId}|${e.actionId}`, e.toStateId]));
  const candidates = new Map<string, Candidate>();
  let order = 0;

  const upsert = (c: Omit<Candidate, "occurrences" | "order">) => {
    const prev = candidates.get(c.key);
    if (!prev) {
      candidates.set(c.key, { ...c, occurrences: 1, order: order++ });
      return;
    }
    prev.occurrences++;
    prev.onStart ||= c.onStart;
    prev.stateId ??= c.stateId;
    if (!prev.actionId && c.actionId) {
      prev.actionId = c.actionId;
      prev.sourceStateId = c.sourceStateId;
      prev.label = c.label;
    }
  };

  for (const state of graph.states) {
    const isStart = state.stateId === start.stateId;
    const cls = classifyState(state);
    if (cls) {
      const url = endpointKeyUrl(state.url);
      upsert({ key: `${cls}|${url}`, cls, url: state.url, label: state.pageTitle, stateId: state.stateId, onStart: isStart });
    }
    for (const action of state.actions) {
      if ((action.type !== "click" && action.type !== "navigate") || !action.enabled) continue;
      const acls = classifyAction(action);
      if (!acls) continue;
      const href = action.href ? endpointKeyUrl(action.href) : undefined;
      const dest = edgeTo.get(`${state.stateId}|${action.actionId}`) ?? (href ? stateByKey.get(href)?.stateId : undefined);
      upsert({
        key: href ? `${acls}|${href}` : `${acls}|${endpointKeyUrl(state.url)}|${action.label.toLowerCase()}`,
        cls: acls,
        url: action.href ? action.href.replace(/&amp;/g, "&").replace(/\?$/, "") : state.url,
        label: action.label,
        stateId: dest,
        sourceStateId: state.stateId,
        actionId: action.actionId,
        onStart: isStart,
      });
    }
  }

  const perClass = new Map<EndpointClass, Candidate[]>();
  for (const c of candidates.values()) perClass.set(c.cls, [...(perClass.get(c.cls) ?? []), c]);
  const kept: Candidate[] = [];
  for (const list of perClass.values()) {
    list.sort((a, b) => Number(b.onStart) - Number(a.onStart) || b.occurrences - a.occurrences || a.order - b.order);
    kept.push(...list.slice(0, MAX_PER_CLASS));
  }
  kept.sort((a, b) => a.order - b.order);

  const endpoints: Endpoint[] = kept.map((c) => ({
    endpointId: `ep_${c.cls}_${createHash("sha1").update(c.key).digest("hex").slice(0, 8)}`,
    class: c.cls,
    url: c.url,
    label: c.label,
    weight: 0,
    stateId: c.stateId,
    sourceStateId: c.sourceStateId,
    actionId: c.actionId,
    intent: CLASS_INTENTS[c.cls],
  }));
  const meta = new Map(kept.map((c, i) => [endpoints[i].endpointId, c]));
  return weightEndpoints(endpoints, {
    siteType: detectSiteType(graph),
    prominence: (e) => {
      const c = meta.get(e.endpointId)!;
      return { occurrences: c.occurrences, onStart: c.onStart };
    },
    intents: opts.intents,
  });
}

/**
 * Deterministic weights: class importance for the site type (or an intent's
 * weightOverride) × prominence (times linked, surfaced on the start page).
 * Sorted by weight desc, ties by endpointId.
 */
export function weightEndpoints(
  endpoints: Endpoint[],
  ctx: {
    siteType: SiteType;
    prominence?: (e: Endpoint) => { occurrences: number; onStart: boolean };
    intents?: IntentProfile[];
  },
): Endpoint[] {
  const overrides: Partial<Record<EndpointClass, number>> = {};
  for (const intent of ctx.intents ?? []) {
    for (const [cls, w] of Object.entries(intent.weightOverrides ?? {}) as [EndpointClass, number][]) {
      overrides[cls] = Math.max(overrides[cls] ?? 0, w);
    }
  }
  return endpoints
    .map((e) => {
      const base = overrides[e.class] ?? CLASS_IMPORTANCE[ctx.siteType][e.class];
      const p = ctx.prominence?.(e) ?? { occurrences: 1, onStart: true };
      const prominence = (0.7 + (0.3 * Math.min(p.occurrences, 3)) / 3) * (p.onStart ? 1 : 0.9);
      const weight = Math.round(Math.min(1, Math.max(0, base * prominence)) * 1000) / 1000;
      return { ...e, weight };
    })
    .sort((a, b) => b.weight - a.weight || a.endpointId.localeCompare(b.endpointId));
}

/**
 * Simulation goal check: when the goal maps to endpoint classes (e.g. "find pricing"
 * → pricing), reaching a discovered state of that class counts as goal-reached.
 */
export function endpointGoalAssertions(
  graph: StateGraph | undefined,
  intent: IntentProfile | undefined,
  endpoints: Endpoint[] | undefined,
): Assertion[] {
  const targets = new Set(intent?.targetEndpointClasses ?? []);
  const start = graph?.states[0];
  if (!graph || !start || targets.size === 0) return [];
  const stateUrl = new Map(graph.states.map((s) => [s.stateId, s.url]));
  const urls = new Set<string>();
  for (const e of endpoints ?? []) {
    const url = e.stateId ? stateUrl.get(e.stateId) : undefined;
    if (!targets.has(e.class) || !url || e.stateId === start.stateId || start.url.includes(url)) continue;
    urls.add(url);
  }
  return [...urls].map((value) => ({ kind: "url-matches" as const, value }));
}
