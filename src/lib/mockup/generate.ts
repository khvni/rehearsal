import { z } from "zod";
import type {
  BrandProfile,
  Experiment,
  LlmClient,
  MockupPage,
  MockupResult,
  RebuildPageContent,
  SiteState,
  SpecChange,
} from "../contracts";
import { CTA_VERB_RE, rollupBrand } from "../rebuild/brand";
import { sanitizeRebuildHtml } from "../rebuild/sanitize";
import { llmPageSource } from "../analysis/openrouter";
import { logEvent } from "../telemetry";
import { renderMockupPage, rewriteLinks } from "./render";

const MAX_NAV = 6;
const MAX_PAGES = 24;
const STATUS_RE =
  /\b(applications?|registration|tickets?|sales?|enrollment|signups?|early[- ]bird|waitlist)\s+(are|is)\s+(now\s+)?(open|closed|live|sold out|available)\b[^.\n]{0,60}/i;
// Matches the stale-event finding's wording and its spec change ("dates in the past",
// "event that already happened", "this event has ended"), not just the word "stale".
const STALE_RE = /\b(stale|outdated|out[- ]of[- ]date|old date|past (event|date)|expired|last year|already happened|dates? in the past|has ended)\b/i;

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

/** One mockup page per crawled URL — desktop wins when a page was crawled twice. */
function dedupeStates(states: SiteState[]): SiteState[] {
  const byUrl = new Map<string, SiteState>();
  for (const s of states) {
    const key = normUrl(s.url);
    if (!key) continue;
    const prev = byUrl.get(key);
    if (!prev || (prev.viewport.name !== "desktop" && s.viewport.name === "desktop")) byUrl.set(key, s);
  }
  return [...byUrl.values()].slice(0, MAX_PAGES);
}

/** URL path → url-safe slug; the root path is "index". */
function slugFor(url: string, taken: Set<string>): string {
  let path = "index";
  try {
    path = new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    /* keep index */
  }
  let base =
    path === "/"
      ? "index"
      : path
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "page";
  if (!/^[a-z0-9]/.test(base)) base = `page-${base}`;
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

/** True when the audit itself flagged stale dates/content. */
function staleFlagged(exp: Experiment): boolean {
  return (
    exp.findings.some((f) => STALE_RE.test(`${f.title} ${f.description}`)) ||
    (exp.spec?.changes ?? []).some((c) => STALE_RE.test(`${c.title} ${c.change}`))
  );
}

/** Prose lines from crawled text: full sentences, no menu crumbs. staleFix drops lines citing older years. */
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

/**
 * Spec changes whose findings touched any captured state for this URL —
 * dedupe keeps one viewport per URL, so matching by stateId alone would
 * lose findings recorded on the other viewport.
 */
function changesForUrl(exp: Experiment, url: string | undefined): SpecChange[] {
  const key = normUrl(url);
  if (!key) return [];
  const siblingIds = new Set(
    (exp.graph?.states ?? []).filter((s) => normUrl(s.url) === key).map((s) => s.stateId),
  );
  const findingIds = new Set(
    exp.findings.filter((f) => f.affectedStates.some((id) => siblingIds.has(id))).map((f) => f.findingId),
  );
  return (exp.spec?.changes ?? []).filter((c) => c.findingId && findingIds.has(c.findingId));
}

/** Crawled nav/actions rewritten to preview paths where the destination was crawled. */
function navOf(states: SiteState[], urlToSlug: Map<string, string>, previewBase: string): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string, url: string | undefined) => {
    const l = label.replace(/\s+/g, " ").trim();
    const u = normUrl(url);
    if (!l || l.length > 40 || !u || /^(home|search|menu|close|open menu)$/i.test(l)) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push({ label: l, url: urlToSlug.get(u) ? `${previewBase}/${urlToSlug.get(u)}` : url! });
  };
  for (const s of states) for (const n of s.brand?.navItems ?? []) add(n.label, n.href);
  if (out.length === 0) {
    for (const a of states[0]?.actions ?? []) {
      if (a.role === "link" && a.href && a.safeToExecute) add(a.label, a.href);
    }
  }
  return out.slice(0, MAX_NAV);
}

/**
 * Deterministic page content assembled from the crawled state — heading, lede,
 * dominant CTA, sections of page prose, nav rewritten to preview paths.
 */
export function mockupContent(
  exp: Experiment,
  state: SiteState,
  urlToSlug: Map<string, string>,
  previewBase: string,
  applied: string[],
): RebuildPageContent {
  const staleFix = staleFlagged(exp);
  const refYear = Number(/^((?:19|20)\d{2})-/.exec(exp.createdAt)?.[1] ?? 0);
  const lines = proseLines(state.visibleText, staleFix, refYear);
  const lede = clip(lines[0] ?? exp.goal, 220);

  const toPreview = (url: string | undefined): string | undefined => {
    const key = normUrl(url);
    return key && urlToSlug.has(key) ? `${previewBase}/${urlToSlug.get(key)}` : undefined;
  };
  const cta = state.actions.find((a) => CTA_VERB_RE.test(a.label) && a.label.length <= 40 && a.safeToExecute);
  const ctaLabel = (cta?.label ?? "Continue").replace(/\s+/g, " ").trim().slice(0, 60);
  const ctaHref = toPreview(cta?.href) ?? cta?.href ?? exp.targetUrl;
  const statusRaw = state.visibleText.match(STATUS_RE)?.[0];
  const status = staleFix && statusRaw && !/(closed|sold\s*out)/i.test(statusRaw) ? undefined : statusRaw;

  const sections: RebuildPageContent["sections"] = [];
  const detail = lines.filter((l) => clip(l, 220) !== lede).slice(0, 4);
  if (detail.length) {
    sections.push({
      heading: clip(firstSegment(state.pageTitle) || "Overview", 80),
      body: clip(detail[0], 320),
      ...(detail.length > 1 ? { bullets: detail.slice(1).map((l) => clip(l, 160)) } : {}),
    });
  }
  // Other crawled pages become a "keep exploring" link list — the click-through surface.
  const siblings = [...urlToSlug.entries()].filter(([u]) => normUrl(state.url) !== u).slice(0, 6);
  if (siblings.length) {
    sections.push({
      heading: "Keep exploring",
      links: siblings.map(([u, slug]) => ({ label: clip(labelFor(u), 60), url: `${previewBase}/${slug}` })),
    });
  }

  const host = brandHost(exp);

  return {
    hero: {
      heading: clip(firstSegment(state.pageTitle) || brandHost(exp), 90),
      lede,
      ctaLabel,
      ctaUrl: ctaHref,
      ...(status ? { statusLine: clip(status, 90) } : {}),
    },
    sections,
    nav: navOf(exp.graph?.states ?? [], urlToSlug, previewBase),
    footer: {
      note: `Mockup of ${shortUrl(state.url)} rebuilt from ${host}${applied.length ? `. Applies: ${applied.join("; ")}` : ""}.`,
    },
  };
}

function labelFor(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ") || u.hostname;
  } catch {
    return url;
  }
}

function brandHost(exp: Experiment): string {
  try {
    return new URL(exp.targetUrl).hostname.replace(/^www\./, "");
  } catch {
    return exp.targetUrl;
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return url;
  }
}

// ── LLM mockup ──────────────────────────────────────────────────────────────

const LlmMockupPage = z.object({
  slug: z.string().min(1),
  title: z.string().min(1).max(160).optional(),
  summary: z.string().max(240).optional(),
  html: z.string().min(200),
});
type LlmMockupPage = z.infer<typeof LlmMockupPage>;

function buildPrompt(
  exp: Experiment,
  brand: BrandProfile,
  plan: { state: SiteState; slug: string; changes: SpecChange[] }[],
): string {
  const facts = plan.map(({ state, slug, changes }) => ({
    slug,
    url: state.url,
    title: state.pageTitle,
    text: state.visibleText.slice(0, 1500),
    nav: (state.brand?.navItems ?? []).slice(0, 8).map((n) => n.label),
    // Full edit detail — the change and its concrete steps, not just a title.
    specChanges: changes.map((c) => ({
      title: c.title,
      change: clip(c.change, 220),
      steps: c.steps.slice(0, 6).map((s) => clip(s, 140)),
    })),
  }));
  return [
    "MOCKUP_PAGES_JSON",
    "You rebuild a website into an interactive mockup applying a UX spec — one page per crawled URL.",
    "Rules: each page is a COMPLETE self-contained HTML document (<!doctype html>…</html>) with one inline <style> block and no external resources —",
    "no <script>, no <img>/<link> to any URL, no webfonts. Link to other pages with href=\"mockup:<slug>\"; use http(s) URLs only for exits off the mockup.",
    "Use ONLY facts in SITE_FACTS (never invent dates, prices, names or quotes). One dominant CTA per page. Apply each page's specChanges visibly (e.g. drop stale dates, surface the goal's CTA).",
    `Brand: ${JSON.stringify({ name: brand.name, tone: brand.tone, colors: brand.colors, fonts: brand.fonts })} — write CSS using these values (hex/ font stacks as given, e.g. --ink:${brand.colors.ink}).`,
    'Return JSON: {"pages":[{"slug":string,"title":string,"summary":"one line on what changed","html":"<full document>"}]}',
    `SITE_FACTS: ${JSON.stringify(facts)}`,
  ].join("\n");
}

function parsePages(raw: string): Map<string, LlmMockupPage> {
  const out = new Map<string, LlmMockupPage>();
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const data: unknown = JSON.parse(body);
  const pages = Array.isArray(data) ? data : (data as { pages?: unknown })?.pages;
  if (!Array.isArray(pages)) throw new Error("mockup LLM response has no pages array");
  for (const p of pages) {
    const parsed = LlmMockupPage.safeParse(p);
    if (parsed.success && !out.has(parsed.data.slug)) out.set(parsed.data.slug, parsed.data);
  }
  return out;
}

/**
 * Spec-stage mockup: one self-contained page per crawled URL, served under
 * /experiments/{id}/preview/. Gemini (model slot "mockup") writes the pages;
 * the deterministic template covers whatever the LLM misses.
 */
export async function generateMockup(exp: Experiment, llm: LlmClient): Promise<MockupResult> {
  const states = dedupeStates(exp.graph?.states ?? []);
  const brand = rollupBrand(states);
  const previewBase = `/experiments/${exp.id}/preview`;

  const taken = new Set<string>();
  const plan = states.map((state) => ({
    state,
    slug: slugFor(state.url, taken),
    changes: changesForUrl(exp, state.url),
  }));
  const slugs = new Set(plan.map((p) => p.slug));
  const urlToSlug = new Map<string, string>();
  for (const p of plan) {
    const key = normUrl(p.state.url);
    if (key) urlToSlug.set(key, p.slug);
  }
  const indexSlug = urlToSlug.get(normUrl(exp.targetUrl) ?? "") ?? plan[0]?.slug ?? "index";
  const indexHref = `${previewBase}/${indexSlug}`;

  let llmPages = new Map<string, LlmMockupPage>();
  if (llm.name !== "gemini-fixture" && plan.length > 0) {
    try {
      llmPages = parsePages(await llm.complete(buildPrompt(exp, brand, plan), { deep: true, json: true, model: "mockup" }));
    } catch (err) {
      llmPages = new Map();
      logEvent({ experimentId: exp.id, stage: "spec", kind: "llm-fallback", data: { llm: llm.name, error: String(err).slice(0, 160) } });
    }
  }

  const pages: MockupPage[] = plan.map(({ state, slug, changes }) => {
    const applied = changes.map((c) => c.title).slice(0, 4);
    const draft = llmPages.get(slug);
    let html = draft?.html ?? renderMockupPage({ brand, state, content: mockupContent(exp, state, urlToSlug, previewBase, applied), indexHref, applied });
    // Belt: no script, no off-origin resource may survive into the stored page.
    html = sanitizeRebuildHtml(html, { imageOrigins: [] });
    // Media/graphics/forms can still carry a remote src the href-rewriter
    // never sees — the CSP on the route is the guarantee; dropping them keeps
    // the stored artifact honest.
    html = html
      .replace(/<(video|audio|picture|svg|math|form|canvas|select|textarea)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<\/?(video|audio|source|track|picture|svg|math|form|canvas|input|select|textarea)\b[^>]*>/gi, "");
    html = rewriteLinks(html, { previewBase, sourceUrl: state.url, urlToSlug, slugs, targetOrigin: originOf(exp.targetUrl) });
    const title = draft?.title ?? `${firstSegment(state.pageTitle) || brand.name} · mockup`;
    const summary =
      draft?.summary ??
      (applied.length ? `Applies ${applied.length} spec change${applied.length === 1 ? "" : "s"}: ${applied.join("; ")}` : "No spec changes on this page");
    return { slug, sourceUrl: state.url, title, summary, html, source: draft ? llmPageSource(llm) : ("template" as const), bytes: new TextEncoder().encode(html).length };
  });

  return { generatedAt: new Date().toISOString(), brand, pages, llm: llm.name };
}
