import type { BrandProfile, Experiment, RebuildGoal, RebuildPageContent } from "../contracts";
import { FALLBACK_SANS, contrastRatio, parseColor } from "./brand";
import { escapeHtml as esc } from "./sanitize";

const MAX_NAV = 6;
const MAX_SECTIONS = 6;
const MAX_BULLETS = 6;
const MAX_LINKS = 8;

function cssColor(value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\([\d.,%\s/]+\)$/i.test(v)) return v.toLowerCase();
  return fallback;
}

function cssFont(value: string | undefined, fallback: string): string {
  const v = (value ?? "").replace(/[^\w\s,"'.-]/g, "").replace(/\s+/g, " ").trim();
  return v.length > 0 && v.length <= 240 ? v : fallback;
}

/** Absolute http(s) URL or undefined — the only hrefs a rebuilt page emits. */
function httpHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function sameOrigin(url: string | undefined, origin: string): string | undefined {
  const href = httpHref(url);
  return href && new URL(href).origin === origin ? href : undefined;
}

function link(label: string, url: string | undefined, cls = ""): string {
  const href = httpHref(url);
  const c = cls ? ` class="${cls}"` : "";
  return href ? `<a${c} href="${esc(href)}">${esc(label)}</a>` : `<span${c}>${esc(label)}</span>`;
}

function onColor(bg: string, ink: string, surface: string): string {
  const b = parseColor(bg);
  const i = parseColor(ink);
  const s = parseColor(surface);
  if (!b || !i || !s) return surface;
  return contrastRatio(b, s) >= contrastRatio(b, i) ? surface : ink;
}

/** Render branded self-contained HTML: inline styles, no scripts, images on the audited origin only. */
export function renderGoalPage(input: {
  brand: BrandProfile;
  goal: RebuildGoal;
  experiment: Experiment;
  content: RebuildPageContent;
}): string {
  const { brand, goal, experiment, content } = input;
  let origin = "";
  try {
    origin = new URL(experiment.targetUrl).origin;
  } catch {
    /* no same-origin assets */
  }
  const ink = cssColor(brand.colors.ink, "#111111");
  const surface = cssColor(brand.colors.surface, "#ffffff");
  const muted = cssColor(brand.colors.muted, "#6b6b6b");
  const line = cssColor(brand.colors.line, "#ededed");
  const accent = cssColor(brand.colors.accent, ink);
  const linkColor = cssColor(brand.colors.link, ink);
  const onAccent = onColor(accent, ink, surface);
  const sans = cssFont(brand.fonts.sans, FALLBACK_SANS);
  const mono = cssFont(brand.fonts.mono, "ui-monospace, SFMono-Regular, Menlo, monospace");

  const favicon = sameOrigin(brand.faviconUrl, origin);
  const logo = sameOrigin(brand.logoUrl, origin);
  const home = httpHref(experiment.targetUrl);
  const mark = logo
    ? `<img src="${esc(logo)}" alt="${esc(brand.logoAlt || brand.name)}" height="28">`
    : `<span class="name">${esc(brand.name)}</span>`;
  const brandLink = home ? `<a class="brand" href="${esc(home)}">${mark}</a>` : `<span class="brand">${mark}</span>`;

  const nav = content.nav
    .filter((n) => n.label.trim() && httpHref(n.url))
    .slice(0, MAX_NAV)
    .map((n) => `<li>${link(n.label, n.url)}</li>`)
    .join("");

  const hero = content.hero;
  const cta = httpHref(hero.ctaUrl) ?? home;
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
      const links = (s.links ?? []).filter((l) => l.label.trim() && httpHref(l.url)).slice(0, MAX_LINKS);
      const linkList = links.length ? `<ul class="links">${links.map((l) => `<li>${link(l.label, l.url)}</li>`).join("")}</ul>` : "";
      return `<section><h2>${esc(s.heading.trim())}</h2>${body}${list}${linkList}</section>`;
    })
    .join("\n");

  const footerLinks = (content.footer?.links ?? []).filter((l) => l.label.trim() && httpHref(l.url)).slice(0, MAX_LINKS);
  const footer = [
    content.footer?.note?.trim() ? `<p>${esc(content.footer.note.trim())}</p>` : "",
    footerLinks.length ? `<ul class="links">${footerLinks.map((l) => `<li>${link(l.label, l.url)}</li>`).join("")}</ul>` : "",
  ].join("");

  const style = `
:root{--ink:${ink};--surface:${surface};--muted:${muted};--line:${line};--accent:${accent};--on-accent:${onAccent};--link:${linkColor};--sans:${sans};--mono:${mono}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--surface);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--link)}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem}
header.site{position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:3.5rem;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;color:var(--ink);text-decoration:none;font-weight:600}
.brand img{display:block;height:28px;width:auto}
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
    `<title>${esc(`${goal.title} · ${brand.name}`)}</title>`,
    favicon ? `<link rel="icon" href="${esc(favicon)}">` : "",
    `<style>${style}</style>`,
    "</head>",
    "<body>",
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
