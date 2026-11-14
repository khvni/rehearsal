import { createHash } from "node:crypto";
import type { EndpointClass, Experiment, RebuildGoal, SiteState } from "../contracts";
import { CLASS_IMPORTANCE, EXPECTED_CLASSES, detectSiteType } from "../intents/endpoints";
import { classifyAction, classifyText } from "../intents/patterns";
import { CTA_VERB_RE, nameFromTitle } from "./brand";

export const MAX_REBUILD_GOALS = 8;

const SOURCE_ORDER: RebuildGoal["source"][] = ["experiment-goal", "cta", "nav", "endpoint", "title", "implied"];

/** How a visitor would phrase wanting to reach each endpoint class. */
const CLASS_GOAL: Record<EndpointClass, { title: string; goal: string } | null> = {
  pricing: { title: "See pricing", goal: "Find out what it costs" },
  signup: { title: "Sign up", goal: "Sign up or register" },
  "demo-video": { title: "Watch the demo", goal: "Watch a demo or video" },
  "contact-form": { title: "Contact the team", goal: "Get in touch with the team" },
  "docs-answers": { title: "Find answers", goal: "Find answers in the docs or FAQ" },
  "next-steps": { title: "Get updates", goal: "Stay updated on what's next" },
  "schedule-event": { title: "See the schedule", goal: "See the schedule and sessions" },
  download: { title: "Download", goal: "Download it" },
  other: null,
};

const STOPWORDS = new Set(["the", "a", "an", "to", "our", "your", "my", "for", "of", "and", "now", "today", "here", "page"]);
const SKIP_NAV = /^(home|menu|search|close|log ?in|sign ?in|back|more|skip to .*)$/i;

interface Candidate {
  title: string;
  goal: string;
  source: RebuildGoal["source"];
  endpointClass?: EndpointClass;
  targetUrl?: string;
  sourceLabel?: string;
  weight: number;
}

function clean(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 80);
}

function sentence(label: string): string {
  const l = clean(label);
  return l ? l[0].toUpperCase() + l.slice(1) : l;
}

function goalKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ");
}

function urlKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}${u.search}${u.hash}`;
  } catch {
    return undefined;
  }
}

function httpUrl(url: string | undefined): string | undefined {
  return urlKey(url) ? url : undefined;
}

export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "goal";
}

const round2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

function ctaCandidates(states: SiteState[]): Candidate[] {
  const byLabel = new Map<string, { label: string; href?: string; role?: string; count: number; onStart: boolean; order: number }>();
  let order = 0;
  states.forEach((s, si) => {
    for (const a of s.actions) {
      const label = clean(a.label);
      if (label.length < 2 || label.length > 60 || !CTA_VERB_RE.test(label) || /^(learn more|read more|more)$/i.test(label)) continue;
      const k = goalKey(label);
      const prev = byLabel.get(k);
      if (prev) {
        prev.count++;
        prev.href ??= httpUrl(a.href);
        prev.onStart ||= si === 0;
      } else {
        byLabel.set(k, { label, href: httpUrl(a.href), role: a.role, count: 1, onStart: si === 0, order: order++ });
      }
    }
  });
  return [...byLabel.values()].map((c) => ({
    title: sentence(c.label),
    goal: sentence(c.label),
    source: "cta" as const,
    endpointClass: classifyAction({ label: c.label, href: c.href }) ?? undefined,
    targetUrl: c.href,
    sourceLabel: c.label,
    weight: round2(0.55 + (c.onStart ? 0.1 : 0) + Math.min(0.2, 0.05 * (c.count - 1)) + (c.role === "button" ? 0.05 : 0) - Math.min(0.1, c.order * 0.01)),
  }));
}

function navCandidates(states: SiteState[]): Candidate[] {
  const items = states.flatMap((s) => s.brand?.navItems ?? []);
  const out: Candidate[] = [];
  items.forEach((it, i) => {
    const label = clean(it.label);
    if (label.length < 3 || SKIP_NAV.test(label)) return;
    const cls = classifyAction({ label, href: it.href }) ?? undefined;
    const title = CTA_VERB_RE.test(label) ? sentence(label) : `See ${label.toLowerCase()}`;
    out.push({
      title: sentence(title),
      goal: sentence(title),
      source: "nav",
      endpointClass: cls,
      targetUrl: httpUrl(it.href),
      sourceLabel: label,
      weight: round2(0.5 + (cls ? 0.05 : 0) - Math.min(0.15, i * 0.02)),
    });
  });
  return out;
}

function endpointCandidates(exp: Experiment): Candidate[] {
  return [...(exp.endpoints ?? [])]
    .sort((a, b) => b.weight - a.weight || a.endpointId.localeCompare(b.endpointId))
    .flatMap((e) => {
      const phr = CLASS_GOAL[e.class];
      if (!phr) return [];
      return [{
        title: phr.title,
        goal: phr.goal,
        source: "endpoint" as const,
        endpointClass: e.class,
        targetUrl: httpUrl(e.url),
        sourceLabel: clean(e.label) || undefined,
        weight: round2(0.4 + 0.45 * e.weight),
      }];
    });
}

function titleCandidates(states: SiteState[]): Candidate[] {
  const startName = states[0] ? nameFromTitle(states[0].pageTitle) : undefined;
  const startTitle = states[0]?.pageTitle.trim().toLowerCase();
  const out: Candidate[] = [];
  for (const s of states.slice(1)) {
    const raw = s.pageTitle.replace(/\s+/g, " ").trim();
    if (!raw || raw.toLowerCase() === startTitle || /^https?:/i.test(raw)) continue;
    const seg = clean(raw.split(/\s[|–—·•-]\s|:\s/)[0] ?? "");
    if (seg.length < 3 || seg === startName) continue;
    out.push({
      title: sentence(seg),
      goal: `Read about ${seg}`,
      source: "title",
      endpointClass: classifyText(seg) ?? undefined,
      targetUrl: httpUrl(s.url),
      sourceLabel: seg,
      weight: 0.3,
    });
  }
  return out;
}

function impliedCandidates(exp: Experiment, covered: Set<EndpointClass>): Candidate[] {
  const type = detectSiteType(exp.graph ?? { states: [], edges: [] });
  const importance = CLASS_IMPORTANCE[type];
  const classes = [...new Set([...EXPECTED_CLASSES[type], ...(Object.keys(importance) as EndpointClass[]).filter((c) => importance[c] >= 0.7)])];
  return classes
    .filter((c) => !covered.has(c) && CLASS_GOAL[c])
    .map((c) => ({ title: CLASS_GOAL[c]!.title, goal: CLASS_GOAL[c]!.goal, source: "implied" as const, endpointClass: c, weight: round2(0.25 * importance[c]) }));
}

/**
 * Infer ALL plausible visitor goals: the experiment's own goal first, then
 * explicit CTAs, nav items, endpoint classes and page titles, plus implied goals
 * from the detected site type. Slugs are unique + url-safe; weights in [0,1].
 */
export function inferGoals(exp: Experiment): RebuildGoal[] {
  const states = exp.graph?.states ?? [];
  const endpoints = [...(exp.endpoints ?? [])].sort((a, b) => b.weight - a.weight || a.endpointId.localeCompare(b.endpointId));
  const expClass = classifyText(exp.goal) ?? undefined;
  const expTarget = expClass ? endpoints.find((e) => e.class === expClass) : undefined;

  const candidates: Candidate[] = [
    {
      title: sentence(exp.goal),
      goal: exp.goal.trim(),
      source: "experiment-goal",
      endpointClass: expClass,
      targetUrl: httpUrl(expTarget?.url),
      sourceLabel: expTarget ? clean(expTarget.label) || undefined : undefined,
      weight: 1,
    },
    ...ctaCandidates(states),
    ...navCandidates(states),
    ...endpointCandidates(exp),
    ...titleCandidates(states),
  ];

  const kept: Candidate[] = [];
  const byKey = new Map<string, Candidate>();
  const byUrl = new Map<string, Candidate>();
  for (const c of candidates) {
    if (!c.goal) continue;
    const key = goalKey(c.goal) || goalKey(c.title);
    const uk = urlKey(c.targetUrl);
    const dup = byKey.get(key) ?? (uk ? byUrl.get(uk) : undefined);
    if (dup) {
      dup.weight = Math.max(dup.weight, c.weight);
      dup.targetUrl ??= c.targetUrl;
      dup.sourceLabel ??= c.sourceLabel;
      dup.endpointClass ??= c.endpointClass;
      if (uk && !byUrl.has(uk)) byUrl.set(uk, dup);
      continue;
    }
    byKey.set(key, c);
    if (uk) byUrl.set(uk, c);
    kept.push(c);
  }
  const covered = new Set(kept.map((c) => c.endpointClass).filter((c): c is EndpointClass => !!c));
  for (const c of impliedCandidates(exp, covered)) {
    const key = goalKey(c.goal);
    if (byKey.has(key)) continue;
    byKey.set(key, c);
    kept.push(c);
  }

  const sorted = kept
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        Number(b.c.source === "experiment-goal") - Number(a.c.source === "experiment-goal") ||
        b.c.weight - a.c.weight ||
        SOURCE_ORDER.indexOf(a.c.source) - SOURCE_ORDER.indexOf(b.c.source) ||
        a.i - b.i,
    )
    .slice(0, MAX_REBUILD_GOALS)
    .map((x) => x.c);

  const used = new Set<string>();
  return sorted.map((c) => {
    const base = slugify(c.title);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return {
      goalId: `goal_${createHash("sha1").update(slug).digest("hex").slice(0, 8)}`,
      slug,
      title: c.title.slice(0, 80),
      goal: c.goal,
      source: c.source,
      ...(c.endpointClass ? { endpointClass: c.endpointClass } : {}),
      ...(c.targetUrl ? { targetUrl: c.targetUrl } : {}),
      ...(c.sourceLabel ? { sourceLabel: c.sourceLabel } : {}),
      weight: round2(c.weight),
    };
  });
}
