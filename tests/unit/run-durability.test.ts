import { afterEach, describe, expect, it } from "vitest";
import { Experiment, type BrowserRunner, type ExperimentStore, type PageFetcher } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";

const URL = "https://site.test/";
const HOME = `<html><head><title>Home</title></head><body><h1>Home</h1><a href="/a">A</a> <a href="/b">B</a></body></html>`;
const PAGE_A = `<html><head><title>A</title></head><body><h1>A</h1></body></html>`;
const PAGE_B = `<html><head><title>B</title></head><body><h1>B</h1></body></html>`;

function memoryStore(): ExperimentStore & { all: Map<string, Experiment> } {
  const all = new Map<string, Experiment>();
  return {
    name: "memory",
    all,
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

function runner(pages: Record<string, string>, tick?: () => void): BrowserRunner {
  return {
    name: "fixture-runner",
    async openPage(url) {
      tick?.();
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

async function seededRun(
  orch: Orchestrator,
): Promise<{ id: string; store: ReturnType<typeof memoryStore> }> {
  const { experiment } = await orch.startExperiment(URL, "g");
  const store = memoryStoreRef(orch);
  const stored = store.all.get(experiment.id)!;
  stored.runToken = "tok-1";
  stored.runCheckpoint = { stage: "discover", attempt: 0 };
  await store.save(stored);
  return { id: experiment.id, store };
}

function memoryStoreRef(orch: Orchestrator): ReturnType<typeof memoryStore> {
  return (orch as unknown as { store: ReturnType<typeof memoryStore> }).store;
}

afterEach(() => {
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
  delete process.env.REHEARSAL_BROWSER;
});

describe("chunked runs", () => {
  it("suspends mid-crawl at the step budget and resumes the frontier", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    // The default crawl is plain-fetch-first; opt the ticking stub runner in via REHEARSAL_BROWSER.
    process.env.REHEARSAL_BROWSER = "playwright";
    const pages = { [URL]: HOME, "https://site.test/a": PAGE_A, "https://site.test/b": PAGE_B };
    let t = 0;
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages, () => (t += 30)) });
    const { id } = await seededRun(orch);

    // Budget for ~2 pages of crawl (/, /a) — /b stays queued.
    const afterSlice1 = await orch.runStep(id, { deadlineMs: 50, now: () => t });
    const cp = (await store.get(id))!.runCheckpoint;
    expect(afterSlice1.status).toBe("discovering");
    expect(cp?.stage).toBe("discover");
    expect(cp?.attempt).toBe(1);
    expect(cp?.discover?.frontier.map((f) => f.url)).toEqual(["https://site.test/b"]);
    expect(cp?.discover?.states).toHaveLength(2);
    expect(cp?.discover?.attempted).toContain("https://site.test/a");

    // Resume via the stage entry point: the crawl finishes where it left off — 6 states total (3 urls × 2 viewports), 3 signatures.
    const done = await orch.discover(id);
    const stored = (await store.get(id))!;
    expect(stored.runCheckpoint).toBeUndefined();
    expect(stored.graph?.states).toHaveLength(6);
    expect(stored.siteSignatures).toHaveLength(3);
    expect(done.status).toBe("created");
  });

  it("carries the seed map expansion across a suspended crawl", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    // One link < MIN_SEED_LINKS on the seed — firecrawl /map supplies m1 + m2.
    const ONE_LINK = `<html><head><title>Home</title></head><body><h1>Home</h1><a href="/a">A</a></body></html>`;
    const pages = {
      [URL]: ONE_LINK,
      "https://site.test/a": PAGE_A,
      "https://site.test/m1": `<html><body><h1>M1</h1></body></html>`,
      "https://site.test/m2": `<html><body><h1>M2</h1></body></html>`,
    };
    let t = 0;
    let mapCalls = 0;
    const store = memoryStore();
    const firecrawl = {
      name: "firecrawl-stub",
      available: true,
      async fetchHtml() {
        return "";
      },
      async scrape() {
        return null;
      },
      async mapLinks() {
        mapCalls += 1;
        return ["https://site.test/m1", "https://site.test/m2"];
      },
      async interact() {
        return null;
      },
    };
    const tickFetch: PageFetcher = {
      name: "fixture-fetch",
      async fetchHtml(u) {
        t += 30;
        const html = pages[u as keyof typeof pages];
        if (html === undefined) throw new Error(`fixture 404: ${u}`);
        return html;
      },
    };
    const orch = new Orchestrator({ store, probeFetcher: tickFetch, runner: runner(pages), firecrawl });
    const { id } = await seededRun(orch);

    // Budget for the seed page + its map expansion — /a and the extras stay queued.
    const afterSlice1 = await orch.runStep(id, { deadlineMs: 50, now: () => t });
    const cp = (await store.get(id))!.runCheckpoint;
    expect(afterSlice1.status).toBe("discovering");
    expect(mapCalls).toBe(1);
    expect(cp?.discover?.seedExtras).toEqual(["https://site.test/m1", "https://site.test/m2"]);
    expect(cp?.discover?.mapExpanded).toBe(true);

    const done = await orch.discover(id);
    const stored = (await store.get(id))!;
    // Later viewport passes re-seed from the checkpoint — m1/m2 still crawl, /map never refires.
    expect(mapCalls).toBe(1);
    expect(new Set(stored.graph?.states.map((s) => s.url))).toEqual(
      new Set([URL, "https://site.test/a", "https://site.test/m1", "https://site.test/m2"]),
    );
    expect(stored.graph?.states).toHaveLength(8);
    expect(done.status).toBe("created");
  });

  it("fails STAGE_TIMEOUT after a stage exhausts its slice cap", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = (await store.get(id))!;
    exp.runCheckpoint = { stage: "discover", attempt: 10 };
    await store.save(exp);
    await expect(orch.runStep(id)).rejects.toMatchObject({ code: "STAGE_TIMEOUT" });
  });

  it("resume() re-kicks a stalled in-flight run and ignores live or finished ones", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);

    // Fresh heartbeat (createdAt is now) — not stalled.
    expect((await orch.resume(id)).resumed).toBe(false);

    const stale = (await store.get(id))!;
    stale.createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.save(stale);
    expect((await orch.resume(id)).resumed).toBe(true);
    await new Promise((r) => setTimeout(r, 20));

    const finished = (await store.get(id))!;
    finished.status = "failed";
    finished.runCheckpoint = undefined;
    await store.save(finished);
    expect((await orch.resume(id)).resumed).toBe(false);
  });

  it("resume({ inline }) runs the slice inside the caller's task — a GET watchdog's waitUntil must cover the slice and its hop", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    let calls = 0;
    const base = fetcher(pages);
    const counted: PageFetcher = { name: base.name, fetchHtml: (url, o) => (calls++, base.fetchHtml(url, o)) };
    const orch = new Orchestrator({ store, fetcher: counted, probeFetcher: counted, runner: runner(pages, () => calls++) });
    const { id } = await seededRun(orch);
    const stale = (await store.get(id))!;
    stale.createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.save(stale);

    expect((await orch.resume(id, { inline: true })).resumed).toBe(true);
    expect(calls).toBeGreaterThan(0);
  });

  it("resume() mints a run token for a run queued before tokens existed, so its continuation hop is authorized", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const legacy = (await store.get(id))!;
    legacy.runToken = undefined;
    legacy.runOrigin = undefined;
    legacy.createdAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await store.save(legacy);

    expect((await orch.resume(id, { origin: "https://rehearsal.example.com", inline: true })).resumed).toBe(true);
    const after = (await store.get(id))!;
    expect(after.runToken).toEqual(expect.any(String));
    expect(after.runOrigin).toBe("https://rehearsal.example.com");
  });
});
