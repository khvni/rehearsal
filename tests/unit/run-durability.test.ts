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
});

