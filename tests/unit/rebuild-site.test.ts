import { describe, expect, it, vi } from "vitest";
import { Experiment, type ExperimentStore, type LlmClient } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { buildPage, deterministicPlan, lintRebuiltPage, planSite, rebuildPending, renderSiteDocument, rewriteSiteLinks, sitemapFromGraph, siteStylesheet } from "@/lib/rebuild/site";
import { rollupBrand } from "@/lib/rebuild";

function fixture(count = 8): Experiment {
  return Experiment.parse({ configuration: {}, id: "exp_site", targetUrl: "https://example.com", goal: "Read resources", createdAt: "2026-01-01T00:00:00Z", status: "complete", graph: { states: Array.from({ length: count }, (_, i) => ({ stateId: `s${i}`, stateHash: `h${i}`, url: `https://example.com/${i || ""}`, pageTitle: `Page ${i}`, visibleText: "Useful information from the audited website for readers.", viewport: { name: "desktop", width: 1280, height: 900 }, actions: [] })), edges: [] }, spec: { targetUrl: "https://example.com", goal: "Read resources", generatedAt: "2026-01-01T00:00:00Z", summary: "Improve navigation", changes: [], rebuildPhases: [] } });
}
const fake = (output = ""): LlmClient => ({ name: "openrouter", complete: vi.fn(async () => output) });

describe("whole-site rebuild", () => {
  it("normalizes/deduplicates same-site paths, orders home first and ignores foreign states", () => {
    const exp = fixture(3);
    exp.graph!.states[0].url = "https://example.com/resources/?q=1#x";
    exp.graph!.states[1].url = "https://www.example.com/resources";
    exp.graph!.states[2].url = "https://example.com/";
    exp.graph!.states.push({ ...exp.graph!.states[0], url: "https://elsewhere.test/no" });
    expect(sitemapFromGraph(exp).map(p => p.path)).toEqual(["/", "/resources"]);
    expect(sitemapFromGraph(fixture(0))).toEqual([]);
  });
  it("falls back deterministically and fills missing planner pages without trusting source URLs", async () => {
    const exp = fixture();
    const plan = deterministicPlan(exp);
    expect(await planSite(exp, fake("not json"))).toEqual(plan);
    const llm = fake(JSON.stringify({ ...plan, pages: [{ ...plan.pages[0], sourceUrl: "https://evil.test" }] }));
    const result = await planSite(exp, llm);
    expect(result.plannerSource).toBe("llm");
    expect(result.pages).toHaveLength(8);
    expect(result.pages[0].sourceUrl).toBe(exp.graph!.states[0].url);
    expect(llm.complete).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ model: "rebuild-planner", timeoutMs: 180000 }));
  });
  it("derives a branded footer from non-nav pages and social/contact links", () => {
    const exp = fixture();
    exp.graph!.states[0].brand = { cssVars: {}, colors: [], fonts: [], siteName: "Acme", navItems: [{ label: "Home", href: "https://example.com/" }] };
    const state = exp.graph!.states[0];
    state.actions = ["https://www.linkedin.com/company/acme", "mailto:hello@example.com", "https://unrelated.test", "javascript:alert(1)"].map((href, i) => ({ actionId: `a${i}`, stateId: state.stateId, type: "click", label: `Link ${i}`, href, enabled: true, safeToExecute: true }));
    const plan = deterministicPlan(exp);
    expect(plan.footer.note).toBe("Acme");
    expect(plan.footer.links.map(l => l.href)).toEqual(expect.arrayContaining(["/1", "https://www.linkedin.com/company/acme", "mailto:hello@example.com"]));
    expect(plan.footer.links.some(l => ["/", "https://unrelated.test", "javascript:alert(1)"].includes(l.href))).toBe(false);
  });
  it("rewrites same-site links, preserves fragments, leaves mail/external links and is idempotent", () => {
    const opts = { origin: "https://example.com", base: "/experiments/e/rb" };
    const html = rewriteSiteLinks('<a href="https://www.example.com/docs/?q=1#part">Docs</a><a href="/">Home</a><a href="mailto:a@b.co">Mail</a><a href="https://external.test">Out</a>', opts);
    expect(html).toContain('href="/experiments/e/rb/docs#part"');
    expect(html).toContain('href="/experiments/e/rb/"');
    expect(html).toContain('href="mailto:a@b.co"');
    expect(html).toContain('rel="noopener"');
    expect(rewriteSiteLinks(html, opts)).toBe(html);
    expect(rewriteSiteLinks("", opts)).toBe("");
  });
  it("detects forbidden polish and internal links", () => {
    expect(lintRebuiltPage('<section class="rb-hero"><p>OUR STORY</p><h1>Hello</h1><a class="rb-btn--primary">A</a><a class="rb-btn--primary">B</a><i>🚀</i></section><a href="/docs">Docs</a>', { origin: "https://example.com", base: "/experiments/e/rb" })).toEqual(expect.arrayContaining(["eyebrow label", "multiple primary hero actions", "emoji used as icons", "internal link outside rebuild"]));
    expect(lintRebuiltPage("<h1>Hello</h1><p>A useful introduction.</p>")).toEqual([]);
  });
  it("sanitizes the body, resolves relative links, strips CSS and retries lint once", async () => {
    const exp = fixture(); const site = deterministicPlan(exp);
    const llm = fake('<style>h1{color:red}</style><section class="rb-hero"><p class="kicker">STORY</p><h1 style="color:red">Hello</h1><a href="docs?q=x#part">Read</a><script>alert(1)</script><img src="https://evil.test/a.png"></section>');
    const built = await buildPage(exp, site, site.pages[0], llm);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(built.html).not.toMatch(/<style|style=|<script|evil.test/);
    expect(built.html).toContain('/experiments/exp_site/rb/docs#part');
    expect(built.issues).toContain("eyebrow label");
    for (const output of ["", "{bad json}", "x".repeat(40000)]) {
      const fallback = await buildPage(exp, site, site.pages[0], fake(output));
      expect(fallback.source).toBe("template"); expect(fallback.html).toContain("Page 0");
    }
  });
  it("renders a shared shell and safe token CSS, including the not-rebuilt surface", async () => {
    const exp = fixture(1); const site = deterministicPlan(exp);
    site.pages[0] = await buildPage(exp, site, site.pages[0], fake("<h1>Welcome</h1>"));
    exp.rebuild = { brand: rollupBrand(exp.graph!.states), generatedAt: exp.createdAt, goals: [], pages: [], llm: "fixture", site };
    expect(renderSiteDocument(exp)).toContain('/rb/_assets/site.css');
    expect(renderSiteDocument(exp)).toContain('aria-current="page"');
    expect(renderSiteDocument(exp, "/missing")).toContain("Not rebuilt yet");
    expect(siteStylesheet({ ...site.tokens, primary: "red;}body{display:none}", fontSans: "url(https://evil.test)" })).not.toContain("evil.test");
    expect(siteStylesheet(site.tokens)).toContain("prefers-reduced-motion");
  });
  it("persists a plan, builds six pages per step, completes and restarts explicitly", async () => {
    let saved = fixture();
    const events: unknown[] = [];
    const store = { get: async () => structuredClone(saved), save: async (exp: Experiment) => { saved = structuredClone(exp); }, appendActivity: async (event: unknown) => { events.push(event); } } as unknown as ExperimentStore;
    const orch = new Orchestrator({ store, llm: fake(), fetcher: { name: "fixture", fetchHtml: async () => "" } });
    await orch.rebuild(saved.id);
    expect(saved.status).toBe("rebuilding"); expect(rebuildPending(saved)).toBe(true);
    expect(saved.rebuild!.site!.pages.every(p => p.status === "planned")).toBe(true);
    await orch.rebuild(saved.id);
    expect(saved.rebuild!.site!.pages.filter(p => p.status === "built")).toHaveLength(6);
    await orch.rebuild(saved.id);
    expect(saved.status).toBe("complete"); expect(rebuildPending(saved)).toBe(false);
    expect(Experiment.parse(saved).rebuild!.site!.pages).toHaveLength(8);
    await orch.rebuild(saved.id, { restart: true });
    expect(saved.rebuild!.site!.pages.every(p => p.status === "planned")).toBe(true);
  });
});
