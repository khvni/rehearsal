import { decodeHTML } from "entities";
import type { Experiment, Finding } from "./contracts";
import { displayFindings } from "./presentation";
import { normalizeRebuildPath } from "./rebuild/site";

/** Link-unfurl copy (Open Graph / Twitter card) and preview-card data for shared experiment and rebuild links. */

const SEVERITIES: Finding["severity"][] = ["critical", "high", "medium", "low"];
const STAGES = ["discover", "simulate", "verify", "analyze", "compare", "spec"] as const;
const RUNNING = new Set(["queued", "discovering", "simulating", "verifying", "analyzing", "comparing", "rebuilding"]);

export const PREVIEW_SITE_NAME = "Rehearsal";
export const PREVIEW_TAGLINE = "Simulated visitors test your site and suggest fixes.";

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function textOf(html: string): string {
  return decodeHTML(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function firstMatch(html: string, re: RegExp): string | undefined {
  const m = re.exec(html);
  const text = m ? textOf(m[1]) : "";
  return text || undefined;
}

/** Strips the "- Brand" / "| Brand" suffix most page titles carry. */
function pageTitle(title: string, brand: string): string {
  const t = title.replace(new RegExp(`\\s*[-|·—]\\s*${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "").trim();
  return t || title;
}

function stageDone(exp: Experiment, stage: (typeof STAGES)[number]): boolean {
  switch (stage) {
    case "discover":
      return Boolean(exp.graph);
    case "simulate":
      return exp.simulations.length > 0;
    case "verify":
      return exp.browserTests.length > 0;
    case "analyze":
      return exp.status === "complete" || exp.findings.length > 0;
    case "compare":
      return exp.comparisons.length > 0;
    case "spec":
      return Boolean(exp.spec);
  }
}

export function experimentPreview(exp: Experiment) {
  const findings = displayFindings(exp).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const counts = SEVERITIES.map((severity) => ({ severity, count: findings.filter((f) => f.severity === severity).length })).filter(
    (c) => c.count > 0,
  );
  const host = hostOf(exp.targetUrl);
  const live = RUNNING.has(exp.status);
  const headline = findings.length
    ? `${findings.length} usability finding${findings.length === 1 ? "" : "s"}`
    : live
      ? "Rehearsal in progress"
      : exp.status === "failed"
        ? "This rehearsal couldn’t finish"
        : exp.status === "complete"
          ? "No usability findings"
          : "Ready to rehearse";
  const top = findings[0];
  const countLine = counts.map((c) => `${c.count} ${c.severity}`).join(", ");
  const description = top
    ? clip(`${countLine}. Start here: ${top.title}.`, 200)
    : clip(`Goal: ${exp.goal}`, 200);
  return {
    host,
    headline,
    counts,
    topFinding: top ? clip(top.title, 120) : undefined,
    goal: clip(exp.goal, 160),
    status: exp.status,
    journeys: exp.simulations.length,
    date: shortDate(exp.createdAt),
    stages: STAGES.map((stage) => ({ stage, done: stageDone(exp, stage) })),
    hasRebuild: Boolean(exp.rebuild?.site),
    title: `${host}: ${headline}`,
    description,
    alt: top ? `${host}: ${headline}. Start here: ${top.title}` : `${host}: ${headline}`,
  };
}

export function rebuildPreview(exp: Experiment, rawPath = "/") {
  const site = exp.rebuild?.site;
  if (!site) return null;
  const path = normalizeRebuildPath(rawPath.split("/")) ?? "/";
  const built = site.pages.filter((p) => p.status === "built");
  const page = built.find((p) => normalizeRebuildPath(p.path.split("/")) === path) ?? built[0];
  const brand = exp.rebuild!.brand.name || hostOf(exp.targetUrl);
  const html = page?.html ?? "";
  const heading = firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ?? (page ? pageTitle(page.title, brand) : brand);
  const lede =
    firstMatch(html, /<p\b[^>]*class="[^"]*\brb-lede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ??
    firstMatch(html, /<h1\b[^>]*>[\s\S]*?<\/h1>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const primary = firstMatch(html, /<a\b[^>]*\brb-btn--primary\b[^>]*>([\s\S]*?)<\/a>/i);
  const secondary = firstMatch(html, /<a\b[^>]*\brb-btn--secondary\b[^>]*>([\s\S]*?)<\/a>/i);
  const label = page && normalizeRebuildPath(page.path.split("/")) !== "/" ? pageTitle(page.title, brand) : undefined;
  const host = hostOf(exp.targetUrl);
  const title = label ? `${clip(label, 70)} · ${brand}, rebuilt` : `${brand}, rebuilt by Rehearsal`;
  return {
    brand: clip(brand, 40),
    host,
    path: page?.path ?? path,
    heading: clip(heading, 90),
    lede: lede ? clip(lede, 140) : undefined,
    primary: primary ? clip(primary, 28) : undefined,
    secondary: secondary ? clip(secondary, 28) : undefined,
    nav: site.nav.map((n) => clip(n.label, 18)).slice(0, 5),
    tokens: site.tokens,
    pagesBuilt: built.length,
    pagesTotal: site.pages.length,
    title,
    description: clip(
      `${built.length} page${built.length === 1 ? "" : "s"} of ${host} rebuilt from Rehearsal's findings${lede ? `: ${lede}` : "."}`,
      200,
    ),
    alt: `${brand} rebuilt by Rehearsal: ${heading}`,
  };
}

/** Absolute origin for unfurl URLs: crawlers (iMessage, Slack) ignore relative og:image paths. */
export function previewOrigin(headers: { get(name: string): string | null }): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "rehearsal.alikhani.co";
  const proto = headers.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host}`;
}

export function previewImageUrl(origin: string, id: string, view: "findings" | "rebuild", path?: string): string {
  const url = new URL(`/experiments/${encodeURIComponent(id)}/og`, origin);
  if (view === "rebuild") url.searchParams.set("view", "rebuild");
  if (path && path !== "/") url.searchParams.set("path", path);
  return url.href;
}
