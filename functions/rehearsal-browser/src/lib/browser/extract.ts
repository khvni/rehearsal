import type { ActionNode } from "../contracts";
import { createHash } from "node:crypto";
import { Tokenizer } from "htmlparser2";
import { decodeCloudflareEmail, emailHref, emailLinkLabel, isCloudflareEmailUrl, isNonPageUrl, normalizeEmailLink } from "../site-links";

interface ExtractedPage {
  title: string;
  visibleText: string;
  headings: string[];
  actions: Omit<ActionNode, "actionId" | "stateId">[];
}

const SKIPPED_TEXT_TAGS = new Set(["script", "style", "noscript", "svg", "template", "head"]);
const LINE_BREAK_CLOSE_TAGS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "tr"]);
const HEADING_TAGS = new Set(["h1", "h2", "h3"]);
const FOREIGN_TAGS = new Set(["svg", "math"]);
const VOID_TAGS = new Set([
  "area", "base", "basefont", "br", "col", "command", "embed", "frame", "hr", "img",
  "input", "isindex", "keygen", "link", "meta", "param", "source", "track", "wbr",
]);
/** Tags whose start closes an open sibling of the same name (`<li>a<li>b`). */
const NON_NESTING_TAGS = new Set(["li", "p", "option", "tr", "td", "th", "dt", "dd"]);

const VAGUE_LABELS = new Set(["click here", "learn more", "read more", "here", "more", "link"]);

export function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 120);
}

function tidyText(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract links, buttons, inputs, headings, and readable text from HTML. */
export const MAX_HTML_CHARS = 2_000_000;
const MAX_HEADINGS = 20;
const MAX_VISIBLE_TEXT = 12_000;
/** Open-element stack bound: keeps close-tag matching O(1) per tag on hostile nesting. */
const MAX_OPEN_ELEMENTS = 256;
/** Collected label text per element; labels are cut to 120 chars anyway. */
const MAX_LABEL_CHARS = 240;

interface OpenElement {
  name: string;
  attribs: Record<string, string>;
  email?: string;
  emailLink?: string;
  visibleStart?: number;
  emailLabelStarts?: Map<NonNullable<OpenElement["label"]>, number>;
  /** `skipDepth` at open: text nested in a deeper script/style/svg block is not part of the label. */
  label: { text: string; full: boolean; skipDepth: number; ariaHiddenDepth: number } | undefined;
}

/**
 * Single linear pass over the HTML with htmlparser2's Tokenizer. Regexes that
 * scan from each open tag to its closing tag are quadratic on unclosed markup,
 * and htmlparser2's Parser keeps an unbounded stack, so this keeps its own.
 */
export function extractPage(rawHtml: string, pageUrl: string): ExtractedPage {
  const html = rawHtml.length > MAX_HTML_CHARS ? rawHtml.slice(0, MAX_HTML_CHARS) : rawHtml;
  const origin = new URL(pageUrl).origin;
  const pageWithoutHash = stripHash(pageUrl);

  let title: string | undefined;
  const headings: string[] = [];
  const actions: ExtractedPage["actions"] = [];
  const idLabels = new Map<string, NonNullable<OpenElement["label"]>>();
  const pendingActions: (() => void)[] = [];
  const seen = new Set<string>();
  const push = (a: Omit<ActionNode, "actionId" | "stateId">, resolveLabel?: () => string) => pendingActions.push(() => {
    if (resolveLabel) a.label = resolveLabel();
    const key = `${a.type}|${a.label.toLowerCase()}|${a.href ?? ""}`;
    if (a.label && !seen.has(key)) {
      seen.add(key);
      actions.push(a);
    }
  });

  const onAnchor = (attribs: Record<string, string>, text: string) => {
    const href = normalizeEmailLink(attribs.href ?? "", pageUrl, attribs["data-cfemail"]);
    const label = emailLinkLabel(text || normalizeLabel(attribs["aria-label"] ?? ""), href ?? "");
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    const absolute = safeResolve(pageUrl, href);
    if (!absolute) return;
    if (absolute === pageWithoutHash) return; // in-page anchor (/#section on the same page)
    const external = !isSameOrigin(absolute, origin);
    const download = isNonPageUrl(new URL(absolute));
    push({
      type: external || download ? "navigate" : "click",
      label,
      role: "link",
      href: absolute,
      enabled: true,
      safeToExecute: !external && !download,
    });
  };

  const onButton = (attribs: Record<string, string>, text: string) => {
    const resolveLabel = () =>
      normalizeLabel((attribs["aria-labelledby"] ?? "").split(/\s+/).map((id) => idLabels.get(id)?.text ?? "").join(" ")) ||
      normalizeLabel(attribs["aria-label"] ?? "") || text || normalizeLabel(attribs.value ?? "button");
    // Missing/invalid types default to submit; form owners may be outside the ancestor chain.
    const type = (attribs.type ?? "").toLowerCase();
    const submits = type === "submit" ||
      (type !== "button" && type !== "reset" && ("form" in attribs || stack.some((e) => e.name === "form")));
    push({ type: "click", label: "", role: "button", enabled: !("disabled" in attribs), safeToExecute: !submits }, resolveLabel);
  };

  const onInput = (attribs: Record<string, string>) => {
    const type = (attribs.type ?? "text").toLowerCase();
    if (type === "hidden") return;
    const label = normalizeLabel(attribs.placeholder ?? attribs["aria-label"] ?? attribs.name ?? "input");
    push({
      type: type === "submit" ? "click" : "fill",
      label,
      role: type === "submit" ? "button" : "textbox",
      enabled: !("disabled" in attribs),
      safeToExecute: false, // never fill/submit forms on third-party sites
    });
  };

  const visible: string[] = [];
  const stack: OpenElement[] = [];
  const labels: NonNullable<OpenElement["label"]>[] = [];
  let skipDepth = 0;
  let ariaHiddenDepth = 0;
  let foreignDepth = 0;
  let emailDepth = 0;

  const addText = (text: string) => {
    if (emailDepth > 0) return;
    if (labels.length > 0) {
      const collapsed = text.replace(/\s+/g, " ");
      for (let i = labels.length - 1; i >= 0; i--) {
        const label = labels[i];
        if (skipDepth > label.skipDepth || ariaHiddenDepth > label.ariaHiddenDepth) continue;
        label.text += collapsed.slice(0, MAX_LABEL_CHARS - label.text.length);
        if (label.text.length >= MAX_LABEL_CHARS) {
          label.full = true;
          labels.splice(i, 1);
        }
      }
    }
    if (skipDepth === 0) visible.push(text);
  };

  const closeElement = (el: OpenElement) => {
    if (el.email) emailDepth--;
    if (el.emailLink && el.visibleStart !== undefined) {
      const decoded = emailLinkLabel(visible.slice(el.visibleStart).join(""), el.emailLink);
      visible.splice(el.visibleStart, visible.length - el.visibleStart, decoded);
      for (const [label, start] of el.emailLabelStarts ?? [])
        label.text = label.text.slice(0, start) + emailLinkLabel(label.text.slice(start), el.emailLink);
    }
    if (el.attribs["aria-hidden"] === "true") ariaHiddenDepth--;
    if (SKIPPED_TEXT_TAGS.has(el.name)) skipDepth--;
    if (FOREIGN_TAGS.has(el.name)) foreignDepth--;
    if (!el.label) return;
    if (!el.label.full) labels.splice(labels.lastIndexOf(el.label), 1);
    const text = normalizeLabel(el.label.text);
    if (el.name === "title") {
      if (foreignDepth === 0) title ??= text;
    }
    else if (HEADING_TAGS.has(el.name)) {
      if (text && headings.length < MAX_HEADINGS) headings.push(text);
    } else if (el.name === "a") onAnchor(el.attribs, text);
    else if (el.name === "button") onButton(el.attribs, text);
  };

  const openElement = (name: string, attribs: Record<string, string>, selfClosing: boolean) => {
    addText(name === "br" ? "\n" : " ");
    if (name === "input") onInput(attribs);
    if (VOID_TAGS.has(name)) return;
    if (NON_NESTING_TAGS.has(name) && stack.at(-1)?.name === name) closeElement(stack.pop()!);
    // HTML ignores `/>` except in foreign (SVG/MathML) content.
    if (selfClosing && (foreignDepth > 0 || FOREIGN_TAGS.has(name))) return;
    if (stack.length >= MAX_OPEN_ELEMENTS) return;
    const collects =
      (name === "title" && title === undefined && foreignDepth === 0) ||
      (HEADING_TAGS.has(name) && headings.length < MAX_HEADINGS) ||
      name === "a" ||
      name === "button" ||
      !!attribs.id;
    if (attribs["aria-hidden"] === "true") ariaHiddenDepth++;
    const el: OpenElement = { name, attribs, label: collects ? { text: "", full: false, skipDepth, ariaHiddenDepth } : undefined };
    stack.push(el);
    if (name === "a" && attribs.href) {
      try {
        if (isCloudflareEmailUrl(new URL(attribs.href, pageUrl))) {
          el.emailLink = normalizeEmailLink(attribs.href, pageUrl, attribs["data-cfemail"]);
          el.visibleStart = visible.length;
          el.emailLabelStarts = new Map(labels.map(label => [label, label.text.length]));
        }
      } catch { /* Invalid anchors are ignored by onAnchor. */ }
    }
    if (attribs.id && el.label && !idLabels.has(attribs.id)) idLabels.set(attribs.id, el.label);
    if (el.label) labels.push(el.label);
    if (SKIPPED_TEXT_TAGS.has(name)) skipDepth++;
    if (FOREIGN_TAGS.has(name)) foreignDepth++;
    const email = decodeCloudflareEmail(attribs["data-cfemail"]);
    if (email) {
      addText(email);
      emailDepth++;
      el.email = email;
      for (let i = stack.length - 1; i >= 0; i--) {
        const anchor = stack[i];
        if (anchor.name !== "a" || !anchor.attribs.href) continue;
        try {
          if (isCloudflareEmailUrl(new URL(anchor.attribs.href, pageUrl))) anchor.attribs.href = emailHref(email);
        } catch { /* Invalid anchors are ignored by onAnchor. */ }
        break;
      }
    }
  };

  const closeTag = (name: string) => {
    addText(LINE_BREAK_CLOSE_TAGS.has(name) ? "\n" : " ");
    let idx = stack.length - 1;
    while (idx >= 0 && stack[idx].name !== name) idx--;
    if (idx < 0) return; // stray close tag
    while (stack.length > idx) closeElement(stack.pop()!);
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
        attribValue += html.slice(start, end);
      },
      onattribentity: (cp) => {
        attribValue += String.fromCodePoint(cp);
      },
      onattribend: () => {
        if (!Object.prototype.hasOwnProperty.call(attribs, attribName)) attribs[attribName] = attribValue;
        attribValue = "";
      },
      onopentagend: () => openElement(tagName, attribs, false),
      onselfclosingtag: () => openElement(tagName, attribs, true),
      onclosetag: (start, end) => closeTag(html.slice(start, end).toLowerCase()),
      oncomment: () => {},
      oncdata: () => {},
      ondeclaration: () => {},
      onprocessinginstruction: () => {},
      onend: () => {
        while (stack.length > 0) closeElement(stack.pop()!);
      },
    },
  );
  tokenizer.write(html);
  tokenizer.end();
  for (const pushAction of pendingActions) pushAction();

  const visibleText = tidyText(visible.join("")).slice(0, MAX_VISIBLE_TEXT);
  return { title: title || pageUrl, visibleText, headings, actions };
}

const MEMO_MAX_PAGES = 32;

/**
 * `extractPage` memoized by (url, html) for one run: persona journeys
 * re-snapshot and re-probe the same pages every step. Results are shared, so
 * callers must not mutate them. Past `maxPages` the oldest-cached URL is dropped;
 * pages over MAX_HTML_CHARS are not cached, so keys stay bounded.
 */
export function memoizedExtractPage(maxPages = MEMO_MAX_PAGES): typeof extractPage {
  const byUrl = new Map<string, Map<string, ExtractedPage>>();
  let size = 0;
  return (rawHtml, pageUrl) => {
    if (rawHtml.length > MAX_HTML_CHARS) return extractPage(rawHtml, pageUrl);
    let byHtml = byUrl.get(pageUrl);
    const hit = byHtml?.get(rawHtml);
    if (hit) return hit;
    const page = extractPage(rawHtml, pageUrl);
    if (!byHtml) byUrl.set(pageUrl, (byHtml = new Map()));
    byHtml.set(rawHtml, page);
    if (++size > maxPages) {
      const [oldestUrl, oldest] = byUrl.entries().next().value!;
      size -= oldest.size;
      byUrl.delete(oldestUrl);
    }
    return page;
  };
}

/** True when `href` parses to exactly `origin` (a prefix test would accept https://a.com.evil.com). */
export function isSameOrigin(href: string | undefined, origin: string): boolean {
  if (!href) return false;
  try {
    return new URL(href).origin === origin;
  } catch {
    return false;
  }
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

/** Params that never change the page served — dropped for site-level dedupe. */
const TRACKING_PARAMS = /^utm_|^(fbclid|gclid|gclsrc|dclid|mc_cid|mc_eid|igshid|msclkid|_ga|ref_src)$/i;

/**
 * Site-level dedupe key: hash dropped, host lowercased (URL does that), tracking
 * params dropped, trailing slashes folded. Real query params stay — `?page=2`
 * is a different page.
 */
export function normalizeSiteUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${path === "/" && !u.search ? "" : path}${u.search}`;
  } catch {
    return raw.trim();
  }
}

/**
 * Per-page content signature for rescan's "did the site actually change" check:
 * normalized URL + title + visible text + sorted action label/destination pairs
 * — inputs a plain fetch can reproduce (no screenshot, metrics, or viewport).
 * NFKC + whitespace folding smooths serialization-only diffs; `href` is in the
 * signature so a link whose destination changed still counts as a change. Both
 * sides must come from the same decode path — discover stores signatures from a
 * plain-fetch probe and rescan re-fetches with the same fetcher.
 */
export function contentSignatureFor(
  url: string,
  page: { title: string; visibleText: string; actions: { label: string; role?: string; href?: string }[] },
): string {
  const fold = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
  const actionSig = page.actions
    .map((a) => `${a.role ?? "link"}:${a.label.toLowerCase()}:${a.href ?? ""}`)
    .sort()
    .join("|");
  return createHash("sha1")
    .update(`${normalizeSiteUrl(url)}|${fold(page.title)}|${fold(page.visibleText)}|${actionSig}`)
    .digest("hex")
    .slice(0, 16);
}

export function isVagueLabel(label: string): boolean {
  return VAGUE_LABELS.has(label.toLowerCase().trim());
}
