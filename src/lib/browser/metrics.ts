import { Tokenizer } from "htmlparser2";
import { PageMetrics, type EvaluatingPage, type Viewport } from "../contracts";
import { MAX_HTML_CHARS } from "./extract";

/** Seconds a visitor spends per screen of scrolling while scanning (a rough glance budget). */
export const SCROLL_SEC_PER_SCREEN = 1.5;
/** CTAs whose prominence is within this fraction of the most prominent one count as "equally prominent". */
export const CTA_PROMINENCE_TIE = 0.75;
/** Search triggers, menu toggles and dismiss buttons are utilities, not calls to action. */
const UTILITY_CONTROL_LABEL = /^\s*(search|open menu|close|menu|toggle)\b/i;


/**
 * Plain-JS expression evaluated in the page (Playwright, Browserbase Function, Stagehand).
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
    const v =
      r.width >= 1 && r.height >= 1 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0 &&
      (typeof el.checkVisibility !== "function" || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
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

/** Elements whose contents are not page text or controls (and are never measured). */
const DROPPED_TAGS = new Set(["script", "style", "noscript", "template", "svg"]);
const HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
const MAX_COLLECTED_TEXT = 240;
const LINK_BUTTON_CLASS = /\b(btn|button|cta)\b/i;
const BRAND_CLASS = /\b(logo|brand)/i;
const ROLE_SEARCH_ATTRS = ["name", "placeholder", "aria-label"];

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

interface NavBlockStats {
  state: "pending" | "open" | "done";
  depth: number;
  links: number;
  hasRootLink: boolean;
  hasBrand: boolean;
  hasMenuToggle: boolean;
}

interface OpenAnchor {
  text: string;
  ariaLabel: boolean;
  blocks: NavBlockStats[];
}

/**
 * Best-effort metrics from raw HTML when no live page is available. Layout-dependent
 * fields (height, fold, prominence, font sizes, density) are null; nav and trunk-test
 * signals come from markup conventions (header/nav, logo links, aria-current, search inputs).
 *
 * One linear pass with htmlparser2's Tokenizer over capped input: open-tag…close-tag
 * regexes are quadratic on unclosed openers, which a hostile page controls.
 */
export function metricsFromHtml(rawHtml: string, pageUrl: string, viewport: Viewport): PageMetrics {
  const html = rawHtml.length > MAX_HTML_CHARS ? rawHtml.slice(0, MAX_HTML_CHARS) : rawHtml;
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    /* keep empty */
  }
  const rootHrefs = new Set(["/", origin, `${origin}/`]);

  const newBlock = (): NavBlockStats => ({ state: "pending", depth: 0, links: 0, hasRootLink: false, hasBrand: false, hasMenuToggle: false });
  const header = newBlock();
  const nav = newBlock();
  const openBlocks = () => [header, nav].filter((b) => b.state === "open");

  const levels: { level: number; text: string }[] = [];
  let heading: { level: number; text: string } | undefined;
  let anchor: OpenAnchor | undefined;
  let dropDepth = 0;
  let ctas = 0;
  let hasSearch = false;
  let hasYouAreHere = false;

  const finishHeading = () => {
    if (heading) levels.push({ level: heading.level, text: collapse(heading.text) });
    heading = undefined;
  };
  const finishAnchor = () => {
    if (!anchor) return;
    if (collapse(anchor.text) || anchor.ariaLabel) for (const b of anchor.blocks) b.links++;
    anchor = undefined;
  };
  const addText = (text: string) => {
    if (dropDepth > 0) return;
    if (heading && heading.text.length < MAX_COLLECTED_TEXT) heading.text += text.slice(0, MAX_COLLECTED_TEXT - heading.text.length);
    if (anchor && anchor.text.length < MAX_COLLECTED_TEXT) anchor.text += text.slice(0, MAX_COLLECTED_TEXT - anchor.text.length);
  };

  const isUtility = (a: Record<string, string>) =>
    "aria-expanded" in a || "aria-controls" in a || "aria-haspopup" in a ||
    UTILITY_CONTROL_LABEL.test(`${a["aria-label"] ?? ""} ${a.title ?? ""}`);

  const openTag = (name: string, a: Record<string, string>, selfClosing: boolean) => {
    if (DROPPED_TAGS.has(name)) {
      if (!selfClosing) dropDepth++;
      return;
    }
    if (dropDepth > 0) return;
    addText(" ");

    if ((name === "header" || name === "nav")) {
      const block = name === "header" ? header : nav;
      if (block.state === "pending") block.state = "open";
      if (block.state === "open") block.depth++;
    }
    const blocks = openBlocks();
    if (a.class !== undefined && BRAND_CLASS.test(a.class)) for (const b of blocks) b.hasBrand = true;

    const level = HEADING_LEVEL[name];
    if (level) {
      finishHeading();
      heading = { level, text: "" };
    }
    if (name === "button") {
      if (!isUtility(a)) ctas++;
      const toggle = "aria-expanded" in a || "aria-controls" in a || Object.entries(a).some(([k, v]) => /menu/i.test(`${k}=${v}`));
      if (toggle) for (const b of blocks) b.hasMenuToggle = true;
    }
    if (name === "input") {
      const type = (a.type ?? "").trim().toLowerCase();
      if (type === "submit" || type === "button") ctas++;
      if (type === "search" || ROLE_SEARCH_ATTRS.some((k) => /search/i.test(a[k] ?? ""))) hasSearch = true;
    }
    if (name === "img" && (a.alt ?? "").trim()) for (const b of blocks) b.hasBrand = true;
    if (name === "a") {
      finishAnchor();
      if (a.role === "button" || LINK_BUTTON_CLASS.test(a.class ?? "")) ctas++;
      if (rootHrefs.has(a.href ?? "")) for (const b of blocks) b.hasRootLink = true;
      if (a.href !== undefined) anchor = { text: "", ariaLabel: !!a["aria-label"], blocks };
    }
    if ((a.role ?? "").trim().toLowerCase() === "search") hasSearch = true;
    if (a["aria-current"] !== undefined && a["aria-current"].trim().toLowerCase() !== "false") hasYouAreHere = true;
    if (Object.entries(a).some(([k, v]) => /breadcrumb/i.test(k) || /breadcrumb/i.test(v))) hasYouAreHere = true;
  };

  const closeTag = (name: string) => {
    if (DROPPED_TAGS.has(name)) {
      if (dropDepth > 0) dropDepth--;
      return;
    }
    if (dropDepth > 0) return;
    addText(" ");
    if (HEADING_LEVEL[name]) finishHeading();
    if (name === "a") finishAnchor();
    if (name === "header" || name === "nav") {
      const block = name === "header" ? header : nav;
      if (block.state === "open" && --block.depth === 0) block.state = "done";
    }
  };

  let tagName = "";
  let attribs: Record<string, string> = {};
  let attribName = "";
  let attribValue = "";
  const tokenizer = new Tokenizer(
    { xmlMode: false, decodeEntities: true },
    {
      ontext: (start, end) => addText(html.slice(start, end)),
      ontextentity: (cp) => addText(String.fromCodePoint(cp)),
      onopentagname: (start, end) => {
        tagName = html.slice(start, end).toLowerCase();
        attribs = {};
      },
      onattribname: (start, end) => {
        attribName = html.slice(start, end).toLowerCase();
      },
      onattribdata: (start, end) => {
        if (attribValue.length < MAX_COLLECTED_TEXT) attribValue += html.slice(start, Math.min(end, start + MAX_COLLECTED_TEXT));
      },
      onattribentity: (cp) => {
        if (attribValue.length < MAX_COLLECTED_TEXT) attribValue += String.fromCodePoint(cp);
      },
      onattribend: () => {
        if (!Object.prototype.hasOwnProperty.call(attribs, attribName)) attribs[attribName] = attribValue;
        attribValue = "";
      },
      onopentagend: () => openTag(tagName, attribs, false),
      onselfclosingtag: () => openTag(tagName, attribs, true),
      onclosetag: (start, end) => closeTag(html.slice(start, end).toLowerCase()),
      oncomment: () => {},
      oncdata: () => {},
      ondeclaration: () => {},
      onprocessinginstruction: () => {},
      onend: () => {
        finishHeading();
        finishAnchor();
      },
    },
  );
  tokenizer.write(html);
  tokenizer.end();

  const skipped = new Set<string>();
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].level > levels[i - 1].level + 1) skipped.add(`h${levels[i - 1].level}→h${levels[i].level}`);
  }
  const h1s = levels.filter((h) => h.level === 1);
  const navBlock = nav.links > header.links ? nav : header;

  return {
    source: "html",
    pageHeightPx: null,
    viewportHeightPx: viewport.height,
    foldRatio: null,
    estimatedScrollTimeSec: null,
    aboveFoldCtaCount: null,
    totalCtaCount: ctas,
    primaryCtaAmbiguity: null,
    primaryCtaLabels: [],
    headingOutline: { h1Count: h1s.length, h1Text: h1s.map((h) => h.text.slice(0, 120)).filter(Boolean).slice(0, 5), skippedLevels: [...skipped] },
    navItemCount: navBlock.links,
    fontSizeBuckets: null,
    textDensity: null,
    largestTextIsH1: null,
    trunkTest: {
      hasSiteName: navBlock.hasRootLink || navBlock.hasBrand,
      hasPageName: h1s.some((h) => h.text.length > 0),
      hasPrimaryNav: navBlock.links >= 3 || navBlock.hasMenuToggle,
      hasSearch,
      hasYouAreHere,
    },
  };
}
