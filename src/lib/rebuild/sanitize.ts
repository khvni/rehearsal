/**
 * Output belt for generated pages: whatever the renderer or an LLM produced,
 * no script can run and no resource loads from outside the audited origin.
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape a string for HTML text and quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const DANGEROUS_PAIRED = /<(script|iframe|object|embed|applet|frame|frameset|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SINGLE = /<\/?(script|iframe|object|embed|applet|frame|frameset|base|noscript|template)\b[^>]*>/gi;
const META_REFRESH = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTR = /(\s(?:href|src|action|formaction|xlink:href|poster|background)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi;

function decodeAttr(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16) % 0x110000))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d) % 0x110000))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "")
    .replace(/&amp;/gi, "&");
}

function attrValue(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i"));
  return m ? decodeAttr(m[1]) : undefined;
}

function scriptScheme(value: string): boolean {
  const compact = value.replace(/[\u0000-\u0020\u007f]+/g, "").toLowerCase();
  return /^(javascript|vbscript|data|livescript):/.test(compact);
}

function allowedOrigin(url: string | undefined, origins: Set<string>): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && origins.has(u.origin);
  } catch {
    return false;
  }
}

function cleanTag(tag: string, origins: Set<string>): string {
  const name = tag.match(/^<\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() ?? "";
  if (name === "img" && !allowedOrigin(attrValue(tag, "src"), origins)) return "";
  if (name === "link" && !allowedOrigin(attrValue(tag, "href"), origins)) return "";
  let out = tag.replace(EVENT_ATTR, "");
  out = out.replace(URL_ATTR, (whole, prefix: string, raw: string) => (scriptScheme(decodeAttr(raw)) ? `${prefix}"#"` : whole));
  out = out.replace(/\s(srcset|imagesrcset)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (whole, raw: string) =>
    /url\s*\(|expression\s*\(|@import/i.test(decodeAttr(raw)) ? "" : whole,
  );
  return out;
}

function cleanStyleBlock(css: string, origins: Set<string>): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "(")
    .replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi, (whole, _q: string, u: string) => (allowedOrigin(u, origins) ? whole : "none"));
}

/** Strip scripts, frames, event handlers, script-scheme URLs and off-origin images/links. */
export function sanitizeRebuildHtml(html: string, opts: { imageOrigins: string[] }): string {
  const origins = new Set<string>();
  for (const o of opts.imageOrigins) {
    try {
      origins.add(new URL(o).origin);
    } catch {
      /* ignore malformed origin */
    }
  }
  let out = String(html ?? "");
  for (let pass = 0; pass < 4; pass++) {
    const before = out;
    out = out
      .replace(DANGEROUS_PAIRED, "")
      .replace(DANGEROUS_SINGLE, "")
      .replace(META_REFRESH, "")
      .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_, open: string, css: string, close: string) => open + cleanStyleBlock(css, origins) + close)
      .replace(/<[a-z][a-z0-9-]*\b[^>]*>/gi, (tag) => cleanTag(tag, origins));
    if (out === before) break;
  }
  return out;
}
