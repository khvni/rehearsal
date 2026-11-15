import { afterEach, describe, expect, it } from "vitest";
import { FirecrawlClient, looksLikeJsShell, stripNoscript } from "@/lib/fetch/firecrawl";
import { FIRECRAWL_MAX_INTERACT_ACTIONS } from "@/lib/contracts";
import { classifyError } from "@/lib/errors";
import { extractPage } from "@/lib/browser/extract";
import { Orchestrator } from "@/lib/orchestrator";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import type { BrowserRunner, Experiment, ExperimentStore, FirecrawlScrape, PageFetcher } from "@/lib/contracts";

const URL = "https://site.test/";
const PAGE = `<html><head><title>Alpha</title></head><body><h1>Alpha</h1><p>Hello world</p><a href="/about">About us</a></body></html>`;
const SHELL = `<html><head><title>App</title></head><body><div id="root"></div><script src="/main.js"></script><script src="/vendor.js"></script></body></html>`;
const RENDERED = `<html><head><title>Alpha</title></head><body><h1>Alpha app</h1><p>Rendered content for the app</p><a href="/about">About us</a><a href="/pricing">Pricing</a></body></html>`;

function memoryStore(): ExperimentStore {
  const all = new Map<string, Experiment>();
  return {
    name: "memory",
    async save(e) {
      all.set(e.id, e);
    },
    async get(id) {
      return all.get(id) ?? null;
    },
    async list() {
      return [...all.values()];
    },
    async appendActivity() {},
    async activity() {
      return [];
    },
  };
}

function fetcher(pages: Record<string, string>): PageFetcher {
  return {
    name: "fixture-fetch",
    async fetchHtml(url) {
      const html = pages[url];
      if (html === undefined) throw new Error(`fixture 404: ${url}`);
      return html;
    },
  };
}

function runner(pages: Record<string, string>): BrowserRunner {
  return {
    name: "fixture-runner",
    async openPage(url) {
      const html = pages[url];
      if (html === undefined) throw new Error(`fixture 404: ${url}`);
      return { html };
    },
    async runTrajectory() {
      throw new Error("not used");
    },
    async close() {},
  };
}

function firecrawlStub(over: {
  scrape?: (url: string) => Promise<FirecrawlScrape | null>;
  mapLinks?: (url: string, limit: number) => Promise<string[]>;
}) {
  const calls = { scrape: 0, map: 0, interact: 0 };
  const stub = {
    name: "firecrawl-stub",
    available: true,
    async fetchHtml() {
      return "";
    },
    async scrape(url: string) {
      calls.scrape++;
      return over.scrape ? over.scrape(url) : null;
    },
    async mapLinks(url: string, limit: number) {
      calls.map++;
      return over.mapLinks ? over.mapLinks(url, limit) : [];
    },
    async interact() {
      calls.interact++;
      return null;
    },
  };
  return { stub, calls };
}

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
  delete process.env.REHEARSAL_BROWSER;
});

describe("looksLikeJsShell", () => {
  const judge = (html: string) => looksLikeJsShell(html, extractPage(html, "https://x.test/"));

  it("flags an empty framework mount root", () => {
    expect(judge(SHELL)).toBe(true);
    expect(judge(`<html><body><div id="__next"></div><script src="/a.js"></script></body></html>`)).toBe(true);
  });

  it("flags 'enable javascript' boilerplate", () => {
    expect(judge(`<html><body><h1>Please enable JavaScript to run this app.</h1></body></html>`)).toBe(true);
  });

  it("flags a script-dominated page with almost no actions or text", () => {
    const scripts = Array.from({ length: 9 }, (_, i) => `<script src="/s${i}.js"></script>`).join("");
    expect(judge(`<html><body><p>hi</p>${scripts}</body></html>`)).toBe(true);
  });

  it("flags a zero-action page that still ships javascript", () => {
    expect(judge(`<html><body><p>Loading…</p><script src="/app.js"></script></body></html>`)).toBe(true);
  });

  it("leaves real pages and plain thin pages alone", () => {
    expect(judge(PAGE)).toBe(false);
    // thin but static — no scripts, so no renderer would change it
    expect(judge(`<html><body><h1>About</h1><p>Small static page.</p></body></html>`)).toBe(false);
  });

  it("ignores 'enable javascript' boilerplate inside <noscript> on rendered pages", () => {
    // CRA/Next-style pages keep the noscript warning verbatim after rendering —
    // a scrape that returns rendered HTML must not be re-judged as a shell.
    expect(judge(`<html><body><noscript>You need to enable JavaScript to run this app.</noscript>${"<p>content</p>".repeat(60)}<a href="/a">A</a><script src="/a.js"></script></body></html>`)).toBe(false);
  });

  it("strips noscript blocks in one pass even when tags never close", () => {
    // attacker-controlled pages full of unclosed <noscript> openers used to stall the
    // event loop via regex backtracking (each opener rescanned the remaining HTML).
    const hostile = `<html><body>${"<noscript>".repeat(5000)}<p>still here</p></body></html>`;
    expect(stripNoscript(hostile)).toBe(hostile); // unclosed tail kept verbatim
    // unterminated `<noscript ` prefixes (never a `>`) must not rescan the tail either
    const unterminated = `${"<noscript "}${"x".repeat(70)}`.repeat(4000);
    expect(stripNoscript(unterminated)).toBe(unterminated);
    expect(stripNoscript(`a<noscript>x</noscript>b<NOSCRIPT y="1">z</NOSCRIPT>c`)).toBe("abc");
    expect(stripNoscript(`a<noscriptx>b</noscript>`)).toBe(`a<noscriptx>b</noscript>`); // `<noscriptx` isn't the tag; the stray closer stays
    // absurdly long attribute lists still strip — the open match scans no attributes
    expect(stripNoscript(`a<noscript ${"x".repeat(400)}>w</noscript>b`)).toBe("ab");
    // a giant closer tail can't match `[^>]{0,64}`; the bare prefix still closes the block
    expect(stripNoscript(`a<noscript>w</noscript ${"y".repeat(200)}>b`)).toBe(`a ${"y".repeat(200)}>b`);
  });

  it("keeps slices aligned when the page contains characters whose lowercase expands", () => {
    // `İ`.toLowerCase() is two UTF-16 units — positions found on a lowercased copy
    // would shift against the original and eat the next tag's `<`.
    const html = `<p>a</p><noscript>İ enable javascript</noscript><script src="/a.js"></script>`;
    expect(stripNoscript(html)).toBe(`<p>a</p><script src="/a.js"></script>`);
    expect(judge(html)).toBe(true);
  });
});

describe("FirecrawlClient", () => {
  it("no-ops without FIRECRAWL_API_KEY — null/[]/\"\" and never throws", async () => {
    const c = new FirecrawlClient({});
    expect(c.available).toBe(false);
    await expect(c.scrape(URL)).resolves.toBeNull();
    await expect(c.mapLinks(URL, 10)).resolves.toEqual([]);
    await expect(c.interact(URL, [{ type: "click", selector: "#x" }])).resolves.toBeNull();
    await expect(c.fetchHtml(URL)).resolves.toBe("");
  });

  it("scrapes via POST /v1/scrape with Bearer auth and rawHtml+links formats", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // fixture host: skip DNS, fetch is mocked
    const seen: { url?: string; auth?: string; body?: Record<string, unknown> } = {};
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc_test" }, async (input, init) => {
      seen.url = String(input);
      seen.auth = new Headers(init?.headers).get("authorization") ?? undefined;
      seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return okResponse({
        success: true,
        data: { rawHtml: "<html><body>hi</body></html>", links: ["https://site.test/a"], metadata: { statusCode: 200, sourceURL: URL } },
      });
    });
    const scraped = await client.scrape(URL);
    expect(scraped).toMatchObject({ html: "<html><body>hi</body></html>", links: ["https://site.test/a"], statusCode: 200, sourceUrl: URL });
    expect(seen.url).toBe("https://api.firecrawl.dev/v1/scrape");
    expect(seen.auth).toBe("Bearer fc_test");
    expect(seen.body).toMatchObject({ url: URL, formats: ["rawHtml", "links"] });
  });

  it("maps via POST /v1/map honoring the limit", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const seen: { url?: string; body?: Record<string, unknown> } = {};
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc" }, async (input, init) => {
      seen.url = String(input);
      seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return okResponse({ success: true, links: [`${URL}a`, `${URL}b`, 42] });
    });
    expect(await client.mapLinks(URL, 7)).toEqual([`${URL}a`, `${URL}b`]);
    expect(seen.url).toBe("https://api.firecrawl.dev/v1/map");
    expect(seen.body?.limit).toBe(7);
  });

  it("bounds interact replays to FIRECRAWL_MAX_INTERACT_ACTIONS", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const seen: { body?: Record<string, unknown> } = {};
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc" }, async (_input, init) => {
      seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return okResponse({ success: true, data: { rawHtml: "<html/>" } });
    });
    const actions = Array.from({ length: FIRECRAWL_MAX_INTERACT_ACTIONS + 5 }, () => ({ type: "wait" as const, milliseconds: 10 }));
    await client.interact(URL, actions);
    expect((seen.body?.actions as unknown[]).length).toBe(FIRECRAWL_MAX_INTERACT_ACTIONS);
  });

  it("throws on HTTP errors and classifies 402/429 as PROVIDER_QUOTA", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc" }, async () => okResponse({ error: "Payment Required" }, 402));
    await expect(client.scrape(URL)).rejects.toThrow(/402/);
    const quota = await client.scrape(URL).catch((e: unknown) => e);
    expect(classifyError(quota)).toBe("PROVIDER_QUOTA");
  });

  it("throws when the API reports success:false", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc" }, async () => okResponse({ success: false, error: "blocked" }));
    await expect(client.scrape(URL)).rejects.toThrow(/blocked/);
  });

  it("refuses non-public targets via assertPublicUrl", async () => {
    // No REHEARSAL_ALLOW_PRIVATE here: the egress guard must hold.
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc" }, async () => okResponse({ success: true, data: {} }));
    await expect(client.scrape("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/Blocked private IP/);
  });
});

describe("discover fetch-first + firecrawl fallback", () => {
  it("retries a JS shell via firecrawl scrape and maps the rendered page", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const fc = firecrawlStub({ scrape: async () => ({ html: RENDERED, links: [] }) });
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher({ [URL]: SHELL }),
      probeFetcher: fetcher({ [URL]: SHELL }),
      firecrawl: fc.stub,
      runner: runner({}),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop"], maxStates: 3, maxDepth: 1 });
    const done = await orch.discover(exp.id);
    // seed shell retried via scrape; its rendered links get the same rescue attempt
    expect(fc.calls.scrape).toBeGreaterThanOrEqual(1);
    expect(done.graph?.states.length).toBeGreaterThan(0);
    expect(done.graph?.states[0].actions.some((a) => a.label === "Pricing")).toBe(true);
  });

  it("records a readable failure when the firecrawl retry still yields a shell", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const fc = firecrawlStub({ scrape: async () => ({ html: SHELL, links: [] }) });
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher({ [URL]: SHELL }),
      probeFetcher: fetcher({ [URL]: SHELL }),
      firecrawl: fc.stub,
      runner: runner({}),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop"], maxStates: 3 });
    await expect(orch.discover(exp.id)).rejects.toMatchObject({ code: "DISCOVERY_EMPTY" });
    const stored = await orch.get(exp.id);
    expect(stored?.failures.some((f) => f.stage === "discover" && /JS app shell|JS shell/.test(f.message))).toBe(true);
  });

  it("fails plainly without a hosted fallback configured", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher({ [URL]: SHELL }),
      probeFetcher: fetcher({ [URL]: SHELL }),
      firecrawl: new FirecrawlClient({}),
      runner: runner({}),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop"], maxStates: 3 });
    await expect(orch.discover(exp.id)).rejects.toMatchObject({ code: "DISCOVERY_EMPTY" });
    const stored = await orch.get(exp.id);
    const failures = stored?.failures.filter((f) => f.stage === "discover") ?? [];
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].message).toMatch(/no hosted fallback configured/);
  });

  it("expands a sparse seed once via /v1/map, capped by firecrawlMapLimit", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const EMPTY_SEED = `<html><body><h1>One-pager</h1><p>Nothing links anywhere.</p></body></html>`;
    const fc = firecrawlStub({
      mapLinks: async () => [`${URL}a`, `${URL}b`, `${URL}c`, "https://other.test/x"],
    });
    const pages: Record<string, string> = { [URL]: EMPTY_SEED, [`${URL}a`]: PAGE, [`${URL}b`]: PAGE, [`${URL}c`]: PAGE };
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher(pages),
      probeFetcher: fetcher(pages),
      firecrawl: fc.stub,
      runner: runner(pages),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop"], maxStates: 10, maxDepth: 2, firecrawlMapLimit: 2 });
    const done = await orch.discover(exp.id);
    expect(fc.calls.map).toBe(1);
    const urls = done.graph?.states.map((s) => s.url) ?? [];
    expect(urls).toContain(`${URL}a`);
    expect(urls).toContain(`${URL}b`);
    expect(urls).not.toContain(`${URL}c`); // capped at firecrawlMapLimit
    expect(urls).not.toContain("https://other.test/x"); // same-origin only
  });

  it("never calls firecrawl when the seed already links well", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const LINKY = `<html><body>${[1, 2, 3, 4].map((i) => `<a href="/p${i}">p${i}</a>`).join("")}</body></html>`;
    const fc = firecrawlStub({});
    const pages: Record<string, string> = { [URL]: LINKY };
    for (const i of [1, 2, 3, 4]) pages[`${URL}p${i}`] = PAGE;
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher(pages),
      probeFetcher: fetcher(pages),
      firecrawl: fc.stub,
      runner: runner(pages),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop"], maxStates: 6, maxDepth: 1 });
    await orch.discover(exp.id);
    expect(fc.calls.map).toBe(0);
    expect(fc.calls.scrape).toBe(0);
  });

  it("fetches each URL once per run across viewports and the signature pass", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages: Record<string, string> = { [URL]: PAGE, [`${URL}about`]: PAGE.replace(/Alpha/g, "About") };
    const fetched: string[] = [];
    const counting: PageFetcher = {
      name: "counting-fetch",
      async fetchHtml(url) {
        fetched.push(url);
        return fetcher(pages).fetchHtml(url);
      },
    };
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher(pages),
      probeFetcher: counting,
      firecrawl: firecrawlStub({}).stub,
      runner: runner(pages),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop", "mobile"], maxStates: 6, maxDepth: 1 });
    const done = await orch.discover(exp.id);
    expect(done.graph?.states.length).toBe(4);
    expect(done.siteSignatures?.length).toBe(2);
    expect(fetched.sort()).toEqual([URL, `${URL}about`]);
  });

  it("uses the injected runner only when REHEARSAL_BROWSER opts in", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    process.env.REHEARSAL_BROWSER = "playwright";
    const fc = firecrawlStub({});
    const opened: string[] = [];
    const optInRunner: BrowserRunner = {
      name: "optin-runner",
      async openPage(url) {
        opened.push(url);
        return { html: PAGE, screenshotPath: "" };
      },
      async runTrajectory() {
        throw new Error("not used");
      },
      async close() {},
    };
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher({}),
      probeFetcher: fetcher({ [URL]: PAGE }),
      firecrawl: fc.stub,
      runner: optInRunner,
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const exp = await orch.createExperiment(URL, "g", { viewports: ["desktop"], maxStates: 3 });
    await orch.discover(exp.id);
    expect(opened).toContain(URL);
    expect(fc.calls.scrape).toBe(0);
  });
});
