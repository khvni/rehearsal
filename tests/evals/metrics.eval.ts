import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { KrugPrinciple, VIEWPORTS, type PageMetrics, type Viewport } from "@/lib/contracts";
import { measurePage, metricsFromHtml } from "@/lib/browser/metrics";
import { metricFindings } from "@/lib/analysis/metric-findings";
import { makeState } from "@/lib/graph";

const T = (JSON.parse(readFileSync(path.join(__dirname, "evals.config.json"), "utf8")) as { thresholds: Record<string, number | boolean | string[]> })
  .thresholds;
const html = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");

let server: Server;
let base: string;
let browser: Browser;
const measured: Partial<Record<Viewport["name"], PageMetrics>> = {};

/** Hermetic: fixture served on loopback, every other request (CDN css/fonts/images) aborted. */
async function measureFixture(viewport: Viewport): Promise<PageMetrics> {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await ctx.route("**/*", (r) => (r.request().url().startsWith(base) && r.request().url().endsWith("/code/2026") ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    await page.goto(`${base}/code/2026`, { waitUntil: "networkidle" });
    const m = await measurePage(page);
    if (!m) throw new Error("measurePage returned nothing");
    return m;
  } finally {
    await ctx.close();
  }
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const ok = req.url === "/code/2026";
    res.writeHead(ok ? 200 : 404, { "content-type": "text/html" });
    res.end(ok ? html : "not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  browser = await chromium.launch({ headless: true });
  measured.desktop = await measureFixture(VIEWPORTS.desktop);
  measured.mobile = await measureFixture(VIEWPORTS.mobile);
}, 60000);

afterAll(async () => {
  await browser?.close();
  await new Promise((r) => server.close(r));
});

describe("eval: page metrics on the AIE fixture", () => {
  it("is deterministic across repeated measurements", async () => {
    expect(await measureFixture(VIEWPORTS.desktop)).toEqual(measured.desktop);
  });

  it("measures scroll depth and a consistent scroll-time estimate", () => {
    for (const m of [measured.desktop!, measured.mobile!]) {
      expect(m.source).toBe("browser");
      expect(m.foldRatio!).toBeGreaterThanOrEqual(T.metricsMinHomepageFoldRatio as number);
      expect(m.estimatedScrollTimeSec!).toBeCloseTo(m.foldRatio! * 1.5, 0);
    }
    expect(measured.mobile!.foldRatio!).toBeGreaterThan(measured.desktop!.foldRatio!);
  });

  it("finds the heading skeleton, primary nav and CTA surface", () => {
    const d = measured.desktop!;
    expect(d.headingOutline.h1Count).toBe(T.metricsExpectedH1Count);
    expect(d.headingOutline.h1Text[0]).toMatch(/agentic coding/i);
    expect(d.largestTextIsH1).toBe(true);
    expect(d.navItemCount).toBeGreaterThanOrEqual(T.metricsMinNavItems as number);
    expect(d.totalCtaCount).toBeGreaterThanOrEqual(T.metricsMinCtas as number);
    expect(d.primaryCtaAmbiguity!).toBeLessThanOrEqual(T.metricsMaxPrimaryCtaAmbiguity as number);
    expect(d.fontSizeBuckets!.length).toBeGreaterThanOrEqual(T.metricsMinFontSizeBuckets as number);
    expect(d.trunkTest).toMatchObject({ hasPageName: true, hasPrimaryNav: true, hasSearch: true, hasSiteName: false });
  });

  it("HTML-only fallback agrees on DOM facts and nulls layout facts", () => {
    const h = metricsFromHtml(html, "https://ai.engineer/code/2026", VIEWPORTS.desktop);
    expect(h.headingOutline).toEqual(measured.desktop!.headingOutline);
    expect(h.trunkTest.hasSearch).toBe(measured.desktop!.trunkTest.hasSearch);
    expect([h.foldRatio, h.aboveFoldCtaCount, h.primaryCtaAmbiguity, h.textDensity, h.largestTextIsH1]).toEqual([null, null, null, null, null]);
  });

  it("emits the expected Krug-cited metric findings with screenshot evidence", () => {
    const states = (["desktop", "mobile"] as const).map((vp) => {
      const s = makeState({
        url: "https://ai.engineer/code/2026",
        viewport: VIEWPORTS[vp],
        title: "AI Engineer CODE Summit 2026",
        visibleText: "",
        actions: [],
        screenshotPath: `data/evidence/aie_${vp}.png`,
      });
      s.metrics = measured[vp];
      return s;
    });
    const findings = metricFindings(states);
    const rules = new Set(findings.map((f) => f.findingId.split("_")[2]));
    for (const rule of T.metricsRequiredRules as unknown as string[]) expect(rules).toContain(rule);
    expect(rules.has("cta-ambiguity")).toBe(false);
    for (const f of findings) {
      expect(KrugPrinciple.options).toContain(f.krugPrinciple);
      expect(f.evidencePaths.length).toBeGreaterThan(0);
      expect(f.affectedStates.length).toBeGreaterThan(0);
    }
  });
});
