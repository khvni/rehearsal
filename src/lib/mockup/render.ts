import type { BrandProfile, RebuildPageContent, SiteState } from "../contracts";
import { FALLBACK_SANS, luminance, parseColor } from "../rebuild/brand";
import { escapeHtml as esc } from "../rebuild/sanitize";

const MAX_NAV = 6;
const MAX_SECTIONS = 6;
const MAX_BULLETS = 6;
const MAX_LINKS = 8;

/** Mockup links are either preview paths (same site, self-contained) or plain http(s) exits. */
export function previewHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/experiments/")) return url;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function link(label: string, url: string | undefined, cls = ""): string {
  const href = previewHref(url);
  const c = cls ? ` class="${cls}"` : "";
  return href ? `<a${c} href="${esc(href)}">${esc(label)}</a>` : `<span${c}>${esc(label)}</span>`;
}

/**
 * Render one mockup page: grayscale wireframe, self-contained HTML, no scripts, no external
 * assets at all (sanitizeRebuildHtml with imageOrigins: [] strips img/link tags).
 * `indexHref` points back at the preview index page; `applied` names the spec
 * changes this page carries.
 */
export function renderMockupPage(input: {
  brand: BrandProfile;
  state: SiteState;
  content: RebuildPageContent;
  indexHref: string;
  applied: string[];
}): string {
  const { state, content, indexHref, applied } = input;
  // Previews are grayscale wireframes with no source branding: fixed neutral
  // palette and generic fonts, never the crawled site's colors or type.
  const ink = "#1a1a1a";
  const surface = "#ffffff";
  const muted = "#666666";
  const line = "#e5e5e5";
  const accent = "#555555";
  const linkColor = "#333333";
  const onAccent = surface;
  const sans = FALLBACK_SANS;
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const brand = input.brand;

  // No source branding: the wireframe's brand mark is a neutral label, never the site's name.
  const mark = `<span class="name">Preview</span>`;
  const brandLink = `<a class="brand" href="${esc(indexHref)}">${mark}</a>`;

  const nav = content.nav
    .filter((n) => n.label.trim() && previewHref(n.url))
    .slice(0, MAX_NAV)
    .map((n) => `<li>${link(n.label, n.url)}</li>`)
    .join("");

  const hero = content.hero;
  const cta = previewHref(hero.ctaUrl);
  const ctaHtml = cta
    ? `<a class="cta" href="${esc(cta)}">${esc(hero.ctaLabel)}</a>`
    : `<span class="cta">${esc(hero.ctaLabel)}</span>`;

  const sections = content.sections
    .filter((s) => s.heading.trim())
    .slice(0, MAX_SECTIONS)
    .map((s) => {
      const body = s.body?.trim() ? `<p>${esc(s.body.trim())}</p>` : "";
      const bullets = (s.bullets ?? []).filter((b) => b.trim()).slice(0, MAX_BULLETS);
      const list = bullets.length ? `<ul>${bullets.map((b) => `<li>${esc(b.trim())}</li>`).join("")}</ul>` : "";
      const links = (s.links ?? []).filter((l) => l.label.trim() && previewHref(l.url)).slice(0, MAX_LINKS);
      const linkList = links.length ? `<ul class="links">${links.map((l) => `<li>${link(l.label, l.url)}</li>`).join("")}</ul>` : "";
      return `<section><h2>${esc(s.heading.trim())}</h2>${body}${list}${linkList}</section>`;
    })
    .join("\n");

  const footerLinks = (content.footer?.links ?? []).filter((l) => l.label.trim() && previewHref(l.url)).slice(0, MAX_LINKS);
  const footer = [
    content.footer?.note?.trim() ? `<p>${esc(content.footer.note.trim())}</p>` : "",
    footerLinks.length ? `<ul class="links">${footerLinks.map((l) => `<li>${link(l.label, l.url)}</li>`).join("")}</ul>` : "",
  ].join("");

  const flag = applied.length
    ? `Applies ${applied.length} spec change${applied.length === 1 ? "" : "s"}: ${applied.join("; ")}`
    : "Rehearsal mockup — no spec changes apply to this page";

  const style = `
:root{--ink:${ink};--surface:${surface};--muted:${muted};--line:${line};--accent:${accent};--on-accent:${onAccent};--link:${linkColor};--sans:${sans};--mono:${mono}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--link)}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem}
.mock-flag{background:var(--ink);color:var(--surface);font-size:.8125rem}
.mock-flag .wrap{padding-top:.5rem;padding-bottom:.5rem;display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap}
.mock-flag strong{font-weight:600}
.mock-flag a{color:var(--surface);text-decoration:underline}
header.site{position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:3.5rem;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;color:var(--ink);text-decoration:none;font-weight:600}
nav ul{display:flex;flex-wrap:wrap;gap:.25rem 1rem;list-style:none;margin:0;padding:0;font-size:.9375rem}
nav a{color:var(--ink);text-decoration:none}
nav a:hover{text-decoration:underline}
.hero{padding:3.5rem 0 2.5rem;border-bottom:1px solid var(--line)}
h1{font-size:clamp(1.875rem,4vw,2.5rem);line-height:1.15;margin:0 0 1rem;font-weight:600;text-wrap:balance}
.lede{font-size:1.125rem;color:var(--muted);margin:0 0 1.75rem;max-width:36em}
.act{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1rem}
.cta{display:inline-flex;align-items:center;min-height:2.75rem;padding:.625rem 1.25rem;border-radius:.5rem;background:var(--accent);color:var(--on-accent);font-weight:600;text-decoration:none}
.cta:hover{filter:brightness(1.08)}
.cta:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.status{font-size:.9375rem;color:var(--muted)}
main section{padding:2rem 0;border-bottom:1px solid var(--line)}
h2{font-size:1.25rem;line-height:1.3;margin:0 0 .75rem;font-weight:600}
main p{margin:0 0 .75rem;max-width:38em}
main ul{margin:0;padding-left:1.25rem}
main li{margin:.25rem 0}
ul.links{list-style:none;padding:0}
footer.site{padding:2rem 0 3rem;color:var(--muted);font-size:.875rem}
footer.site ul.links{display:flex;flex-wrap:wrap;gap:.25rem 1rem;list-style:none;padding:0;margin:.5rem 0 0}
footer.site a{color:var(--muted)}
@media (max-width:640px){.hero{padding:2.5rem 0 2rem}nav ul{gap:.25rem .75rem}}
`.trim();

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(`${state.pageTitle || brand.name} · mockup`)}</title>`,
    `<style>${style}</style>`,
    "</head>",
    "<body>",
    `<div class="mock-flag"><div class="wrap"><strong>Rehearsal mockup</strong><span>${esc(flag)}</span></div></div>`,
    `<header class="site"><div class="wrap">${brandLink}${nav ? `<nav aria-label="Primary"><ul>${nav}</ul></nav>` : ""}</div></header>`,
    "<main>",
    `<section class="hero"><div class="wrap"><h1>${esc(hero.heading)}</h1>${hero.lede.trim() ? `<p class="lede">${esc(hero.lede.trim())}</p>` : ""}<div class="act">${ctaHtml}${hero.statusLine?.trim() ? `<span class="status">${esc(hero.statusLine.trim())}</span>` : ""}</div></div></section>`,
    sections ? `<div class="wrap">\n${sections}\n</div>` : "",
    "</main>",
    `<footer class="site"><div class="wrap">${footer}</div></footer>`,
    "</body>",
    "</html>",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Rewrite every href in generated HTML: mockup:<slug> and crawled site URLs become preview paths. */
export function rewriteLinks(
  html: string,
  opts: {
    previewBase: string;
    sourceUrl: string;
    urlToSlug: Map<string, string>;
    slugs: Set<string>;
    targetOrigin?: string;
  },
): string {
  const norm = (u: string | undefined): string | undefined => {
    if (!u) return undefined;
    try {
      const parsed = new URL(u, opts.sourceUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch {
      return undefined;
    }
  };
  const resolve = (raw: string): string => {
    const v = raw.trim();
    if (v.startsWith(`${opts.previewBase}/`) || v === opts.previewBase) return v;
    if (v.startsWith("mockup:")) {
      const slug = v.slice("mockup:".length).replace(/^\/+|\/+$/g, "");
      return opts.slugs.has(slug) ? `${opts.previewBase}/${slug}` : "#";
    }
    if (/^(#|mailto:|tel:)/i.test(v)) return v;
    const key = norm(v);
    if (key && opts.urlToSlug.has(key)) return `${opts.previewBase}/${opts.urlToSlug.get(key)}`;
    // Uncrawled page on the audited origin: neutralize rather than bounce the mockup to the real site.
    if (key && opts.targetOrigin && new URL(key).origin === opts.targetOrigin) return "#";
    // Foreign http(s) exits stay clickable; anything unparseable becomes an inert anchor.
    return key ? v : "#";
  };
  return html.replace(/(\shref\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi, (whole, prefix: string, raw: string) => {
    const q = raw.startsWith('"') || raw.startsWith("'") ? raw[0] : "";
    const inner = q ? raw.slice(1, -1) : raw;
    // HTML-escaped query strings (&amp;) must parse as the real URL, then re-escape on emit.
    return `${prefix}${q}${resolve(inner.replace(/&amp;/gi, "&")).replace(/&/g, "&amp;")}${q}`;
  });
}

// ── wireframe enforcement ──────────────────────────────────────────────────

const CSS_COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
/** CSS named colors that aren't already neutral → a mid gray. */
const NAMED_COLOR_RE =
  /\b(red|crimson|salmon|coral|orange|gold|yellow|khaki|olive|green|lime|teal|cyan|turquoise|aqua|blue|navy|indigo|violet|purple|plum|magenta|fuchsia|pink|brown|maroon|beige|lavender|tomato|orchid|sienna|chocolate|peru|tan|wheat)\b/gi;

function hex2(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
}

/** Map any concrete color to the gray of its WCAG luminance; alpha survives. */
function grayOf(token: string): string | undefined {
  const c = parseColor(token);
  if (!c) return undefined;
  const g = luminance(c) * 255;
  if (c.a >= 0.999) return `#${hex2(g)}${hex2(g)}${hex2(g)}`;
  if (c.a <= 0) return undefined;
  return `rgba(${Math.round(g)},${Math.round(g)},${Math.round(g)},${Math.round(c.a * 100) / 100})`;
}

// Drop quotes entirely: an unquoted family list is valid CSS, and quoting would
// terminate whichever kind of style attribute the page used.
const FALLBACK_SANS_SAFE = FALLBACK_SANS.replace(/["']/g, "");

/** Colors → luminance gray, fonts → generic sans, inside a declaration list. */
function restyleDecls(decls: string): string {
  return decls
    .replace(CSS_COLOR_RE, (t) => grayOf(t) ?? "#888888")
    .replace(NAMED_COLOR_RE, "#888888")
    .replace(/font-family\s*:[^;{}]+/gi, `font-family:${FALLBACK_SANS_SAFE}`);
}

/** Restyle only declaration bodies — selectors like `.blue-button` or `#abc` are not colors. */
function restyleCss(css: string): string {
  let prev = "";
  while (prev !== css) {
    prev = css;
    css = css.replace(/\{([^{}]*)\}/g, (_m, decls: string) => `{${restyleDecls(decls)}}`);
  }
  return css;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Guaranteed-neutral wireframe, enforced in code — a generated page can't leak
 * the source site's palette, fonts, or name no matter what the model wrote:
 * every CSS color becomes its luminance gray, font-family collapses to the
 * generic sans stack, and the site's name is replaced with "Preview".
 */
export function enforceMockupWireframe(html: string, brandName?: string): string {
  let out = html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => `${open}${restyleCss(css)}${close}`)
    .replace(/style\s*=\s*"([^"]*)"/gi, (_m, css: string) => `style="${restyleDecls(css)}"`)
    .replace(/style\s*=\s*'([^']*)'/gi, (_m, css: string) => `style='${restyleDecls(css)}'`)
    .replace(/(\s(?:color|bgcolor|bordercolor)\s*=\s*")([^"]*)(")/gi, (_m, pre: string, v: string, post: string) => `${pre}${grayOf(v) ?? "#888888"}${post}`);
  if (brandName) {
    const re = new RegExp(escapeRe(brandName), "g");
    out = out
      .split(/(<[^>]*>)/g)
      .map((seg) => {
        if (!seg.startsWith("<")) return seg.replace(re, "Preview");
        // Inside a tag, skip matches inside link-bearing attribute values so
        // preview URLs containing the brand string survive.
        return seg.replace(re, (m, offset: number) =>
          /(?:href|src|srcset|action|formaction)\s*=\s*("[^"]*|'[^']*|[^\s>]*)$/i.test(seg.slice(0, offset))
            ? m
            : "Preview",
        );
      })
      .join("");
  }
  return out;
}
