import type { ActionNode } from "../contracts";
import { createHash } from "node:crypto";

interface ExtractedPage {
  title: string;
  visibleText: string;
  headings: string[];
  actions: Omit<ActionNode, "actionId" | "stateId">[];
}

const BLOCK_TAG_RE =
  /<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi;

const VAGUE_LABELS = new Set(["click here", "learn more", "read more", "here", "more", "link"]);

export function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 120);
}

function stripTags(html: string): string {
  return html
    .replace(BLOCK_TAG_RE, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|[^\\s>]+)`, "i");
  const m = tag.match(re);
  return m?.[2] ?? m?.[3] ?? m?.[4];
}

/** Extract links, buttons, inputs, headings, and readable text from HTML. */
const MAX_HTML_CHARS = 2_000_000;
const NON_HTML_EXT_RE = /\.(pdf|zip|gz|tgz|dmg|exe|msi|pkg|deb|rpm|apk|iso|csv|xlsx?|docx?|pptx?|mp4|mov|webm|mp3|wav|png|jpe?g|gif|webp|svg|ics)$/i;

export function extractPage(rawHtml: string, pageUrl: string): ExtractedPage {
  const html = rawHtml.length > MAX_HTML_CHARS ? rawHtml.slice(0, MAX_HTML_CHARS) : rawHtml;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeLabel(stripTags(titleMatch[1])) : pageUrl;

  const headings: string[] = [];
  for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = normalizeLabel(stripTags(m[2]));
    if (text) headings.push(text);
    if (headings.length >= 20) break;
  }

  const actions: ExtractedPage["actions"] = [];
  const seen = new Set<string>();
  const push = (a: Omit<ActionNode, "actionId" | "stateId">) => {
    const key = `${a.type}|${a.label.toLowerCase()}|${a.href ?? ""}`;
    if (a.label && !seen.has(key)) {
      seen.add(key);
      actions.push(a);
    }
  };

  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const tag = m[0];
    const href = attr(tag, "href");
    const label = normalizeLabel(stripTags(m[1])) || normalizeLabel(attr(tag, "aria-label") ?? "");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    const absolute = safeResolve(pageUrl, href);
    if (!absolute) continue;
    if (absolute === stripHash(pageUrl)) continue; // in-page anchor (/#section on the same page)
    const external = !absolute.startsWith(new URL(pageUrl).origin);
    const download = NON_HTML_EXT_RE.test(new URL(absolute).pathname);
    push({
      type: external || download ? "navigate" : "click",
      label,
      role: "link",
      href: absolute,
      enabled: true,
      safeToExecute: !external && !download,
    });
  }

  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
    const tag = m[0];
    const label =
      normalizeLabel(stripTags(m[1])) ||
      normalizeLabel(attr(tag, "aria-label") ?? attr(tag, "value") ?? "button");
    const disabled = /\bdisabled\b/i.test(tag);
    push({ type: "click", label, role: "button", enabled: !disabled, safeToExecute: true });
  }

  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const type = (attr(tag, "type") ?? "text").toLowerCase();
    if (type === "hidden") continue;
    const label = normalizeLabel(
      attr(tag, "placeholder") ?? attr(tag, "aria-label") ?? attr(tag, "name") ?? "input",
    );
    push({
      type: type === "submit" ? "click" : "fill",
      label,
      role: type === "submit" ? "button" : "textbox",
      enabled: !/\bdisabled\b/i.test(tag),
      safeToExecute: false, // never fill/submit forms on third-party sites
    });
  }

  const visibleText = stripTags(html).slice(0, 12000);
  return { title, visibleText, headings, actions };
}

function safeResolve(base: string, href: string): string | undefined {
  try {
    const u = new URL(href, base);
    if (u.protocol === "http:" || u.protocol === "https:") u.hash = "";
    return u.toString();
  } catch {
    return undefined;
  }
}

function stripHash(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** Deterministic state hash: normalized URL + viewport + action signature + modal flag. */
export function stateHashFor(
  url: string,
  viewportName: string,
  actions: { label: string; role?: string }[],
  modalOpen: boolean,
): string {
  const normalized = normalizeUrl(url);
  const signature = actions
    .map((a) => `${a.role ?? "link"}:${a.label.toLowerCase()}`)
    .sort()
    .join("|");
  return createHash("sha1")
    .update(`${normalized}|${viewportName}|${signature}|modal:${modalOpen}`)
    .digest("hex")
    .slice(0, 16);
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = ""; // query excluded: state identity is path+content
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function isVagueLabel(label: string): boolean {
  return VAGUE_LABELS.has(label.toLowerCase().trim());
}
