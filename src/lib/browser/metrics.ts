import { z } from "zod";
import type { Viewport } from "../contracts";

/** Seconds a visitor spends per screen of scrolling while scanning (rough Krug-style glance budget). */
export const SCROLL_SEC_PER_SCREEN = 1.5;
/** CTAs whose prominence is within this fraction of the most prominent one count as "equally prominent". */
export const CTA_PROMINENCE_TIE = 0.75;
/** Search triggers, menu toggles and dismiss buttons are utilities, not calls to action. */
const UTILITY_CONTROL_LABEL = /^\s*(search|open menu|close|menu|toggle)\b/i;

/**
 * Scanning/usability measurements for one rendered page (Krug K2/K4/K6/K7).
 * `source: "browser"` = measured in a real layout via page.evaluate; `"html"` = DOM-only
 * fallback where layout-dependent fields are null.
 */
export const PageMetrics = z.object({
  source: z.enum(["browser", "html"]),
  pageHeightPx: z.number().nullable(),
  viewportHeightPx: z.number(),
  /** pageHeight / viewportHeight = screens of scrolling. */
  foldRatio: z.number().nullable(),
  estimatedScrollTimeSec: z.number().nullable(),
  aboveFoldCtaCount: z.number().int().nullable(),
  totalCtaCount: z.number().int(),
  /** Above-fold CTAs tied for most prominent (area x font size); 1 = a clear primary action. */
  primaryCtaAmbiguity: z.number().int().nullable(),
  primaryCtaLabels: z.array(z.string()),
  headingOutline: z.object({
    h1Count: z.number().int(),
    h1Text: z.array(z.string()),
    skippedLevels: z.array(z.string()),
  }),
  navItemCount: z.number().int(),
  /** Visible text characters per rendered font size, largest size first. */
  fontSizeBuckets: z.array(z.object({ px: z.number(), chars: z.number().int() })).nullable(),
  /** Visible above-the-fold text characters per 10,000 px² of viewport. */
  textDensity: z.number().nullable(),
  largestTextIsH1: z.boolean().nullable(),
  trunkTest: z.object({
    hasSiteName: z.boolean(),
    hasPageName: z.boolean(),
    hasPrimaryNav: z.boolean(),
    hasSearch: z.boolean(),
    hasYouAreHere: z.boolean(),
  }),
});
export type PageMetrics = z.infer<typeof PageMetrics>;

/**
 * Plain-JS expression evaluated in the page (Playwright, Bright Data CDP, Stagehand).
 * Kept as a string so bundler/transpiler helpers never leak into the browser context.
 */
export const MEASURE_SCRIPT = `(() => {
  const SEC_PER_SCREEN = ${SCROLL_SEC_PER_SCREEN};
  const TIE = ${CTA_PROMINENCE_TIE};
  const UTILITY_LABEL = ${UTILITY_CONTROL_LABEL.toString()};
  const vw = window.innerWidth, vh = window.innerHeight;
  const body = document.body || document.documentElement;
  const pageHeight = Math.max(document.documentElement.scrollHeight, body.scrollHeight, vh);
  const styleCache = new Map();
  const style = (el) => { let s = styleCache.get(el); if (!s) { s = getComputedStyle(el); styleCache.set(el, s); } return s; };
  const visCache = new Map();
  const visible = (el) => {
    if (visCache.has(el)) return visCache.get(el);
    const r = el.getBoundingClientRect();
    const s = style(el);
    const v = r.width >= 1 && r.height >= 1 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0;
    visCache.set(el, v);
    return v;
  };
  const top = (el) => el.getBoundingClientRect().top + window.scrollY;
  const aboveFold = (el) => { const r = el.getBoundingClientRect(); const t = r.top + window.scrollY; return t < vh && t + r.height > 0; };
  const text = (el) => (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().slice(0, 80);
  const cls = (el) => (typeof el.className === "string" ? el.className : "");
  const transparent = (c) => !c || c === "transparent" || /rgba\\([^)]*,\\s*0\\)$/.test(c);
  const linkLooksLikeButton = (a) => {
    if (a.getAttribute("role") === "button") return true;
    if (/\\b(btn|button|cta)\\b/i.test(cls(a))) return true;
    const s = style(a);
    const padded = parseFloat(s.paddingLeft) >= 8 && parseFloat(s.paddingTop) >= 4;
    const filled = !transparent(s.backgroundColor);
    const outlined = parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle !== "none" && parseFloat(s.borderTopLeftRadius) > 0;
    return padded && (filled || outlined);
  };

  const utilityControl = (el) =>
    el.hasAttribute("aria-expanded") || el.hasAttribute("aria-controls") || el.hasAttribute("aria-haspopup") ||
    UTILITY_LABEL.test((el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "") + " " + text(el));

  const CTA_SEL = 'button, [role="button"], input[type="submit"], input[type="button"], a[href]';
  const ctas = [];
  for (const el of document.querySelectorAll(CTA_SEL)) {
    if (!visible(el)) continue;
    if (el.tagName === "A" && !linkLooksLikeButton(el)) continue;
    if (utilityControl(el)) continue;
    const parent = el.parentElement && el.parentElement.closest(CTA_SEL);
    if (parent && ctas.some((c) => c.el === parent)) continue;
    const r = el.getBoundingClientRect();
    ctas.push({ el, label: text(el), fold: aboveFold(el), score: r.width * r.height * parseFloat(style(el).fontSize || "16") });
  }
  const fold = ctas.filter((c) => c.fold);
  const maxScore = Math.max(0, ...fold.map((c) => c.score));
  const tied = fold.filter((c) => maxScore > 0 && c.score >= TIE * maxScore);

  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const levels = headings.map((h) => Number(h.tagName[1]));
  const skipped = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) skipped.push("h" + levels[i - 1] + "→h" + levels[i]);
  }
  const h1s = headings.filter((h) => h.tagName === "H1");
  const h1Text = h1s.map((h) => (h.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120)).filter(Boolean).slice(0, 5);

  const navs = [...document.querySelectorAll('nav, [role="navigation"]')].filter((n) => visible(n) && top(n) < vh);
  const navRoots = navs.length > 0 ? navs : [...document.querySelectorAll("header")].filter(visible);
  const navItems = new Set();
  for (const root of navRoots) {
    for (const el of root.querySelectorAll('a[href], button, [role="menuitem"]')) {
      if (visible(el) && text(el)) navItems.add(el);
    }
  }

  const buckets = new Map();
  let foldChars = 0, maxPx = 0, maxInH1 = false;
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
    const t = (n.textContent || "").replace(/\\s+/g, " ").trim();
    if (!t || !visible(el)) continue;
    const px = Math.round(parseFloat(style(el).fontSize || "16"));
    buckets.set(px, (buckets.get(px) || 0) + t.length);
    if (aboveFold(el)) foldChars += t.length;
    if (t.length >= 3) {
      const inH1 = !!el.closest("h1");
      if (px > maxPx) { maxPx = px; maxInH1 = inH1; } else if (px === maxPx && inH1) maxInH1 = true;
    }
  }
  const fontSizeBuckets = [...buckets.entries()].sort((a, b) => b[0] - a[0]).slice(0, 10).map(([px, chars]) => ({ px, chars }));

  const topArea = (el) => visible(el) && top(el) < vh * 0.5;
  const any = (sel, pred) => [...document.querySelectorAll(sel)].some(pred);
  const origin = location.origin;
  const hasSiteName =
    any('a[href="/"], a[href="' + origin + '"], a[href="' + origin + '/"], [aria-label*="home" i]', topArea) ||
    any('[class*="logo" i], [class*="brand" i], [id*="logo" i]', topArea) ||
    any("header img[alt]", (img) => topArea(img) && !!img.getAttribute("alt").trim());
  const hasPageName = h1s.some((h) => visible(h) && (h.textContent || "").trim().length > 0);
  const hasMenuToggle = any('button, [role="button"]', (b) =>
    topArea(b) && (b.hasAttribute("aria-expanded") || b.hasAttribute("aria-controls") || /menu|navigation/i.test(text(b))));
  const hasSearch =
    any('input[type="search"], [role="search"], input[name*="search" i], input[placeholder*="search" i], input[aria-label*="search" i]', visible) ||
    any('a[href], button, [role="button"]', (el) => visible(el) && /^search\\b/i.test(text(el)));
  const hasYouAreHere =
    any('[aria-current]:not([aria-current="false"])', visible) ||
    any('nav[aria-label*="breadcrumb" i], [class*="breadcrumb" i]', visible) ||
    navRoots.some((r) => [...r.querySelectorAll("a[href]")].some((a) => visible(a) && /\\b(active|current|selected)\\b/i.test(cls(a))));

  const foldRatio = Math.round((pageHeight / vh) * 100) / 100;
  return {
    source: "browser",
    pageHeightPx: Math.round(pageHeight),
    viewportHeightPx: vh,
    foldRatio,
    estimatedScrollTimeSec: Math.round(foldRatio * SEC_PER_SCREEN * 10) / 10,
    aboveFoldCtaCount: fold.length,
    totalCtaCount: ctas.length,
    primaryCtaAmbiguity: tied.length,
    primaryCtaLabels: tied.map((c) => c.label).filter(Boolean).slice(0, 8),
    headingOutline: { h1Count: h1s.length, h1Text, skippedLevels: [...new Set(skipped)] },
    navItemCount: navItems.size,
    fontSizeBuckets,
    textDensity: Math.round((foldChars / (vw * vh)) * 10000 * 10) / 10,
    largestTextIsH1: maxPx > 0 ? maxInH1 : null,
    trunkTest: { hasSiteName, hasPageName, hasPrimaryNav: navItems.size >= 3 || hasMenuToggle, hasSearch, hasYouAreHere },
  };
})()`;

/** Anything with a string-expression `evaluate` — Playwright pages (local or CDP) and Stagehand pages. */
export interface EvaluatingPage {
  evaluate(expression: string): Promise<unknown>;
}

/** The runner hook: measure the currently loaded page. Never throws — returns undefined on failure. */
export async function measurePage(page: EvaluatingPage): Promise<PageMetrics | undefined> {
  try {
    const parsed = PageMetrics.safeParse(await page.evaluate(MEASURE_SCRIPT));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// ── HTML-only fallback ──────────────────────────────────────────────────────

const DROP_RE = /<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi;
const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const attrOf = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|[^\\s>]+)`, "i"))?.slice(2).find((v) => v !== undefined);

function firstBlock(html: string, tag: string): string | null {
  return html.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "i"))?.[0] ?? null;
}

/**
 * Best-effort metrics from raw HTML when no live page is available. Layout-dependent
 * fields (height, fold, prominence, font sizes, density) are null; nav and trunk-test
 * signals come from markup conventions (header/nav, logo links, aria-current, search inputs).
 */
export function metricsFromHtml(html: string, pageUrl: string, viewport: Viewport): PageMetrics {
  const doc = html.replace(DROP_RE, " ");
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    /* keep empty */
  }

  const levels = [...doc.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: plain(m[2]) }));
  const skipped = new Set<string>();
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].level > levels[i - 1].level + 1) skipped.add(`h${levels[i - 1].level}→h${levels[i].level}`);
  }
  const h1s = levels.filter((h) => h.level === 1);

  const isUtility = (tag: string) =>
    /aria-(expanded|controls|haspopup)/i.test(tag) ||
    UTILITY_CONTROL_LABEL.test(`${attrOf(tag, "aria-label") ?? ""} ${attrOf(tag, "title") ?? ""}`);
  const buttons =
    [...doc.matchAll(/<button\b[^>]*>/gi)].filter((m) => !isUtility(m[0])).length +
    [...doc.matchAll(/<input\b[^>]*type\s*=\s*["']?(submit|button)/gi)].length;
  const linkButtons = [...doc.matchAll(/<a\b[^>]*>/gi)].filter((m) => {
    const tag = m[0];
    return attrOf(tag, "role") === "button" || /\b(btn|button|cta)\b/i.test(attrOf(tag, "class") ?? "");
  }).length;

  const linkCount = (block: string) =>
    [...block.matchAll(/<a\b[^>]*href[^>]*>([\s\S]*?)<\/a>/gi)].filter((m) => plain(m[1]) || attrOf(m[0], "aria-label")).length;
  const navBlock = [firstBlock(doc, "header"), firstBlock(doc, "nav")]
    .filter((b): b is string => !!b)
    .reduce((best, b) => (linkCount(b) > linkCount(best) ? b : best), firstBlock(doc, "header") ?? "");
  const navItemCount = linkCount(navBlock);
  const navButtons = [...navBlock.matchAll(/<button\b[^>]*>/gi)];

  const rootHrefs = new Set(["/", origin, `${origin}/`]);
  const hasSiteName =
    [...navBlock.matchAll(/<a\b[^>]*>/gi)].some((m) => rootHrefs.has(attrOf(m[0], "href") ?? "")) ||
    /class\s*=\s*["'][^"']*\b(logo|brand)/i.test(navBlock) ||
    /<img\b[^>]*alt\s*=\s*["'][^"']+["']/i.test(navBlock);
  const hasMenuToggle = navButtons.some((m) => /aria-(expanded|controls)|menu/i.test(m[0]));

  return {
    source: "html",
    pageHeightPx: null,
    viewportHeightPx: viewport.height,
    foldRatio: null,
    estimatedScrollTimeSec: null,
    aboveFoldCtaCount: null,
    totalCtaCount: buttons + linkButtons,
    primaryCtaAmbiguity: null,
    primaryCtaLabels: [],
    headingOutline: { h1Count: h1s.length, h1Text: h1s.map((h) => h.text.slice(0, 120)).filter(Boolean).slice(0, 5), skippedLevels: [...skipped] },
    navItemCount,
    fontSizeBuckets: null,
    textDensity: null,
    largestTextIsH1: null,
    trunkTest: {
      hasSiteName,
      hasPageName: h1s.some((h) => h.text.length > 0),
      hasPrimaryNav: navItemCount >= 3 || hasMenuToggle,
      hasSearch:
        /<input\b[^>]*(type\s*=\s*["']?search|(name|placeholder|aria-label)\s*=\s*["'][^"']*search)/i.test(doc) || /role\s*=\s*["']search/i.test(doc),
      hasYouAreHere: /aria-current\s*=\s*["']?(?!false)/i.test(doc) || /breadcrumb/i.test(doc),
    },
  };
}
