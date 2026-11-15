import { describe, expect, it, vi } from "vitest";
import { Experiment, type ExperimentStore, type LlmClient } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { buildPage, deterministicPlan, lintRebuiltPage, planSite, rebuildPending, renderSiteDocument, rewriteSiteLinks, sitemapFromGraph, siteStylesheet } from "@/lib/rebuild/site";
import { rollupBrand } from "@/lib/rebuild";
import { parseHTML } from "linkedom";
import { contrastRatio, parseColor } from "@/lib/rebuild/brand";
import { repairSiteTokens } from "@/lib/rebuild/site-tokens";

function fixture(count = 8): Experiment {
  return Experiment.parse({ configuration: {}, id: "exp_site", targetUrl: "https://example.com", goal: "Read resources", createdAt: "2026-01-01T00:00:00Z", status: "complete", graph: { states: Array.from({ length: count }, (_, i) => ({ stateId: `s${i}`, stateHash: `h${i}`, url: `https://example.com/${i || ""}`, pageTitle: `Page ${i}`, visibleText: "Useful information from the audited website for readers.", viewport: { name: "desktop", width: 1280, height: 900 }, actions: [] })), edges: [] }, spec: { targetUrl: "https://example.com", goal: "Read resources", generatedAt: "2026-01-01T00:00:00Z", summary: "Improve navigation", changes: [], rebuildPhases: [] } });
}
const fake = (output = ""): LlmClient => ({ name: "openrouter", complete: vi.fn(async () => output) });

describe("whole-site rebuild", () => {
  it("cleans stored nav labels and prioritizes a bounded footer over crawled article dumps", () => {
    const exp = fixture(40);
    const home = exp.graph!.states[0];
    exp.graph!.states[1].url = "https://example.com/about";
    exp.graph!.states[15].url = "https://example.com/contact";
    home.brand = { cssVars: {}, colors: [], fonts: [], navItems: [{ label: "Home", href: "/" }, { label: "About About", href: "/about" }, { label: "About", href: "/about" }] };
    home.actions = ["https://github.com/acme/project", "https://github.com/acme", "mailto:hi@example.com", "https://x.com/acme", "javascript:bad()"].map((href, i) => ({ actionId: `a${i}`, stateId: home.stateId, label: i < 2 ? "GitHub GitHub" : "Contact", href, type: "click", enabled: true, safeToExecute: true }));
    const site = deterministicPlan(exp);
    expect(site.nav).toEqual([{ label: "Home", path: "/" }, { label: "About", path: "/about" }]);
    expect(site.footer.links).toHaveLength(8);
    expect(site.footer.links.map(l => l.href)).toEqual(expect.arrayContaining(["mailto:hi@example.com", "https://github.com/acme", "https://x.com/acme", "/contact"]));
    expect(site.footer.links.some(l => l.href === "/about" || l.href.startsWith("javascript:"))).toBe(false);
    expect(site.footer.links.find(l => l.href.includes("github"))?.label).toBe("GitHub");
    expect(deterministicPlan(fixture(0)).footer.links).toEqual([]);
  });
  it("rejects bare link dumps, preserves proper indexes and prose, and falls back after a failed retry", async () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/guide/${i}">Guide ${i}</a>`);
    const dump = `<section><h2>All links</h2>${links.join(" ")}</section>`;
    expect(lintRebuiltPage(dump)).toContain("oversized link dump");
    expect(lintRebuiltPage("<h1>No links</h1>")).not.toContain("oversized link dump");
    expect(lintRebuiltPage(`<div class="rb-prose">${links.map(l => `<p>${"Detailed article context. ".repeat(5)}${l}</p>`).join("")}</div>`)).not.toContain("oversized link dump");
    expect(lintRebuiltPage(`<ul class="rb-index">${links.map(l => `<li class="rb-index-item"><h2 class="rb-index-title">${l}</h2></li>`).join("")}</ul>`)).not.toContain("oversized link dump");
    const exp = fixture(1);
    const site = deterministicPlan(exp);
    const llm = fake(dump);
    const page = await buildPage(exp, site, site.pages[0], llm);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(page).toMatchObject({ source: "template", status: "built", issues: [] });
  });
  it("derives dark-brand surfaces and repairs deterministic and LLM token contrast", async () => {
    const exp = fixture(1);
    exp.graph!.states[0].brand = { cssVars: { "--background": "#24292e", "--foreground": "#e1e4e8", "--primary": "#58b595" }, colors: ["#24292e", "#e1e4e8", "#58b595"], fonts: [], navItems: [] };
    const dark = deterministicPlan(exp);
    expect(dark.tokens.background).toBe("#24292e");
    expect(dark.tokens.muted).not.toBe("#f4f4f5");
    expect(dark.tokens.border).not.toBe(dark.tokens.background);
    const check = (tokens: typeof dark.tokens) => {
      for (const [foreground, background] of [["foreground", "background"], ["foreground", "muted"], ["foreground", "card"], ["mutedForeground", "muted"], ["mutedForeground", "background"], ["primaryForeground", "primary"]] as const)
        expect(contrastRatio(parseColor(tokens[foreground])!, parseColor(tokens[background])!)).toBeGreaterThanOrEqual(4.5);
    };
    check(dark.tokens);
    const broken = { ...dark.tokens, muted: "#f4f4f5", card: "#ffffff", mutedForeground: "#a3a3a3", primaryForeground: "#ffffff" };
    const planned = await planSite(exp, fake(JSON.stringify({ ...dark, tokens: broken })));
    expect(planned.plannerSource).toBe("llm");
    check(planned.tokens);
    for (const background of ["#ffffff", "#000000", "#777777", "#ff0000", "rgb(40 48 60)", "transparent", "invalid", "rgba(0,0,0,0.1)"]) {
      const repaired = repairSiteTokens({ ...broken, background, foreground: background });
      check(repaired);
      expect(repairSiteTokens(repaired)).toEqual(repaired);
    }
    const css = siteStylesheet(broken);
    expect(css.slice(css.lastIndexOf(":root"))).not.toContain("--muted:#f4f4f5");
    expect(css).toContain(".rb-section--muted,.rb-cta-band{color:var(--foreground)}");
  });
  it("bounds planner facts while keeping the complete page facts for implementation", async () => {
    const exp = fixture(1);
    const state = exp.graph!.states[0];
    state.visibleText = "Page facts. ".repeat(1100) + "IMPLEMENTER_ONLY_TAIL";
    state.headings = ["A real heading"];
    state.actions = Array.from({ length: 300 }, (_, i) => ({ actionId: `a${i}`, stateId: state.stateId, label: `Link ${i}`, href: `https://example.com/item/${i}`, type: "click" as const, enabled: true, safeToExecute: true }));
    const llm = fake(JSON.stringify(deterministicPlan(exp)));
    const site = await planSite(exp, llm);
    const prompt = vi.mocked(llm.complete).mock.calls[0][0];
    expect(prompt).toContain("A real heading");
    expect(prompt).not.toContain("IMPLEMENTER_ONLY_TAIL");
    expect(prompt).not.toContain('"label":"Link 299"');
    expect(prompt.length).toBeLessThan(18000);
    expect(llm.complete).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxTokens: 65536 }));
    expect(site.plannerError).toBeUndefined();
    const implementer = fake("<h1>Built</h1>");
    await buildPage(exp, site, site.pages[0], implementer);
    expect(vi.mocked(implementer.complete).mock.calls[0][0]).toContain("IMPLEMENTER_ONLY_TAIL");
  });
  it("records bounded planner errors for truncated JSON, empty output, schema and provider failures", async () => {
    const exp = fixture();
    for (const output of ['{"tokens":', ""]) {
      const site = await planSite(exp, fake(output));
      expect(site).toMatchObject({ plannerSource: "template", plannerError: "parse error: invalid planner JSON" });
    }
    expect((await planSite(exp, fake("{}"))).plannerError).toMatch(/zod: tokens: invalid_type/);
    const llm: LlmClient = { name: "fake", complete: async () => { throw new Error("Provider failed".repeat(100)); } };
    expect((await planSite(exp, llm)).plannerError).toHaveLength(320);
    const empty = await planSite(fixture(0), fake(JSON.stringify(deterministicPlan(fixture(0)))));
    expect(empty).toMatchObject({ plannerSource: "llm", pages: [] });
  });
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
    expect(await planSite(exp, fake("not json"))).toEqual({ ...plan, plannerError: "parse error: invalid planner JSON" });
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
  it("plans safely when redirect targets contain encoded separators or URLs are malformed", async () => {
    const exp = fixture(2);
    exp.targetUrl = "https://example.com/blog%2F";
    exp.graph!.states[0].url = "https://example.com/blog";
    exp.graph!.states[1].url = "not a URL";
    expect(sitemapFromGraph(exp)).toMatchObject([{ path: "/", sourceUrl: "https://example.com/blog" }]);
    expect(await planSite(exp, fake())).toMatchObject({ ...deterministicPlan(exp), plannerError: expect.stringContaining("parse error") });
    exp.targetUrl = "not a URL";
    expect(sitemapFromGraph(exp)).toEqual([]);
    expect(deterministicPlan(exp).pages).toEqual([]);
    await expect(planSite(exp, fake())).resolves.toMatchObject({ pages: [] });
    exp.targetUrl = "https://example.com/%252F";
    exp.graph!.states[0].url = "https://example.com/%2F";
    expect(deterministicPlan(exp).pages).toEqual([]);
    await expect(planSite(exp, fake())).resolves.toMatchObject({ pages: [] });
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
    state.pageTitle = "Build with clarity";
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
  it.each([false, true])("preserves pricing, schedules and short copy without punctuation (sentence=%s)", async (sentence) => {
    const exp = fixture(1);
    const state = exp.graph!.states[0];
    state.pageTitle = "Plans";
    state.visibleText = ["Home Plans", "$29 per month", "Monday–Friday 9am–5pm", "Built for small teams", ...(sentence ? ["Choose the plan that fits your team. Start whenever you are ready."] : []), "Home Contact"].join("\n");
    const site = deterministicPlan(exp);
    site.nav = [{ label: "Home", path: "/" }, { label: "Plans", path: "/plans" }];
    site.footer.links = [{ label: "Contact", href: "mailto:hi@example.com" }];
    const built = await buildPage(exp, site, site.pages[0], fake());
    const { document } = parseHTML(`<html><body>${built.html}</body></html>`);
    expect(built.status).toBe("built");
    expect([...document.querySelectorAll(".rb-prose p")].map(el => el.textContent)).toEqual(["$29 per month", "Monday–Friday 9am–5pm", "Built for small teams", ...(sentence ? ["Start whenever you are ready."] : [])]);
    expect(document.querySelector(".rb-lede")?.textContent).toBe(sentence ? "Choose the plan that fits your team." : undefined);
    expect(built.html).not.toContain("Home Contact");
    expect(built.html).not.toContain("Home Plans");
  });
  it("persists a plan, builds six pages per step, completes and restarts explicitly", async () => {
    let saved = fixture();
    const events: unknown[] = [];
    const store = { get: async () => structuredClone(saved), save: async (exp: Experiment) => { saved = structuredClone(exp); }, appendActivity: async (event: unknown) => { events.push(event); } } as unknown as ExperimentStore;
    const orch = new Orchestrator({ store, llm: fake(), fetcher: { name: "fixture", fetchHtml: async () => "" } });
    await orch.rebuild(saved.id);
    expect(saved.status).toBe("rebuilding"); expect(rebuildPending(saved)).toBe(true);
    expect(JSON.stringify(events)).toContain("parse error: invalid planner JSON");
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
  it.each([true, false])("accumulates planner and batch usage without double counting (reset=%s)", async (reset) => {
    let saved = fixture(8);
    saved.usage = { llm: { calls: 7, inputTokens: 70, outputTokens: 14, totalTokens: 84, estimated: true }, jev: { calls: 3, inputTokens: 9, outputTokens: 3, totalTokens: 12 } };
    const jevUsage = structuredClone(saved.usage.jev);
    let calls = 0;
    const llm: LlmClient = {
      name: "fixture",
      complete: async () => { calls++; return ""; },
      ...(reset ? { resetBudget: () => { calls = 0; } } : {}),
      usageReport: () => ({ calls, inputTokens: calls * 10, outputTokens: calls * 2, totalTokens: calls * 12 }),
    };
    const store = { get: async () => structuredClone(saved), save: async (value: Experiment) => { saved = structuredClone(value); }, appendActivity: async () => {} } as unknown as ExperimentStore;
    const orch = new Orchestrator({ store, llm });
    for (const expectedCalls of [8, 14, 16]) {
      await orch.rebuild(saved.id);
      expect(saved.usage!.llm).toEqual({ calls: expectedCalls, inputTokens: expectedCalls * 10, outputTokens: expectedCalls * 2, totalTokens: expectedCalls * 12, estimated: true });
      expect(saved.usage!.jev).toEqual(jevUsage);
    }
    await orch.rebuild(saved.id);
    expect(saved.usage!.llm!.calls).toBe(16);
    await orch.rebuild(saved.id, { restart: true });
    expect(saved.usage!.llm!.calls).toBe(17);
  });
});
