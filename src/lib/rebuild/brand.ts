import { BrandSignals, type BrandProfile, type EvaluatingPage, type SiteState } from "../contracts";

const MAX_HTML_CHARS = 2_000_000;
const CAP = { cssVars: 64, colors: 24, fonts: 12, navItems: 20 } as const;
const MAX_CTA_LABELS = 12;

export const FALLBACK_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FALLBACK_PALETTE = { ink: "#111111", surface: "#ffffff", muted: "#6b6b6b", line: "#ededed" } as const;

/** Labels a site uses for a call to action (shared with goal inference). */
export const CTA_VERB_RE =
  /\b(apply|register|sign ?up|buy|book|subscribe|join|contact|demo|pricing|get started|try|download|schedule|rsvp|donate|enroll|order|watch|learn|find)\b/i;
const UTILITY_LABEL_RE = /^\s*(search|open menu|close|menu|toggle|skip to)\b/i;

// ── small parsing helpers (regex-only, like src/lib/browser/extract.ts) ─────

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  const v = m?.[2] ?? m?.[3] ?? m?.[4];
  return v === undefined ? undefined : decodeEntities(v).trim();
}

function resolveHttp(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trim() : s;
}

/** Rank values by summed reciprocal position across lists (frequency proxy); ties keep first appearance. */
function rankUnion(lists: string[][], cap: number): string[] {
  const score = new Map<string, number>();
  const first = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    list.forEach((v, i) => {
      score.set(v, (score.get(v) ?? 0) + (cap - Math.min(i, cap - 1)));
      if (!first.has(v)) first.set(v, order++);
    });
  }
  return [...score.keys()]
    .sort((a, b) => score.get(b)! - score.get(a)! || first.get(a)! - first.get(b)!)
    .slice(0, cap);
}

function byFrequency(values: string[], cap: number): string[] {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!).slice(0, cap);
}

function dedupeNav(items: { label: string; href: string }[], cap: number): { label: string; href: string }[] {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const it of items) {
    const key = `${it.label.toLowerCase()}|${it.href.replace(/\/$/, "")}`;
    if (!it.label || !it.href || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= cap) break;
  }
  return out;
}

// ── colors ──────────────────────────────────────────────────────────────────

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const COLOR_TOKEN_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
const COLOR_PROP_RE = /^(color|background|background-color|border|border-color|border-top|border-bottom|outline-color|fill|stroke|--.+)$/i;

function hex2(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Parse #hex / rgb() / hsl() (comma or space syntax). Undefined when not a concrete color. */
export function parseColor(value: string): Rgb | undefined {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return undefined;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = v.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (!fn) return undefined;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return undefined;
  const num = (p: string, scale: number) => (p.endsWith("%") ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const alpha = parts[3] !== undefined ? num(parts[3], 1) : 1;
  let rgb: [number, number, number];
  if (fn[1].startsWith("rgb")) {
    rgb = [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255)];
  } else {
    rgb = hslToRgb(parseFloat(parts[0]) % 360, num(parts[1], 1) / (parts[1].endsWith("%") ? 1 : 100), num(parts[2], 1) / (parts[2].endsWith("%") ? 1 : 100));
  }
  if (rgb.some((n) => !Number.isFinite(n)) || !Number.isFinite(alpha)) return undefined;
  return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
}

function toHex(c: Rgb): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

/** Canonical form for a color token: #rrggbb when opaque, compact rgba() otherwise. */
function canonicalColor(token: string): string | undefined {
  const c = parseColor(token);
  if (!c) return undefined;
  if (c.a >= 0.999) return toHex(c);
  if (c.a <= 0) return undefined;
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.round(c.a * 100) / 100})`;
}

/** WCAG relative luminance (0 black … 1 white). */
export function luminance(c: Rgb): number {
  const ch = (n: number) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function saturation(c: Rgb): number {
  const max = Math.max(c.r, c.g, c.b) / 255;
  const min = Math.min(c.r, c.g, c.b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

function colorsInDeclarations(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/(?:^|[;{\s])(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+)/gi)) {
    if (!COLOR_PROP_RE.test(m[1])) continue;
    for (const t of m[2].matchAll(COLOR_TOKEN_RE)) {
      const c = canonicalColor(t[0]);
      if (c) out.push(c);
    }
  }
  return out;
}

function fontsInDeclarations(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) {
    const f = normalizeFont(m[1]);
    if (f) out.push(f);
  }
  return out;
}

function normalizeFont(raw: string): string | undefined {
  const f = decodeEntities(raw)
    .replace(/!important/i, "")
    .split(",")
    .map((p) => p.trim().replace(/^'([^']*)'$/, '"$1"'))
    .filter(Boolean)
    .join(", ");
  if (!f || f.length > 200 || /^(inherit|initial|unset|revert|var\()/i.test(f)) return undefined;
  return f;
}

// ── declared signals from HTML ──────────────────────────────────────────────

const LOGOISH_RE = /logo|brand|wordmark/i;

function firstLogo(block: string, pageUrl: string): { logoUrl?: string; logoAlt?: string } {
  const imgs = [...block.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const pick =
    imgs.find((t) => LOGOISH_RE.test(`${attr(t, "class") ?? ""} ${attr(t, "alt") ?? ""} ${attr(t, "src") ?? ""} ${attr(t, "id") ?? ""}`)) ??
    [...block.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)]
      .filter((m) => {
        const href = resolveHttp(attr(m[0], "href"), pageUrl);
        return !!href && new URL(href).pathname.replace(/\/+$/, "") === "";
      })
      .map((m) => m[0].match(/<img\b[^>]*>/i)?.[0])
      .find((t): t is string => !!t);
  if (!pick) return {};
  const logoUrl = resolveHttp(attr(pick, "src"), pageUrl);
  const alt = attr(pick, "alt");
  return { ...(logoUrl ? { logoUrl } : {}), ...(alt ? { logoAlt: clip(alt, 120) } : {}) };
}

function navFrom(blocks: string[], pageUrl: string): { label: string; href: string }[] {
  const origin = originOf(pageUrl);
  const items: { label: string; href: string }[] = [];
  for (const block of blocks) {
    for (const m of block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      const raw = attr(m[0], "href");
      if (!raw || raw === "#" || /^\s*javascript:/i.test(raw)) continue;
      const href = resolveHttp(raw, pageUrl);
      if (!href || originOf(href) !== origin) continue;
      const full = textOf(m[1]);
      const firstChunk = m[1].split(/<[^>]+>/).map((c) => textOf(c)).find(Boolean) ?? "";
      const label = clip((full.length > 30 && firstChunk.length >= 2 ? firstChunk : full) || attr(m[0], "aria-label") || "", 80);
      if (!label || UTILITY_LABEL_RE.test(label)) continue;
      items.push({ label, href });
    }
  }
  return dedupeNav(items, CAP.navItems);
}

/** Declared design signals parsed from raw HTML (`:root` vars, meta, nav, logo). Never throws. */
export function brandSignalsFromHtml(html: string, pageUrl: string): BrandSignals {
  const empty: BrandSignals = { cssVars: {}, colors: [], fonts: [], navItems: [] };
  try {
    const doc = String(html ?? "").slice(0, MAX_HTML_CHARS).replace(/<!--[\s\S]*?-->/g, " ");
    const styles = [...doc.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    const inline = [...doc.matchAll(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((m) => decodeEntities(m[2] ?? m[3] ?? ""));

    const cssVars: Record<string, string> = {};
    for (const css of styles) {
      for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        if (!/(^|,)\s*(:root|html)\s*(?=,|$)/i.test(rule[1].trim())) continue;
        for (const d of rule[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
          const value = d[2].replace(/!important/i, "").trim();
          if (!value || value.length > 200) continue;
          if (!(d[1] in cssVars) && Object.keys(cssVars).length >= CAP.cssVars) continue;
          cssVars[d[1]] = value;
        }
      }
    }

    // Utility-class arbitrary colors (Tailwind `bg-[#101010]`) are declared design tokens too.
    const classColors: string[] = [];
    for (const m of doc.matchAll(/\b(?:bg|text|border|from|via|to|fill|stroke|ring|outline|decoration)-\[(#[0-9a-fA-F]{3,8})\]/g)) {
      const c = canonicalColor(m[1]);
      if (c) classColors.push(c);
    }
    const colors = byFrequency([...styles.flatMap(colorsInDeclarations), ...inline.flatMap(colorsInDeclarations), ...classColors], CAP.colors);
    const fonts = byFrequency([...styles.flatMap(fontsInDeclarations), ...inline.flatMap(fontsInDeclarations)], CAP.fonts);

    const metas = [...doc.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
    const metaContent = (key: string, value: string) => {
      const tag = metas.find((t) => (attr(t, key) ?? "").toLowerCase() === value);
      return tag ? attr(tag, "content") || undefined : undefined;
    };
    const themeColor = metaContent("name", "theme-color");
    const titleText = doc.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g, "") ?? "";
    const siteName =
      metaContent("property", "og:site_name") ??
      metaContent("name", "og:site_name") ??
      metaContent("name", "application-name") ??
      metaContent("name", "apple-mobile-web-app-title") ??
      nameFromTitle(metaContent("property", "og:title") ?? metaContent("name", "twitter:title") ?? titleText);

    const links = [...doc.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const relIs = (t: string, re: RegExp) => re.test(attr(t, "rel") ?? "");
    const iconTag = links.find((t) => relIs(t, /(^|\s)icon(\s|$)/i)) ?? links.find((t) => relIs(t, /apple-touch-icon/i));
    const faviconUrl = iconTag ? resolveHttp(attr(iconTag, "href"), pageUrl) : undefined;

    const header = doc.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0];
    const navs = [...doc.matchAll(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi)].map((m) => m[0]);
    const navItems = navFrom([header, ...navs].filter((b): b is string => !!b), pageUrl);
    const logo = firstLogo(header ?? doc.slice(0, 50_000), pageUrl);

    return {
      cssVars,
      colors,
      fonts,
      navItems,
      ...(faviconUrl ? { faviconUrl } : {}),
      ...logo,
      ...(themeColor ? { themeColor: clip(themeColor, 64) } : {}),
      ...(siteName ? { siteName: clip(siteName, 80) } : {}),
    };
  } catch {
    return empty;
  }
}

// ── computed signals from a live page ───────────────────────────────────────

/**
 * Plain-JS expression evaluated in the page, MEASURE_SCRIPT style: a string so
 * transpiler helpers never leak into the browser context.
 */
export const BRAND_SCRIPT = `(() => {
  const CAP = ${JSON.stringify(CAP)};
  const UTILITY = ${UTILITY_LABEL_RE.toString()};
  const LOGOISH = ${LOGOISH_RE.toString()};
  const bump = (m, v) => { if (v) m.set(v, (m.get(v) || 0) + 1); };
  const ranked = (m, cap) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap).map((e) => e[0]);
  const transparent = (c) => !c || c === "transparent" || /rgba\\([^)]*,\\s*0\\)$/.test(c);
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);

  const names = [];
  const seen = new Set();
  const addName = (n) => { if (n.startsWith("--") && !seen.has(n) && names.length < CAP.cssVars) { seen.add(n); names.push(n); } };
  let budget = 5000;
  const walk = (rules) => {
    for (const rule of Array.from(rules || [])) {
      if (--budget < 0) return;
      try {
        if (rule.style && typeof rule.selectorText === "string" && /(^|,)\\s*(:root|html)\\s*(,|$)/i.test(rule.selectorText)) {
          for (let i = 0; i < rule.style.length; i++) addName(rule.style[i]);
        }
        if (rule.cssRules) walk(rule.cssRules);
      } catch (e) { /* skip */ }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = null;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    walk(rules);
  }
  for (let i = 0; i < root.style.length; i++) addName(root.style[i]);
  const cssVars = {};
  for (const n of names) {
    const v = rootStyle.getPropertyValue(n).trim();
    if (v && v.length <= 200) cssVars[n] = v;
  }

  const colors = new Map();
  const fonts = new Map();
  for (const sel of ["body", "h1", "h2", "a", "button", "header", "nav"]) {
    const els = Array.from(document.querySelectorAll(sel)).slice(0, 20);
    for (const el of els) {
      const s = getComputedStyle(el);
      bump(colors, s.color);
      if (!transparent(s.backgroundColor)) bump(colors, s.backgroundColor);
      bump(fonts, (s.fontFamily || "").trim());
    }
  }

  const meta = (sel) => { const m = document.querySelector(sel); return m ? (m.getAttribute("content") || "").trim() : ""; };
  const icon = document.querySelector('link[rel~="icon"]') || document.querySelector('link[rel="apple-touch-icon"]');
  const header = document.querySelector("header");
  const scope = header || document.body;
  let logo = null;
  if (scope) {
    const imgs = Array.from(scope.querySelectorAll("img"));
    logo = imgs.find((img) => LOGOISH.test([img.className, img.alt, img.getAttribute("src"), img.id].join(" "))) ||
      imgs.find((img) => { const a = img.closest("a"); return !!a && a.href && new URL(a.href, location.href).pathname.replace(/\\/+$/, "") === ""; }) || null;
  }

  const navItems = [];
  const navSeen = new Set();
  const roots = [header, ...Array.from(document.querySelectorAll('nav, [role="navigation"]'))].filter(Boolean);
  for (const r of roots) {
    for (const a of Array.from(r.querySelectorAll("a[href]"))) {
      if (navItems.length >= CAP.navItems) break;
      const raw = a.getAttribute("href") || "";
      if (!raw || raw === "#" || /^\\s*javascript:/i.test(raw)) continue;
      let href;
      try { href = new URL(a.href, location.href); } catch (e) { continue; }
      if (href.origin !== location.origin) continue;
      const full = (a.innerText || a.textContent || "").replace(/\\s+/g, " ").trim();
      let first = "";
      const tw = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n && !first; n = tw.nextNode()) first = (n.textContent || "").replace(/\\s+/g, " ").trim();
      const label = ((full.length > 30 && first.length >= 2 ? first : full) || a.getAttribute("aria-label") || "").slice(0, 80);
      if (!label || UTILITY.test(label)) continue;
      const key = label.toLowerCase() + "|" + href.toString().replace(/\\/$/, "");
      if (navSeen.has(key)) continue;
      navSeen.add(key);
      navItems.push({ label, href: href.toString() });
    }
  }

  const out = { cssVars, colors: ranked(colors, CAP.colors), fonts: ranked(fonts, CAP.fonts), navItems };
  if (icon && icon.href) out.faviconUrl = icon.href;
  if (logo && logo.src) out.logoUrl = logo.src;
  if (logo && logo.alt) out.logoAlt = logo.alt.slice(0, 120);
  const theme = meta('meta[name="theme-color"]');
  if (theme) out.themeColor = theme.slice(0, 64);
  const site = meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]');
  if (site) out.siteName = site.slice(0, 80);
  return out;
})()`;

/** Computed design signals via page.evaluate. Never throws; undefined when the page can't be evaluated. */
export async function captureBrand(page: EvaluatingPage): Promise<BrandSignals | undefined> {
  try {
    const parsed = BrandSignals.safeParse(await page.evaluate(BRAND_SCRIPT));
    if (!parsed.success) return undefined;
    const d = parsed.data;
    const colors = d.colors.map(canonicalColor).filter((c): c is string => !!c);
    const fonts = d.fonts.map((f) => normalizeFont(f)).filter((f): f is string => !!f);
    return { ...d, colors: [...new Set(colors)].slice(0, CAP.colors), fonts: [...new Set(fonts)].slice(0, CAP.fonts) };
  } catch {
    return undefined;
  }
}

// ── merge + rollup ──────────────────────────────────────────────────────────

/** Merge a computed layer over a declared layer (computed wins per field). */
export function mergeSignals(base: BrandSignals, extra: BrandSignals | undefined): BrandSignals {
  if (!extra) return base;
  const cssVars: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base.cssVars, ...extra.cssVars })) {
    if (Object.keys(cssVars).length >= CAP.cssVars) break;
    cssVars[k] = v;
  }
  const pick = <K extends "faviconUrl" | "logoUrl" | "logoAlt" | "themeColor" | "siteName">(k: K) =>
    (extra[k] ?? base[k]) !== undefined ? { [k]: extra[k] ?? base[k] } : {};
  return {
    cssVars,
    colors: rankUnion([extra.colors ?? [], base.colors ?? []], CAP.colors),
    fonts: rankUnion([extra.fonts ?? [], base.fonts ?? []], CAP.fonts),
    navItems: dedupeNav([...(extra.navItems ?? []), ...(base.navItems ?? [])], CAP.navItems),
    ...pick("faviconUrl"),
    ...pick("logoUrl"),
    ...pick("logoAlt"),
    ...pick("themeColor"),
    ...pick("siteName"),
  };
}

interface Swatch {
  hex: string;
  rgb: Rgb;
  lum: number;
  sat: number;
  rank: number;
}

function swatches(values: string[]): Swatch[] {
  const out: Swatch[] = [];
  const seen = new Set<string>();
  values.forEach((v, i) => {
    const rgb = parseColor(v);
    if (!rgb || rgb.a < 0.5) return;
    const hex = toHex(rgb);
    if (seen.has(hex)) return;
    seen.add(hex);
    out.push({ hex, rgb, lum: luminance(rgb), sat: saturation(rgb), rank: i });
  });
  return out;
}

function varColor(cssVars: Record<string, string>, re: RegExp): Swatch | undefined {
  for (const name of Object.keys(cssVars).sort()) {
    if (!re.test(name)) continue;
    const s = swatches([cssVars[name]])[0];
    if (s) return s;
  }
  return undefined;
}

function resolvePalette(colors: string[], cssVars: Record<string, string>, themeColor?: string): BrandProfile["colors"] {
  const all = swatches([...colors, ...Object.keys(cssVars).sort().map((k) => cssVars[k]), ...(themeColor ? [themeColor] : [])]);
  const byLum = [...all].sort((a, b) => a.lum - b.lum || a.rank - b.rank);

  const surface = varColor(cssVars, /^--(color-)?(background|bg|surface|paper|base)$/i) ?? byLum[byLum.length - 1];
  const ink = varColor(cssVars, /^--(color-)?(foreground|fg|text|ink|body-color)$/i) ?? byLum[0];
  const contrastOk = !!ink && !!surface && contrastRatio(ink.rgb, surface.rgb) >= 4.5;
  const inkHex = contrastOk ? ink!.hex : FALLBACK_PALETTE.ink;
  const surfaceHex = contrastOk ? surface!.hex : FALLBACK_PALETTE.surface;
  const surfaceRgb = parseColor(surfaceHex)!;
  const darkSurface = luminance(surfaceRgb) < 0.2;

  const muted = all
    .filter((s) => s.sat < 0.15 && s.lum > 0.08 && s.lum < 0.45 && s.hex !== inkHex && s.hex !== surfaceHex && contrastRatio(s.rgb, surfaceRgb) >= 3)
    .sort((a, b) => a.rank - b.rank)[0];
  const line = all
    .filter((s) => s.sat < 0.2 && s.hex !== surfaceHex && (darkSurface ? s.lum > 0.005 && s.lum < 0.06 : s.lum > 0.7 && s.lum < 0.97))
    .sort((a, b) => a.rank - b.rank)[0];
  const accent =
    varColor(cssVars, /^--(color-)?(brand|primary|accent)(-color)?$/i) ??
    all
      .filter((s) => s.sat >= 0.35 && s.lum > 0.03 && s.lum < 0.85)
      .sort((a, b) => b.sat / (1 + b.rank / 4) - a.sat / (1 + a.rank / 4) || a.rank - b.rank)[0];
  const link = varColor(cssVars, /link/i);

  return {
    ink: inkHex,
    surface: surfaceHex,
    muted: muted?.hex ?? (darkSurface ? "#a3a3a3" : FALLBACK_PALETTE.muted),
    line: line?.hex ?? (darkSurface ? "#262626" : FALLBACK_PALETTE.line),
    ...(accent ? { accent: accent.hex } : {}),
    ...(link ? { link: link.hex } : {}),
  };
}

const MONO_RE = /\b(mono|monospace|code|courier|consolas|menlo|sfmono)\b/i;
const ICON_FONT_RE = /icon|awesome|material symbols|glyph|symbol/i;
const SERIF_ONLY_RE = /(^|,\s*)serif\s*$/i;

function resolveFonts(fonts: string[]): BrandProfile["fonts"] {
  const usable = fonts.filter((f) => !ICON_FONT_RE.test(f));
  const sansish = usable.find((f) => !MONO_RE.test(f) && !SERIF_ONLY_RE.test(f)) ?? usable.find((f) => !MONO_RE.test(f));
  const mono = usable.find((f) => MONO_RE.test(f));
  const withGeneric = (f: string, generic: string) =>
    /\b(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-monospace)\s*$/i.test(f) ? f : `${f}, ${generic}`;
  return {
    sans: sansish ? withGeneric(sansish, FALLBACK_SANS) : FALLBACK_SANS,
    ...(mono ? { mono: withGeneric(mono, "ui-monospace, SFMono-Regular, Menlo, monospace") } : {}),
  };
}

/** Site name from a page title: "Page | Site" → "Site"; "Site: tagline" → "Site". */
export function nameFromTitle(title: string): string | undefined {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  const parts = t.split(/\s[|–—·•-]\s/).map((p) => p.trim()).filter(Boolean);
  const name = parts.length > 1 ? parts[parts.length - 1] : t.split(/:\s/)[0];
  return clip(name, 60) || undefined;
}

function hostName(url: string | undefined): string {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "Site";
  }
}

/** CTA labels as the site phrases them, most frequent first. */
export function ctaLabelsOf(states: SiteState[]): string[] {
  const labels: string[] = [];
  for (const s of states) {
    for (const a of s.actions) {
      const label = a.label.replace(/\s+/g, " ").trim();
      if (label.length < 2 || label.length > 40 || UTILITY_LABEL_RE.test(label)) continue;
      if (!CTA_VERB_RE.test(label) || /^(learn more|read more|more)$/i.test(label)) continue;
      labels.push(label);
    }
  }
  return byFrequency(labels, MAX_CTA_LABELS);
}

function voice(states: SiteState[]): Pick<BrandProfile, "tone" | "voiceNotes"> {
  const text = states.map((s) => s.visibleText).join("\n").slice(0, 60_000);
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  const sentences = text.split(/[.!?]+\s|\n+/).filter((s) => s.trim().split(/\s+/).length >= 3);
  const exclaims = (text.match(/!(\s|$)/g) ?? []).length;
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const tech = (text.match(/\b(api|apis|sdk|cli|npm|github|endpoint|deploy|open[- ]source|typescript|python|docs)\b/gi) ?? []).length;
  const longWords = words.filter((w) => /\p{L}{3,}/u.test(w));
  const caps = longWords.filter((w) => w === w.toUpperCase() && /\p{Lu}/u.test(w)).length;
  const capsRatio = longWords.length ? caps / longWords.length : 0;
  const perState = states.length ? words.length / states.length : 0;
  const avgSentence = sentences.length ? Math.round(sentences.reduce((n, s) => n + s.trim().split(/\s+/).length, 0) / sentences.length) : 0;

  const notes: string[] = [];
  if (emoji >= 3) notes.push("Uses emoji in copy");
  if (sentences.length && exclaims / sentences.length > 0.08) notes.push("Frequent exclamation marks");
  if (tech >= 5) notes.push("Developer vocabulary (API, SDK, CLI, docs)");
  if (capsRatio > 0.25) notes.push("Stylized ALL-CAPS headlines and labels");
  if (perState > 0 && perState < 150) notes.push("Short, sparse copy per page");
  if (avgSentence > 0) notes.push(`Sentences average about ${avgSentence} words`);

  let tone: BrandProfile["tone"] = "professional";
  if (emoji >= 3 || (sentences.length > 0 && exclaims / sentences.length > 0.15)) tone = "playful";
  else if (tech >= 5 && words.length > 0 && tech / words.length > 0.004) tone = "technical";
  else if (capsRatio > 0.25) tone = "expressive";
  else if (perState > 0 && perState < 150) tone = "minimal";
  return { tone, voiceNotes: notes.slice(0, 5) };
}

/** Roll every state's signals up into the site's design language. Deterministic. */
export function rollupBrand(states: SiteState[], extra?: BrandSignals[]): BrandProfile {
  const layers = [...(extra ?? []), ...states.map((s) => s.brand).filter((b): b is BrandSignals => !!b)];
  const cssVars: Record<string, string> = {};
  for (const l of layers) {
    for (const [k, v] of Object.entries(l.cssVars ?? {})) {
      if (k in cssVars || Object.keys(cssVars).length >= CAP.cssVars) continue;
      cssVars[k] = v;
    }
  }
  const colors = rankUnion(layers.map((l) => l.colors ?? []), CAP.colors);
  const fonts = rankUnion(layers.map((l) => l.fonts ?? []), CAP.fonts);
  const first = <K extends "faviconUrl" | "logoUrl" | "logoAlt" | "themeColor" | "siteName">(k: K) => layers.find((l) => l[k])?.[k];
  const navItems = dedupeNav(layers.flatMap((l) => l.navItems ?? []), CAP.navItems);

  const startUrl = states[0]?.url;
  const name = first("siteName") ?? (states[0] ? nameFromTitle(states[0].pageTitle) : undefined) ?? hostName(startUrl);
  const faviconUrl = first("faviconUrl");
  const logoUrl = first("logoUrl");
  const logoAlt = first("logoAlt");

  return {
    name,
    colors: resolvePalette(colors, cssVars, first("themeColor")),
    fonts: resolveFonts(fonts),
    cssVars,
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(logoAlt ? { logoAlt } : {}),
    navItems,
    ctaLabels: ctaLabelsOf(states),
    ...voice(states),
  };
}
