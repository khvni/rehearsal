import { describe, expect, it } from "vitest";
import { Experiment, type Finding } from "@/lib/contracts";
import { rollupBrand } from "@/lib/rebuild";
import { buildPage, deterministicPlan, renderSiteDocument } from "@/lib/rebuild/site";
import { experimentPreview, previewImageUrl, previewOrigin, rebuildPreview } from "@/lib/link-preview";

const finding = (id: string, severity: Finding["severity"], title: string): Finding => ({
  findingId: id, title, category: "hierarchy", severity, evidenceType: "reproducible-concern",
  description: "d", affectedStates: ["s0"], affectedActions: [], evidencePaths: [], recommendation: "r",
  verificationStatus: "reproduced", principle: "people-scan-they-dont-read",
});

function fixture(): Experiment {
  const paths = ["/", "/about"];
  return Experiment.parse({
    id: "exp_abcdef12", targetUrl: "https://www.example.com/", goal: "Read about the team", status: "complete",
    createdAt: "2026-01-01T00:00:00Z", configuration: {},
    findings: [finding("f_low", "low", "Footer links are tiny"), finding("f_high", "high", "No clear heading")],
    graph: {
      states: paths.map((path, i) => ({
        stateId: `s${i}`, stateHash: `h${i}`, url: `https://www.example.com${path}`,
        pageTitle: path === "/" ? "Acme" : "About", visibleText: "Useful resources for teams.",
        viewport: { name: "desktop", width: 1280, height: 900 }, actions: [],
      })),
      edges: [],
    },
  });
}

async function withRebuild(exp: Experiment) {
  const site = deterministicPlan(exp);
  site.pages = await Promise.all(site.pages.map((p) => buildPage(exp, site, p, { name: "fixture", complete: async () => "" })));
  exp.rebuild = { generatedAt: exp.createdAt, brand: rollupBrand(exp.graph!.states), goals: [], pages: [], llm: "fixture", site };
  return exp;
}

describe("link previews", () => {
  it("summarises findings worst-first for the experiment card", () => {
    const p = experimentPreview(fixture());
    expect(p.title).toBe("example.com: 2 usability findings");
    expect(p.description).toMatch(/^1 high, 1 low\. Start here: No clear heading/);
  });

  it("builds absolute image URLs from the forwarded origin", () => {
    const origin = previewOrigin(new Headers({ host: "internal:8787", "x-forwarded-host": "rehearsal.alikhani.co", "x-forwarded-proto": "https" }));
    expect(origin).toBe("https://rehearsal.alikhani.co");
    expect(previewOrigin(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(previewImageUrl(origin, "exp_abcdef12", "rebuild", "/about")).toBe(
      "https://rehearsal.alikhani.co/experiments/exp_abcdef12/og?view=rebuild&path=%2Fabout",
    );
    expect(previewImageUrl(origin, "exp_abcdef12", "findings")).toBe("https://rehearsal.alikhani.co/experiments/exp_abcdef12/og");
  });

  it("describes the rebuilt page and tags /rb/ documents for unfurling", async () => {
    const exp = await withRebuild(fixture());
    const home = rebuildPreview(exp, "/")!;
    expect(home.pagesBuilt).toBe(home.pagesTotal);
    expect(home.title).toMatch(/, rebuilt by Rehearsal$/);
    expect(rebuildPreview(exp, "/about")!.path).toBe("/about");
    expect(rebuildPreview(fixture())).toBeNull();

    const html = renderSiteDocument(exp, "/about", { origin: "https://rehearsal.alikhani.co" });
    expect(html).toContain('<meta property="og:site_name" content="Rehearsal">');
    expect(html).toContain('<meta property="og:url" content="https://rehearsal.alikhani.co/experiments/exp_abcdef12/rb/about">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain("og?view=rebuild&amp;path=%2Fabout");
    expect(renderSiteDocument(exp, "/about")).not.toContain("og:image");
  });
});
