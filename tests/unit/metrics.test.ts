import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { VIEWPORTS, SiteState, type PageMetrics, type Viewport } from "@/lib/contracts";
import { PlaywrightRunner } from "@/lib/browser/playwright";
import { metricsFromHtml } from "@/lib/browser/metrics";
import { metricFindings } from "@/lib/analysis/metric-findings";
import { makeState } from "@/lib/graph";

process.env.REHEARSAL_ALLOW_PRIVATE = "1";

const btn = "display:inline-block;width:200px;height:48px;font-size:18px;margin:4px";
const SYNTHETIC = `<!doctype html><html><head><title>Synthetic</title>
<style>body{margin:0;font-family:sans-serif;font-size:16px} h1{font-size:32px;margin:0} .hero{font-size:56px}</style></head>
<body>
<header style="height:80px"><a href="/" class="logo">Acme</a>
<nav>${Array.from({ length: 9 }, (_, i) => `<a href="/s${i}">Section ${i}</a>`).join(" ")}</nav></header>
<main>
<h1>Welcome to Acme</h1>
<p class="hero">Huge tagline</p>
<button style="${btn}">Buy</button><button style="${btn}">Try</button><a href="/demo" class="btn" style="${btn}">Demo</a>
<a href="/tiny" class="btn" style="font-size:10px">tiny</a>
<h2>Features</h2><h4>Detail</h4><h1>Second h1</h1>
<div style="height:4200px">Long content</div>
<button style="${btn}">Below fold</button>
</main></body></html>`;

const BARE = `<!doctype html><html><head><title>Bare</title></head><body><div>Just some text with no structure.</div></body></html>`;

let server: Server;
let base: string;
const runner = new PlaywrightRunner(mkdtempSync(path.join(os.tmpdir(), "rehearsal-metrics-")));

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = req.url === "/bare" ? BARE : req.url === "/" ? SYNTHETIC : null;
    res.writeHead(body ? 200 : 404, { "content-type": "text/html" });
    res.end(body ?? "not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await runner.close();
  await new Promise((r) => server.close(r));
});

async function measure(url: string, viewport: Viewport = VIEWPORTS.desktop): Promise<{ metrics: PageMetrics; state: SiteState }> {
  const res = await runner.openPage(url, viewport, { shotName: `metrics_${viewport.name}_${url.length}` });
  expect(res.metrics).toBeDefined();
  const state = makeState({ url, viewport, title: "t", visibleText: "", actions: [], screenshotPath: res.screenshotPath });
  state.metrics = res.metrics;
  return { metrics: res.metrics!, state };
}

describe("measurePage hook (local Playwright)", () => {
  it("measures scroll, CTAs, headings, nav, type scale and trunk test on a synthetic page", async () => {
    const { metrics: m, state } = await measure(`${base}/`);
    expect(m.source).toBe("browser");
    expect(m.viewportHeightPx).toBe(900);
    expect(m.pageHeightPx).toBeGreaterThan(4500);
    expect(m.foldRatio).toBeCloseTo(m.pageHeightPx! / 900, 1);
    expect(m.estimatedScrollTimeSec).toBeCloseTo(m.foldRatio! * 1.5, 0);
    expect(m.totalCtaCount).toBe(5);
    expect(m.aboveFoldCtaCount).toBe(4);
    expect(m.primaryCtaAmbiguity).toBe(3);
    expect(m.primaryCtaLabels.sort()).toEqual(["Buy", "Demo", "Try"]);
    expect(m.headingOutline).toEqual({ h1Count: 2, h1Text: ["Welcome to Acme", "Second h1"], skippedLevels: ["h2→h4"] });
    expect(m.navItemCount).toBe(9);
    expect(m.fontSizeBuckets?.[0]).toEqual({ px: 56, chars: "Huge tagline".length });
    expect(m.largestTextIsH1).toBe(false);
    expect(m.textDensity).toBeGreaterThan(0);
    expect(m.trunkTest).toEqual({ hasSiteName: true, hasPageName: true, hasPrimaryNav: true, hasSearch: false, hasYouAreHere: false });
    expect(SiteState.parse(state).metrics).toEqual(m);
  });

  it("returns sensible values on a page with no structure", async () => {
    const { metrics: m } = await measure(`${base}/bare`, VIEWPORTS.mobile);
    expect(m.foldRatio).toBe(1);
    expect(m.totalCtaCount).toBe(0);
    expect(m.primaryCtaAmbiguity).toBe(0);
    expect(m.headingOutline.h1Count).toBe(0);
    expect(m.largestTextIsH1).toBe(false);
    expect(Object.values(m.trunkTest).every((v) => !v)).toBe(true);
  });
});

describe("metricsFromHtml (HTML-only fallback)", () => {
  it("fills DOM-derivable fields and nulls layout fields", () => {
    const m = metricsFromHtml(SYNTHETIC, "https://acme.example/", VIEWPORTS.desktop);
    expect(m.source).toBe("html");
    expect([m.pageHeightPx, m.foldRatio, m.aboveFoldCtaCount, m.primaryCtaAmbiguity, m.fontSizeBuckets, m.largestTextIsH1]).toEqual([
      null, null, null, null, null, null,
    ]);
    expect(m.totalCtaCount).toBe(5);
    expect(m.navItemCount).toBe(10);
    expect(m.headingOutline.skippedLevels).toEqual(["h2→h4"]);
    expect(m.trunkTest.hasSiteName).toBe(true);
    expect(m.trunkTest.hasSearch).toBe(false);
  });

  it("reads unquoted attributes and ignores aria-current=false", () => {
    const html = `<header><a href=/ class=logo>Acme</a><nav><a href=/a aria-current=false>A</a><a href=/b>B</a><a href=/c>C</a></nav></header>
      <main><h1>Pricing</h1><a href=/start class=btn>Start</a></main>`;
    const m = metricsFromHtml(html, "https://acme.example/pricing", VIEWPORTS.desktop);
    expect(m.trunkTest.hasSiteName).toBe(true);
    expect(m.trunkTest.hasYouAreHere).toBe(false);
    expect(m.totalCtaCount).toBe(1);
  });
});

describe("metricFindings rules", () => {
  it("flags long scroll, CTA ambiguity, nav overload, heading outline, hierarchy and trunk test with evidence", async () => {
    const { state } = await measure(`${base}/`);
    const findings = metricFindings([state]);
    const byRule = (rule: string) => findings.find((f) => f.findingId.startsWith(`f_metric_${rule}_`));
    expect(byRule("long-scroll")?.krugPrinciple).toBe("scanning-not-reading");
    expect(byRule("cta-ambiguity")?.krugPrinciple).toBe("mindless-choices");
    expect(byRule("nav-overload")?.title).toMatch(/9 items/);
    expect(byRule("heading-outline")?.title).toMatch(/2 h1 elements; skips h2→h4/);
    expect(byRule("hierarchy-mismatch")).toBeDefined();
    expect(byRule("trunk-test")?.title).toMatch(/missing search \(trunk test fails\)$/);
    expect(byRule("no-cta-above-fold")).toBeUndefined();
    for (const f of findings) {
      expect(f.affectedStates).toEqual([state.stateId]);
      expect(f.evidencePaths).toEqual([state.screenshotPath]);
      expect(f.evidenceType).toBe("reproducible-concern");
    }
  });

  it("is quiet on a clean page and escalates trunk-test collapse", () => {
    const clean: PageMetrics = {
      source: "browser", pageHeightPx: 1800, viewportHeightPx: 900, foldRatio: 2, estimatedScrollTimeSec: 3,
      aboveFoldCtaCount: 2, totalCtaCount: 3, primaryCtaAmbiguity: 1, primaryCtaLabels: ["Start"],
      headingOutline: { h1Count: 1, h1Text: ["Acme"], skippedLevels: [] }, navItemCount: 5,
      fontSizeBuckets: [{ px: 40, chars: 4 }], textDensity: 5, largestTextIsH1: true,
      trunkTest: { hasSiteName: true, hasPageName: true, hasPrimaryNav: true, hasSearch: true, hasYouAreHere: false },
    };
    const mk = (url: string, metrics: PageMetrics) => {
      const s = makeState({ url, viewport: VIEWPORTS.desktop, title: "t", visibleText: "", actions: [] });
      s.metrics = metrics;
      return s;
    };
    expect(metricFindings([mk("https://acme.example/", clean)])).toEqual([]);
    const deep = mk("https://acme.example/docs", {
      ...clean,
      trunkTest: { hasSiteName: false, hasPageName: false, hasPrimaryNav: true, hasSearch: true, hasYouAreHere: false },
    });
    const [trunk] = metricFindings([mk("https://acme.example/", clean), deep]);
    expect(trunk.severity).toBe("high");
    expect(trunk.affectedStates).toEqual([deep.stateId]);
    expect(trunk.title).toBe("Desktop: missing site ID, page name, you-are-here indicator (trunk test fails)");
  });
});
