import { z } from "zod";
import type {
  BrandProfile,
  Endpoint,
  Experiment,
  LlmClient,
  RebuildGoal,
  RebuildPageContent,
  RebuildResult,
  RebuiltPage,
  SiteState,
} from "../contracts";
import { llmPageSource } from "../analysis/openrouter";
import { logEvent } from "../telemetry";
import { uniqueStatesByUrl } from "../graph";
import { CTA_VERB_RE, rollupBrand } from "./brand";
import { inferGoals } from "./goals";
import { sanitizeRebuildHtml } from "./sanitize";
import { renderGoalPage } from "./templates";

const MAX_NAV = 6;
const STATUS_RE =
  /\b(applications?|registration|tickets?|sales?|enrollment|signups?|early[- ]bird|waitlist)\s+(are|is)\s+(now\s+)?(open|closed|live|sold out|available)\b[^.\n]{0,60}/i;
const STALE_RE = /\b(stale|outdated|out[- ]of[- ]date|old date|past (event|date)|dates? in the past|still invites registration|already happened|expired|last year)\b/i;

function normUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const at = cut.lastIndexOf(" ");
  return `${(at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
}

function firstSegment(title: string): string {
  return (title.replace(/\s+/g, " ").trim().split(/\s[|–—·•-]\s/)[0] ?? "").trim();
}

function sortedEndpoints(exp: Experiment): Endpoint[] {
  return [...(exp.endpoints ?? [])].sort((a, b) => b.weight - a.weight || a.endpointId.localeCompare(b.endpointId));
}

/** True when the audit itself flagged stale dates/content. */
function staleFlagged(exp: Experiment): boolean {
  return (
    exp.findings.some((f) => STALE_RE.test(`${f.title} ${f.description}`)) ||
    (exp.spec?.changes ?? []).some((c) => STALE_RE.test(`${c.title} ${c.change}`))
  );
}

/**
 * Prose lines from crawled text: full sentences, no menu crumbs. With staleFix, lines citing a year
 * older than the newest of (years on the page, the experiment's createdAt year) are dropped.
 */
function proseLines(text: string, staleFix: boolean, refYear = 0): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 40 && l.split(" ").length >= 6);
  if (!staleFix) return lines;
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const newest = Math.max(refYear, ...years);
  return lines.filter((l) => ![...l.matchAll(/\b(19|20)\d{2}\b/g)].some((m) => Number(m[0]) < newest));
}

function stateFor(states: SiteState[], url: string | undefined): SiteState | undefined {
  const key = normUrl(url);
  return key ? states.find((s) => normUrl(s.url) === key) : undefined;
}

function navOf(exp: Experiment, states: SiteState[]): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string, url: string | undefined) => {
    const l = label.replace(/\s+/g, " ").trim();
    const u = normUrl(url);
    if (!l || l.length > 40 || !u || /^(home|search|menu|close|open menu)$/i.test(l)) return;
    const k = `${l.toLowerCase()}|${u}`;
    if (seen.has(k) || out.some((o) => normUrl(o.url) === u)) return;
    seen.add(k);
    out.push({ label: l, url: url! });
  };
  for (const s of states) for (const n of s.brand?.navItems ?? []) add(n.label, n.href);
  if (out.length === 0) {
    let origin = "";
    try {
      origin = new URL(exp.targetUrl).origin;
    } catch {
      /* none */
    }
    for (const a of states[0]?.actions ?? []) {
      if (a.role === "link" && a.href && a.safeToExecute && normUrl(a.href)?.startsWith(origin)) add(a.label, a.href);
    }
  }
  return out.slice(0, MAX_NAV);
}

/**
 * Deterministic page content assembled from crawled facts (headings, CTA
 * labels, endpoint URLs, spec changes, findings) — the keyless path.
 */
export function seedPageContent(exp: Experiment, goal: RebuildGoal): RebuildPageContent {
  const states = exp.graph?.states ?? [];
  const start = states[0];
  const endpoints = sortedEndpoints(exp);
  const classEndpoints = goal.endpointClass ? endpoints.filter((e) => e.class === goal.endpointClass) : [];
  // Without a matching class, only pick an endpoint whose label/url shares a
  // content word with the goal — otherwise the top-weighted endpoint (often
  // signup) hijacks unrelated pages like "pricing".
  const goalWords = new Set(`${goal.title} ${goal.goal} ${goal.sourceLabel ?? ""}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  goalWords.delete("the");
  const matchEndpoint = classEndpoints.length
    ? classEndpoints[0]
    : endpoints.find((e) => {
        const words = `${e.label} ${e.url}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
        return words.some((w) => goalWords.has(w));
      });
  const ctaUrl = goal.targetUrl ?? matchEndpoint?.url ?? exp.targetUrl;
  const target = stateFor(states, ctaUrl) ?? start;
  const staleFix = staleFlagged(exp);
  const refYear = Number(/^((?:19|20)\d{2})-/.exec(exp.createdAt)?.[1] ?? 0);

  const bestCtaAction = (target?.actions ?? start?.actions ?? []).find(
    (a) => CTA_VERB_RE.test(a.label) && a.label.length <= 40 && (!goal.endpointClass || normUrl(a.href) === normUrl(ctaUrl)),
  );
  const ctaLabel = (goal.sourceLabel ?? classEndpoints[0]?.label ?? bestCtaAction?.label ?? goal.title).replace(/\s+/g, " ").trim().slice(0, 60);

  const startLines = start ? proseLines(start.visibleText, staleFix, refYear) : [];
  const targetLines = target && target !== start ? proseLines(target.visibleText, staleFix, refYear) : [];
  const lede = clip(targetLines[0] ?? startLines[0] ?? goal.goal, 220);
  const allText = [target?.visibleText ?? "", start?.visibleText ?? ""].join("\n");
  // When the audit flagged stale content, "registration is open"-style claims are
  // exactly what the rebuild must not preserve — keep only closed/sold-out statuses.
  const statusRaw = allText.match(STATUS_RE)?.[0];
  const status = staleFix && statusRaw && !/(closed|sold\s*out)/i.test(statusRaw) ? undefined : statusRaw;

  const sections: RebuildPageContent["sections"] = [];
  const detail = (targetLines.length ? targetLines : startLines).filter((l) => clip(l, 220) !== lede).slice(0, 4);
  if (detail.length) {
    const heading = firstSegment(target?.pageTitle ?? "") || goal.title;
    sections.push({ heading: clip(heading, 80), body: clip(detail[0], 320), ...(detail.length > 1 ? { bullets: detail.slice(1).map((l) => clip(l, 160)) } : {}) });
  }
  if (target !== start && startLines.length) {
    const extra = startLines.filter((l) => clip(l, 220) !== lede && !detail.includes(l)).slice(0, 3);
    if (extra.length) sections.push({ heading: clip(firstSegment(start?.pageTitle ?? "") || "Overview", 80), bullets: extra.map((l) => clip(l, 160)) });
  }
  const ctaKey = normUrl(ctaUrl);
  const next = endpoints.filter((e) => normUrl(e.url) !== ctaKey).slice(0, 6);
  if (next.length) sections.push({ heading: "Where to go next", links: next.map((e) => ({ label: clip(e.label || e.class, 60), url: e.url })) });

  const applied = (exp.spec?.changes ?? []).slice(0, 3).map((c) => c.title);
  const host = (() => {
    try {
      return new URL(exp.targetUrl).hostname.replace(/^www\./, "");
    } catch {
      return exp.targetUrl;
    }
  })();
  const footerLinks = endpoints
    .filter((e) => e.class === "contact-form" || e.class === "docs-answers")
    .slice(0, 4)
    .map((e) => ({ label: clip(e.label || e.class, 60), url: e.url }));

  return {
    hero: {
      heading: clip(goal.title, 90),
      lede,
      ctaLabel: ctaLabel || "Continue",
      ctaUrl,
      ...(status ? { statusLine: clip(status, 90) } : {}),
    },
    sections,
    nav: navOf(exp, states),
    footer: {
      note: `Rebuilt from ${host} for the goal “${clip(goal.goal, 100)}”${applied.length ? `. Applies: ${applied.join("; ")}` : ""}.`,
      ...(footerLinks.length ? { links: footerLinks } : {}),
    },
  };
}

// ── LLM content ─────────────────────────────────────────────────────────────

const LinkSchema = z.object({ label: z.string().min(1).max(80), url: z.string().url() });
const LlmPage = z.object({
  slug: z.string().min(1),
  hero: z
    .object({
      heading: z.string().min(1).max(140),
      lede: z.string().max(400).optional(),
      ctaLabel: z.string().min(1).max(60).optional(),
      ctaUrl: z.string().url().optional(),
      statusLine: z.string().max(120).optional(),
    })
    .optional(),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(120),
        body: z.string().max(800).optional(),
        bullets: z.array(z.string().min(1).max(240)).max(8).optional(),
        links: z.array(LinkSchema).max(10).optional(),
      }),
    )
    .max(8)
    .optional(),
  nav: z.array(LinkSchema).max(10).optional(),
  footer: z.object({ note: z.string().max(300).optional(), links: z.array(LinkSchema).max(10).optional() }).optional(),
});
type LlmPage = z.infer<typeof LlmPage>;

function knownUrls(exp: Experiment, seeds: RebuildPageContent[]): Set<string> {
  const urls = new Set<string>();
  const add = (u: string | undefined) => {
    const k = normUrl(u);
    if (k) urls.add(k);
  };
  add(exp.targetUrl);
  for (const s of exp.graph?.states ?? []) {
    add(s.url);
    for (const a of s.actions) add(a.href);
    for (const n of s.brand?.navItems ?? []) add(n.href);
  }
  for (const e of exp.endpoints ?? []) add(e.url);
  for (const seed of seeds) {
    add(seed.hero.ctaUrl);
    for (const n of seed.nav) add(n.url);
  }
  return urls;
}

function buildPrompt(exp: Experiment, brand: BrandProfile, goals: RebuildGoal[], seeds: RebuildPageContent[]): string {
  const facts = {
    site: { name: brand.name, url: exp.targetUrl, tone: brand.tone, voiceNotes: brand.voiceNotes, ctaLabels: brand.ctaLabels },
    pages: uniqueStatesByUrl(exp.graph?.states ?? []).slice(0, 12).map((s) => ({ url: s.url, title: s.pageTitle, text: s.visibleText.slice(0, 1200) })),
    endpoints: (exp.endpoints ?? []).slice(0, 20).map((e) => ({ class: e.class, label: e.label, url: e.url })),
    findings: exp.findings.slice(0, 10).map((f) => ({ title: f.title, recommendation: f.recommendation })),
    specChanges: (exp.spec?.changes ?? []).slice(0, 10).map((c) => ({ title: c.title, change: c.change })),
  };
  return [
    "REBUILD_PAGES_JSON",
    "You redesign one website into focused pages, one per visitor goal, in the site's own voice.",
    "Rules: use ONLY facts present in SITE_FACTS (never invent dates, prices, numbers, names or quotes).",
    "Every URL you output must appear verbatim in SITE_FACTS or the seed content. One dominant CTA per page.",
    "At most 6 nav items, 2-5 short scannable sections. Apply the findings/spec changes where they fit (e.g. drop stale dates).",
    'Return JSON: {"pages":[{"slug":string,"hero":{"heading","lede","ctaLabel","ctaUrl","statusLine"?},"sections":[{"heading","body"?,"bullets"?,"links"?:[{"label","url"}]}],"nav":[{"label","url"}],"footer":{"note"?,"links"?}}]}',
    `GOALS: ${JSON.stringify(goals.map((g, i) => ({ slug: g.slug, title: g.title, goal: g.goal, seed: seeds[i] })))}`,
    `SITE_FACTS: ${JSON.stringify(facts)}`,
  ].join("\n");
}

function parsePages(raw: string): Map<string, LlmPage> {
  const out = new Map<string, LlmPage>();
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const data: unknown = JSON.parse(body);
  const pages = Array.isArray(data) ? data : (data as { pages?: unknown })?.pages;
  if (!Array.isArray(pages)) throw new Error("rebuild LLM response has no pages array");
  for (const p of pages) {
    const parsed = LlmPage.safeParse(p);
    if (parsed.success && !out.has(parsed.data.slug)) out.set(parsed.data.slug, parsed.data);
  }
  return out;
}

/** LLM fields win when valid; URLs must already exist in the crawl. Returns undefined when nothing usable was supplied. */
function mergeContent(seed: RebuildPageContent, llm: LlmPage | undefined, urls: Set<string>): RebuildPageContent | undefined {
  if (!llm) return undefined;
  const ok = (u: string | undefined) => !!u && urls.has(normUrl(u) ?? "");
  const links = (ls: { label: string; url: string }[] | undefined) => (ls ?? []).filter((l) => ok(l.url));
  let used = false;

  const hero = { ...seed.hero };
  if (llm.hero) {
    used = true;
    hero.heading = llm.hero.heading;
    if (llm.hero.lede) hero.lede = llm.hero.lede;
    if (llm.hero.ctaLabel) hero.ctaLabel = llm.hero.ctaLabel;
    if (ok(llm.hero.ctaUrl)) hero.ctaUrl = llm.hero.ctaUrl!;
    if (llm.hero.statusLine) hero.statusLine = llm.hero.statusLine;
  }
  const sections = (llm.sections ?? []).map((s) => ({ ...s, links: links(s.links) })).map((s) => (s.links.length ? s : { ...s, links: undefined }));
  if (sections.length) used = true;
  const nav = links(llm.nav).slice(0, MAX_NAV);
  if (nav.length) used = true;
  const footer = llm.footer ? { note: llm.footer.note ?? seed.footer?.note, links: links(llm.footer.links) } : seed.footer;
  if (!used) return undefined;
  return { hero, sections: sections.length ? sections : seed.sections, nav: nav.length ? nav : seed.nav, footer };
}

function pageSummary(goal: RebuildGoal, content: RebuildPageContent, exp: Experiment): string {
  const spec = exp.spec?.changes?.[0]?.title;
  return `One primary CTA (“${clip(content.hero.ctaLabel, 40)}”) for “${clip(goal.goal, 80)}”, ${content.nav.length} nav items, ${content.sections.length} sections${spec ? `; applies “${clip(spec, 60)}”` : ""}.`;
}

/** Asks the LLM for the goals at `indexes` and fills `merged` with the usable pages; returns the error, if the call failed. */
async function requestPages(
  exp: Experiment,
  llm: LlmClient,
  brand: BrandProfile,
  goals: RebuildGoal[],
  seeds: RebuildPageContent[],
  urls: Set<string>,
  indexes: number[],
  merged: (RebuildPageContent | undefined)[],
): Promise<string | undefined> {
  try {
    const prompt = buildPrompt(exp, brand, indexes.map((i) => goals[i]), indexes.map((i) => seeds[i]));
    const pages = parsePages(await llm.complete(prompt, { deep: true, json: true, model: "rebuild" }));
    const slugs = goals.map((g) => g.slug);
    for (const i of indexes) merged[i] = mergeContent(seeds[i], pageFor(pages, goals[i].slug, slugs), urls);
    return undefined;
  } catch (err) {
    const error = String(err instanceof Error ? err.message : err).slice(0, 160);
    logEvent({ experimentId: exp.id, stage: "rebuild", kind: "llm-fallback", data: { llm: llm.name, error, goals: indexes.length } });
    return error;
  }
}

/**
 * Exact slug, else the same slug ignoring case and punctuation (models sometimes re-slug "watch-the-demo" as
 * "watch_the_demo"), but only when that loose key is unambiguous across both the goals and the reply.
 */
export function pageFor(pages: Map<string, LlmPage>, slug: string, goalSlugs: string[]): LlmPage | undefined {
  const exact = pages.get(slug);
  if (exact) return exact;
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const k = key(slug);
  if (goalSlugs.filter((g) => key(g) === k).length !== 1) return undefined;
  const loose = [...pages].filter(([p]) => key(p) === k && !goalSlugs.includes(p));
  return loose.length === 1 ? loose[0][1] : undefined;
}

/** Stage 7 core: rollupBrand → inferGoals → per-goal content → rendered pages. */
export async function generateRebuild(exp: Experiment, llm: LlmClient): Promise<RebuildResult> {
  const states = exp.graph?.states ?? [];
  const brand = rollupBrand(states);
  const goals = inferGoals(exp);
  const seeds = goals.map((g) => seedPageContent(exp, g));

  const urls = knownUrls(exp, seeds);
  const merged: (RebuildPageContent | undefined)[] = goals.map(() => undefined);
  let llmError: string | undefined;
  if (llm.name !== "gemini-fixture" && goals.length > 0) {
    // One call for every goal, then one retry for the goals it left without usable copy
    // (omitted, renamed, invalid, or the whole reply failed), so a dropped page isn't silently a template.
    const all = goals.map((_, i) => i);
    const firstError = await requestPages(exp, llm, brand, goals, seeds, urls, all, merged);
    const missing = all.filter((i) => !merged[i]);
    const retryError = missing.length ? await requestPages(exp, llm, brand, goals, seeds, urls, missing, merged) : undefined;
    const still = all.filter((i) => !merged[i]);
    if (still.length === goals.length) llmError = firstError ?? retryError ?? "LLM response had no usable page for any goal";
    else if (still.length) llmError = `LLM gave no usable copy for ${still.map((i) => goals[i].slug).join(", ")} after a retry`;
  }
  let imageOrigin = "";
  try {
    imageOrigin = new URL(exp.targetUrl).origin;
  } catch {
    /* none */
  }

  const pages: RebuiltPage[] = goals.map((goal, i) => {
    const content = merged[i] ?? seeds[i];
    const html = sanitizeRebuildHtml(renderGoalPage({ brand, goal, experiment: exp, content }), { imageOrigins: imageOrigin ? [imageOrigin] : [] });
    return {
      slug: goal.slug,
      goal: goal.goal,
      title: `${goal.title} · ${brand.name}`,
      summary: pageSummary(goal, content, exp),
      html,
      source: merged[i] ? llmPageSource(llm) : "template",
      bytes: new TextEncoder().encode(html).length,
    };
  });

  return { generatedAt: new Date().toISOString(), brand, goals, pages, llm: llm.name, ...(llmError ? { llmError } : {}) };
}
