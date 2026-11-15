import { describe, expect, it, vi } from "vitest";
import { Experiment, type ExperimentStore, type LlmClient } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { buildPage, deterministicPlan, lintRebuiltPage, planSite, rebuildPending, renderSiteDocument, rewriteSiteLinks, sitemapFromGraph, siteStylesheet } from "@/lib/rebuild/site";
import { rollupBrand } from "@/lib/rebuild";
import { parseHTML } from "linkedom";

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
  it("uses a subpath target (or first crawl page) as home and rewrites its links consistently", async () => {
    const exp = fixture(2);
    exp.targetUrl = "https://example.com/blog";
    exp.graph!.states[0].url = "https://example.com/blog/post";
    exp.graph!.states[1].url = exp.targetUrl;
    exp.graph!.states[0].brand = { cssVars: {}, colors: [], fonts: [], navItems: [{ label: "Blog", href: "/blog" }] };
    const site = deterministicPlan(exp);
    expect(site.pages.map(p => p.path)).toEqual(["/", "/blog/post"]);
    expect(site.pages[0].sourceUrl).toBe(exp.targetUrl);
    expect(site.nav).toEqual([{ label: "Blog", path: "/" }]);
    const built = await buildPage(exp, site, site.pages[0], fake('<h1>Blog</h1><a href="/blog">Blog</a><a href="/blog/post">Post</a>'));
    expect(built.html).toContain('href="/experiments/exp_site/rb/"');
    expect(built.html).toContain('href="/experiments/exp_site/rb/blog/post"');
    exp.rebuild = { brand: rollupBrand(exp.graph!.states), generatedAt: exp.createdAt, goals: [], pages: [], llm: "fixture", site: { ...site, pages: [built, site.pages[1]] } };
    expect(renderSiteDocument(exp)).toContain("<h1>Blog</h1>");
    exp.targetUrl = "https://example.com/missing";
    expect(sitemapFromGraph(exp)[0]).toMatchObject({ path: "/", sourceUrl: "https://example.com/blog/post" });
    exp.graph!.states[0].url = "https://example.com/";
    exp.targetUrl = "https://example.com/blog";
    expect(sitemapFromGraph(exp).map(p => p.path)).toEqual(["/", "/blog"]);
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
  it("composes fallback sentences, planned actions and titled indexes without chrome duplicates", async () => {
    const exp = fixture(1);
    const state = exp.graph!.states[0];
    state.pageTitle = "Resources";
    state.visibleText = "Home Resources\nResources\nPractical guides for your next project. Share them with your team.\nMake a clear plan before you start.\nHome Contact\nStart here First guide Second guide Third guide";
    state.actions = [["Home", "/"], ["Resources", "/resources"], ["Contact", "mailto:hi@example.com"], ["First guide", "/guides/one"], ["Start here", "/start"], ["Second guide", "/guides/two"], ["Third guide", "/guides/three"], ["Second guide again", "/guides/two?ref=nav"]].map(([label, href], i) => ({ actionId: `a${i}`, stateId: state.stateId, label, href, type: "click", enabled: true, safeToExecute: true }));
    const site = deterministicPlan(exp);
    site.nav = [{ label: "Home", path: "/" }, { label: "Resources", path: "/resources" }];
    site.footer.links = [{ label: "Contact", href: "mailto:hi@example.com" }];
    const page = { ...site.pages[0], primaryAction: { label: "Start here", href: "/start" }, blocks: [{ type: "resource-index" as const, purpose: "Browse guides" }] };
    const built = await buildPage(exp, site, page, fake());
    const { document } = parseHTML(`<html><body>${built.html}</body></html>`);
    expect(document.querySelector(".rb-lede")?.textContent).toBe("Practical guides for your next project.");
    expect(document.querySelector(".rb-prose")?.textContent).toBe("Share them with your team.Make a clear plan before you start.");
    expect(document.querySelectorAll(".rb-btn--primary")).toHaveLength(1);
    expect(document.querySelector(".rb-btn--primary")?.textContent).toBe("Start here");
    expect(document.querySelectorAll(".rb-btn--secondary")).toHaveLength(1);
    expect([...document.querySelectorAll(".rb-index-title")].map(el => el.textContent)).toEqual(["Second guide", "Third guide"]);
    expect(document.querySelectorAll(".rb-index-item")).toHaveLength(2);
    expect([...document.querySelectorAll("section")].every(el => el.firstElementChild?.classList.contains("rb-container"))).toBe(true);
    expect(document.querySelector(".rb-prose")?.classList.contains("rb-container")).toBe(false);
    expect(built.html).not.toContain("mailto:");
    expect(built.issues).toEqual([]);
  });
  it("uses the first same-site non-navigation action when there is no planned CTA", async () => {
    const exp = fixture(1);
    const state = exp.graph!.states[0];
    state.visibleText = "Home Resources Build with clarity\nPractical tools for teams making useful software.\nExplore resources Get in touch GitHub";
    state.actions = [["Home", "/"], ["GitHub", "https://github.com/acme"], ["Explore resources", "/resources"], ["Get in touch", "mailto:hi@example.com"]].map(([label, href], i) => ({ actionId: `a${i}`, stateId: state.stateId, label, href, type: "click", enabled: true, safeToExecute: true }));
    const site = deterministicPlan(exp);
    site.nav = [{ label: "Home", path: "/" }, { label: "Resources", path: "/resources" }];
    const built = await buildPage(exp, site, site.pages[0], fake());
    const { document } = parseHTML(`<html><body>${built.html}</body></html>`);
    expect(document.querySelector(".rb-lede")?.textContent).toBe("Practical tools for teams making useful software.");
    expect(document.querySelector(".rb-btn--primary")?.getAttribute("href")).toBe("/experiments/exp_site/rb/resources");
    expect(document.querySelector(".rb-btn--primary")?.textContent).toBe("Explore resources");
    expect(document.querySelectorAll(".rb-btn--secondary, .rb-index, .rb-prose")).toHaveLength(0);
    expect(built.html).not.toContain("GitHub");
    expect(built.html).not.toContain("Get in touch");
  });
  it("keeps empty and failed-LLM fallbacks composed and ignores unsafe actions", async () => {
    const exp = fixture(1);
    exp.graph!.states[0].visibleText = "";
    exp.graph!.states[0].actions = ["javascript:alert(1)", "http://[invalid"].map((href, i) => ({ actionId: `a${i}`, stateId: "s0", label: "Bad action", href, type: "click", enabled: true, safeToExecute: true }));
    const site = deterministicPlan(exp);
    const page = { ...site.pages[0], primaryAction: { label: "Unsafe", href: "javascript:alert(1)" } };
    const built = await buildPage(exp, site, page, { name: "fixture", complete: async () => { throw new Error("Unavailable"); } });
    const { document } = parseHTML(`<html><body>${built.html}</body></html>`);
    expect(built.source).toBe("template");
    expect(document.querySelector("h1")?.textContent).toBe("Page 0");
    expect(document.querySelectorAll(".rb-lede, .rb-prose, .rb-index, .rb-btn")).toHaveLength(0);
    expect(built.html).not.toMatch(/javascript:|invalid|Unsafe/);
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
  it("trims oversized fallback content and fails irreducible pages without rejecting a batch", async () => {
    const exp = fixture(2);
    exp.graph!.states[0].pageTitle = "A".repeat(40000);
    exp.graph!.states[0].visibleText = `${"<&>".repeat(2100)} A useful sentence.\n`.repeat(2);
    exp.graph!.states[0].actions = Array.from({ length: 30 }, (_, i) => ({ actionId: `a${i}`, stateId: "s0", type: "click", label: `Guide ${i} ${"<&>".repeat(100)}`, href: `/guides/${i}/${"&".repeat(1800)}`, enabled: true, safeToExecute: true }));
    const site = deterministicPlan(exp);
    const built = await buildPage(exp, site, site.pages[0], fake());
    expect(built.status).toBe("built");
    expect(built.source).toBe("template");
    expect(built.bytes).toBeLessThanOrEqual(30 * 1024);
    expect(built.html).toContain("<h1>");

    let saved = fixture(2);
    const broken = deterministicPlan(saved);
    broken.pages[0].sourceUrl = "https://example.com/%252f";
    saved.rebuild = { generatedAt: saved.createdAt, brand: rollupBrand(saved.graph!.states), goals: [], pages: [], llm: "fixture", site: broken };
    const store = { get: async () => structuredClone(saved), save: async (value: Experiment) => { saved = structuredClone(value); }, appendActivity: async () => {} } as unknown as ExperimentStore;
    const orch = new Orchestrator({ store, llm: fake() });
    await expect(orch.rebuild(saved.id)).resolves.toBeDefined();
    expect(saved.rebuild!.site!.pages[0]).toMatchObject({ status: "failed", issues: ["template fallback failed"] });
    expect(saved.rebuild!.site!.pages[1].status).toBe("failed");
    expect(saved.rebuild!.site!.completedAt).toBeDefined();
  });
});
