import { parseHTML } from "linkedom";
import { type Experiment, type PageFetcher, type RebuildGap, VIEWPORTS } from "../contracts";
import { contentSignatureFor, extractPage } from "../browser/extract";
import { makeState } from "../graph";
import { isNonPageUrl } from "../site-links";
import { normalizeRebuildPath, SITE_BYTE_CAP } from "./site";

export const GAP_STEP_PAGES = 2;
export const GAP_STEP_MS = 10_000;

export function collectRebuildGaps(exp: Experiment): RebuildGap {
  const site = exp.rebuild!.site!;
  const origin = new URL(exp.targetUrl);
  const base = `/experiments/${encodeURIComponent(exp.id)}/rb`;
  const known = new Set(site.pages.flatMap(p => [p.path, normalizeRebuildPath(new URL(p.sourceUrl).pathname.split("/"))]));
  const candidates = new Map<string, RebuildGap["candidates"][number]>();
  const add = (href: string, source: string) => {
    try {
      const url = new URL(href, source);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        url.hostname.replace(/^www\./, "") !== origin.hostname.replace(/^www\./, "") || url.port !== origin.port) return;
      if (url.pathname === base || url.pathname.startsWith(base + "/"))
        url.pathname = url.pathname.slice(base.length) || "/";
      const path = normalizeRebuildPath(url.pathname.split("/"));
      if (!path || known.has(path) || isNonPageUrl(url)) return;
      url.hash = "";
      if (!candidates.has(path)) candidates.set(path, { path, sourceUrl: url.href });
    } catch { /* Malformed links are not fetch candidates. */ }
  };
  for (const page of site.pages) {
    if (page.status !== "built" || !page.html) continue;
    const doc = parseHTML(`<html><body>${page.html}</body></html>`).document;
    for (const anchor of doc.querySelectorAll("a[href]")) add(anchor.getAttribute("href")!, page.sourceUrl);
  }
  for (const state of exp.graph?.states ?? []) {
    add(state.url, state.url);
    for (const action of state.actions) if (action.href) add(action.href, state.url);
  }
  const configured = Number(process.env.REHEARSAL_REBUILD_GAP_MAX_PAGES ?? 12);
  let limit = Number.isFinite(configured) && configured >= 0 ? Math.min(100, Math.floor(configured)) : 12;
  if (site.pages.reduce((n, p) => n + (p.bytes ?? 0), 0) >= SITE_BYTE_CAP || site.pages.some(p => p.issues?.includes("size cap"))) limit = 0;
  return { candidates: [...candidates.values()].slice(0, limit), cursor: 0, limit, skipped: Math.max(0, candidates.size - limit), failed: [], completed: !candidates.size || limit === 0 };
}

export async function fetchRebuildGaps(exp: Experiment, fetcher: PageFetcher, checkpoint: () => Promise<void>): Promise<void> {
  const site = exp.rebuild!.site!;
  const gap = site.gap!;
  const deadline = Date.now() + GAP_STEP_MS;
  for (let count = 0; count < GAP_STEP_PAGES && gap.cursor < gap.candidates.length && Date.now() < deadline; count++) {
    const page = gap.candidates[gap.cursor];
    try {
      const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
      const work = Promise.resolve().then(() => fetcher.fetchHtml(page.sourceUrl, { signal, requireHtmlContentType: true }));
      const timeout = new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      const html = await Promise.race([work, timeout]);
      if (!/<(?:!doctype\s+html|html|head|body|main|article|section|div|h[1-6]|p|a)\b/i.test(html)) throw new Error("Non-HTML response");
      const extracted = extractPage(html, page.sourceUrl);
      const graph = exp.graph ??= { states: [], edges: [] };
      const existing = graph.states.find(s => s.url === page.sourceUrl);
      const state = existing ?? makeState({ url: page.sourceUrl, viewport: VIEWPORTS.desktop, title: extracted.title ?? page.path, visibleText: extracted.visibleText, headings: extracted.headings, actions: extracted.actions });
      if (!existing) {
        graph.states.push(state);
        const signatures = new Map((exp.siteSignatures ?? []).map(s => [s.url, s]));
        signatures.set(page.sourceUrl, { url: page.sourceUrl, signature: contentSignatureFor(page.sourceUrl, extracted) });
        exp.siteSignatures = [...signatures.values()];
      }
      site.pages.push({ ...page, title: state.pageTitle || page.path, mode: "read", blocks: [{ type: "article-body", purpose: `Present ${state.pageTitle || page.path} using the crawled facts` }], status: "planned" });
    } catch (error) {
      gap.failed.push({ path: page.path, reason: String(error).slice(0, 320) });
    }
    gap.cursor++;
    gap.completed = gap.cursor === gap.candidates.length;
    await checkpoint();
  }
}
