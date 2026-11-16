import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Experiment, type ExperimentStore, type LlmClient, type PageFetcher, VIEWPORTS } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { extractPage } from "@/lib/browser/extract";
import { makeState } from "@/lib/graph";
import { collectRebuildGaps, GAP_STEP_MS } from "@/lib/rebuild/gaps";
import { deterministicPlan } from "@/lib/rebuild/site";
import { rollupBrand } from "@/lib/rebuild";
import { PlainFetcher } from "@/lib/fetch";
import { assertPublicUrl, fetchPublic } from "@/lib/fetch/guards";
import { GET } from "@/app/experiments/[id]/rb/[[...path]]/route";
import { POST } from "@/app/api/experiments/[id]/[stage]/route";

const mocks = vi.hoisted(() => ({ allowance: vi.fn(async () => true), sequence: 0 }));
vi.mock("node:crypto", async original => ({
  ...await original<typeof import("node:crypto")>(),
  randomUUID: () => `${(++mocks.sequence).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
}));
vi.mock("@/lib/ratelimit", () => ({ underRunLimit: mocks.allowance }));
vi.mock("@/lib/access", async original => ({
  ...await original<typeof import("@/lib/access")>(),
  presentsAccessToken: () => false,
  maxConcurrentRuns: () => 2,
  withRunSlot: async (fn: () => Promise<unknown>) => ({ busy: false, value: await fn() }),
}));
vi.mock("@/lib/fetch/guards", async original => ({
  ...await original<typeof import("@/lib/fetch/guards")>(),
  assertPublicUrl: vi.fn(async (url: string) => new URL(url)),
  robotsAllows: vi.fn(async () => true),
  fetchPublic: vi.fn(),
}));

const ID = "exp_abcdef12";
const g = globalThis as unknown as { __orchestrator?: Orchestrator };
const pageHtml = (links: string[] = []) => `<html><title>Survey</title><h1>Survey</h1><p>Survey content from the fetched page for our community.</p>${links.map(href => `<a href="${href}">Read ${href}</a>`).join("")}</html>`;
function fixture(links = ["/survey"]): Experiment {
  const html = pageHtml(links), page = extractPage(html, "https://example.com/");
  return Experiment.parse({ id: ID, configuration: {}, targetUrl: "https://example.com/", goal: "Read survey", status: "complete", createdAt: "2026-01-01T00:00:00Z",
    graph: { states: [makeState({ url: "https://example.com/", viewport: VIEWPORTS.desktop, title: "Home", visibleText: page.visibleText, actions: page.actions })], edges: [] },
    spec: { targetUrl: "https://example.com/", goal: "Read survey", generatedAt: "2026-01-01T00:00:00Z", summary: "Readable pages", changes: [], rebuildPhases: [] },
  });
}
function builtFixture(links: string[]) {
  const exp = fixture(links), site = deterministicPlan(exp);
  site.pages[0] = { ...site.pages[0], status: "built", html: pageHtml(links) };
  exp.rebuild = { generatedAt: exp.createdAt, brand: rollupBrand(exp.graph!.states), goals: [], pages: [], llm: "fixture", site };
  return exp;
}
function setup(exp = fixture(), pages: Record<string, string | Error> = { "/survey": pageHtml() }) {
  let saved = structuredClone(exp);
  const snapshots: Experiment[] = [];
  const fetcher: PageFetcher = { name: "fixture", fetchHtml: vi.fn(async url => {
    const value = pages[new URL(url).pathname];
    if (typeof value !== "string") throw value ?? new Error("Missing fixture");
    return value;
  }) };
  const llm: LlmClient = { name: "fixture", complete: vi.fn(async () => ""), resetBudget: vi.fn() };
  const store: ExperimentStore = { name: "memory", get: async () => structuredClone(saved), save: async value => { saved = Experiment.parse(structuredClone(value)); snapshots.push(structuredClone(saved)); }, list: async () => [saved], appendActivity: async () => {}, activity: async () => [] };
  const install = () => { g.__orchestrator = new Orchestrator({ store, llm, probeFetcher: fetcher }); };
  install();
  return { saved: () => saved, snapshots, fetcher, llm, install };
}
const post = () => POST(new Request(`http://localhost/api/experiments/${ID}/rebuild`, { method: "POST" }), { params: Promise.resolve({ id: ID, stage: "rebuild" }) });
const get = (path: string[]) => GET(new Request(`http://localhost/experiments/${ID}/rb/${path.join("/")}`), { params: Promise.resolve({ id: ID, path }) });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-01T12:00:00Z")); mocks.sequence = 0; mocks.allowance.mockClear(); });
afterEach(() => { delete g.__orchestrator; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("stepwise rebuild gaps", () => {
  it("discovers, fetches and builds missing pages using the existing design and one run charge", async () => {
    const ctx = setup();
    await post();
    const design = ctx.saved().rebuild!.site!;
    expect((await post()).status).toBe(200);
    expect(ctx.saved().rebuild!.site!.gap).toMatchObject({ cursor: 0, completed: false, candidates: [{ path: "/survey" }] });
    expect(ctx.saved().status).toBe("rebuilding");
    expect(ctx.saved().rebuild!.site!.completedAt).toBeUndefined();
    const calls = vi.mocked(ctx.llm.complete).mock.calls.length;
    expect((await post()).status).toBe(200);
    expect(ctx.llm.complete).toHaveBeenCalledTimes(calls);
    expect(ctx.llm.resetBudget).toHaveBeenLastCalledWith({ experimentId: ID, maxCalls: 0 });
    expect(ctx.fetcher.fetchHtml).toHaveBeenCalledWith("https://example.com/survey", expect.objectContaining({ requireHtmlContentType: true, signal: expect.any(AbortSignal) }));
    expect(ctx.saved().graph!.states.some(s => s.url === "https://example.com/survey" && s.visibleText.includes("fetched page"))).toBe(true);
    expect(ctx.saved().rebuild!.site!.pages[1]).toMatchObject({ path: "/survey", status: "planned", blocks: [{ type: "article-body" }] });
    expect((await post()).status).toBe(200);
    expect(ctx.saved().status).toBe("complete");
    expect(ctx.saved().rebuild!.site).toMatchObject({ tokens: design.tokens, nav: design.nav, footer: design.footer, plannerSource: design.plannerSource });
    expect(ctx.llm.complete).toHaveBeenCalledTimes(calls + 1);
    expect(mocks.allowance).toHaveBeenCalledTimes(1);
    expect((await get(["survey"])).status).toBe(200);
    expect(await (await get(["survey"])).text()).toContain("fetched page");
  });

  it("freezes one round, checkpoints each fetch, and resumes fetch and build steps on a new orchestrator", async () => {
    const ctx = setup(fixture(["/a", "/b", "/c"]), { "/a": pageHtml(["/nested"]), "/b": pageHtml(), "/c": pageHtml() });
    await post(); await post(); await post();
    expect(ctx.saved().rebuild!.site!.gap).toMatchObject({ cursor: 2, completed: false });
    expect(ctx.snapshots.some(s => s.rebuild?.site?.gap?.cursor === 1)).toBe(true);
    ctx.install();
    await post();
    expect(ctx.saved().rebuild!.site!.gap).toMatchObject({ cursor: 3, completed: true });
    ctx.install();
    await post();
    expect(ctx.saved().status).toBe("complete");
    expect(ctx.fetcher.fetchHtml).toHaveBeenCalledTimes(3);
    expect(ctx.saved().rebuild!.site!.pages).toHaveLength(4);
    expect((await get(["nested"])).status).toBe(404);
    expect(mocks.allowance).toHaveBeenCalledTimes(1);
  });

  it("caps the round and leaves over-cap paths not rebuilt", async () => {
    vi.stubEnv("REHEARSAL_REBUILD_GAP_MAX_PAGES", "1");
    const ctx = setup(fixture(["/a", "/b", "/c"]), { "/a": pageHtml(), "/b": pageHtml(), "/c": pageHtml() });
    await post(); await post();
    expect(ctx.saved().rebuild!.site!.gap).toMatchObject({ limit: 1, skipped: 2 });
    await post(); await post();
    expect(ctx.saved().status).toBe("complete");
    expect(ctx.fetcher.fetchHtml).toHaveBeenCalledTimes(1);
    expect((await get(["a"])).status).toBe(200);
    const missing = await get(["b"]);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Not rebuilt yet");
  });

  it("finishes after fetch failures and non-HTML responses without adding sitemap pages", async () => {
    const ctx = setup(fixture(["/missing", "/download"]), { "/missing": new Error("HTTP 404"), "/download": "%PDF-1.4" });
    await post(); await post(); await post();
    expect(ctx.saved().status).toBe("complete");
    expect(ctx.saved().rebuild!.site!.gap!.failed.map(p => p.path)).toEqual(["/missing", "/download"]);
    expect(ctx.saved().rebuild!.site!.pages).toHaveLength(1);
    for (const path of ["missing", "download"]) {
      const response = await get([path]);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Not rebuilt yet");
    }
  });

  it("honors the time budget before attempting another page", async () => {
    const ctx = setup(fixture(["/a", "/b"]));
    vi.mocked(ctx.fetcher.fetchHtml).mockImplementation(async () => { vi.setSystemTime(Date.now() + GAP_STEP_MS + 1); return pageHtml(); });
    await post(); await post(); await post();
    expect(ctx.saved().rebuild!.site!.gap).toMatchObject({ cursor: 1, completed: false });
    ctx.install();
    await post(); await post();
    expect(ctx.saved().status).toBe("complete");
  });
  it("checkpoints an aborted fetch even when the fetcher does not settle", async () => {
    const ctx = setup();
    await post(); await post();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.mocked(ctx.fetcher.fetchHtml).mockImplementation(async () => {
      controller.abort(new Error("Fetch deadline exceeded"));
      return new Promise<string>(() => {});
    });
    await post();
    expect(ctx.saved().status).toBe("complete");
    expect(ctx.saved().rebuild!.site!.gap).toMatchObject({ cursor: 1, completed: true, failed: [{ path: "/survey", reason: "Error: Fetch deadline exceeded" }] });
  });
});

describe("gap candidate selection", () => {
  it("collects built links, graph actions and edge destination states, deduping canonical paths", () => {
    const exp = builtFixture([`/experiments/${ID}/rb/a#one`, "/a?ref=two", "/caf%C3%A9"]);
    const graphOnly = extractPage(pageHtml(["/graph-only"]), exp.targetUrl);
    exp.graph!.states[0].actions = graphOnly.actions.map((a, i) => ({ ...a, actionId: `graph${i}`, stateId: exp.graph!.states[0].stateId }));
    exp.graph!.states.push({ ...exp.graph!.states[0], stateId: "edge", url: "https://example.com/edge", actions: [] });
    exp.graph!.edges.push({ fromStateId: exp.graph!.states[0].stateId, actionId: "graph0", toStateId: "edge" });
    expect(collectRebuildGaps(exp).candidates.map(p => p.path)).toEqual(["/a", "/café", "/graph-only", "/edge"]);
  });
  it("skips infrastructure, assets, external, malformed and non-HTTP links", () => {
    const exp = builtFixture(["/cdn-cgi/l/email-protection#abcd", "/%63dn-cgi/x", "/guide.md", "/paper.pdf", "/image.svg", "/data.xml", "/bundle.js", "/archive.zip", "https://outside.example/x", "mailto:info@example.com", "javascript:alert(1)", "/bad%2fpath", "/%252e%252e/secret"]);
    expect(collectRebuildGaps(exp)).toMatchObject({ candidates: [], completed: true, skipped: 0 });
  });
  it.each([["invalid", 12], ["-1", 12], ["0", 0], ["2", 2], ["200", 100]])("bounds configured cap %s to %s", (value, limit) => {
    vi.stubEnv("REHEARSAL_REBUILD_GAP_MAX_PAGES", value);
    expect(collectRebuildGaps(builtFixture(["/a"])).limit).toBe(limit);
  });
  it("respects the existing total HTML size cap", () => {
    const exp = builtFixture(["/a"]);
    exp.rebuild!.site!.pages[0].bytes = 700 * 1024;
    expect(collectRebuildGaps(exp)).toMatchObject({ limit: 0, skipped: 1, completed: true });
  });
});

describe("strict HTML gap fetching", () => {
  it.each(["application/pdf", "application/xml", "image/png", ""])('rejects content type "%s" through the guarded fetch path', async type => {
    vi.mocked(fetchPublic).mockResolvedValue(new Response("<html>Not an HTML response</html>", { headers: { "content-type": type } }));
    await expect(new PlainFetcher().fetchHtml("https://example.com/download", { requireHtmlContentType: true })).rejects.toThrow("Non-HTML response");
    expect(assertPublicUrl).toHaveBeenCalledWith("https://example.com/download");
    expect(fetchPublic).toHaveBeenCalledWith("https://example.com/download", expect.anything(), { requireSameOrigin: true });
  });
  it.each(["text/html; charset=utf-8", "application/xhtml+xml"])('accepts "%s"', async type => {
    vi.mocked(fetchPublic).mockResolvedValue(new Response(pageHtml(), { headers: { "content-type": type } }));
    await expect(new PlainFetcher().fetchHtml("https://example.com/survey", { requireHtmlContentType: true })).resolves.toContain("Survey content");
  });
});
