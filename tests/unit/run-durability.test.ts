import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSlotTtlMs, withRunSlot } from "@/lib/access";
import { Experiment, type ActivityEvent, type BrowserRunner, type ExperimentStore, type PageFetcher } from "@/lib/contracts";
import { DISCOVER_CHECKPOINT_MS, DISCOVER_CHECKPOINT_PAGES, Orchestrator } from "@/lib/orchestrator";

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.REHEARSAL_MAX_CONCURRENT_RUNS;
  delete process.env.REHEARSAL_RUN_SLOT_TTL_MS;
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
  delete process.env.REHEARSAL_BROWSER;
});

describe("chunked runs", () => {
  beforeEach(() => { process.env.REHEARSAL_ALLOW_PRIVATE = "1"; });
  it.each(["discover", "simulate", "verify", "analyze", "compare", "spec"] as const)("discards a finished pipeline's stale %s checkpoint without resuming", async (stage) => {
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.spec = { targetUrl: URL, goal: "g", generatedAt: exp.createdAt, baselineRunIds: [], summary: "", changes: [], rebuildPhases: [] };
    exp.runCheckpoint = { stage, attempt: 4 };
    exp.status = "complete";
    exp.createdAt = "2020-01-01T00:00:00.000Z";
    const internal = orch as unknown as { stepBody: () => Promise<void> };
    const work = vi.spyOn(internal, "stepBody");
    expect((await orch.resume(id, { inline: true })).resumed).toBe(false);
    expect(store.all.get(id)!.runCheckpoint).toBeUndefined();
    const persisted = store.all.get(id)!;
    persisted.runCheckpoint = { stage, attempt: 4 };
    await store.save(persisted);
    await orch.runStep(id);
    expect(store.all.get(id)!.runCheckpoint).toBeUndefined();
    expect(work).not.toHaveBeenCalled();
  });

  it("preserves a rebuild checkpoint and resumes it even when spec exists", async () => {
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.spec = { targetUrl: URL, goal: "g", generatedAt: exp.createdAt, baselineRunIds: [], summary: "", changes: [], rebuildPhases: [] };
    exp.runCheckpoint = { stage: "rebuild", attempt: 1 };
    exp.createdAt = "2020-01-01T00:00:00.000Z";
    const work = vi.spyOn(orch as unknown as { stepBody: () => Promise<void> }, "stepBody").mockResolvedValue();
    expect((await orch.resume(id, { inline: true })).resumed).toBe(true);
    expect(work).toHaveBeenCalledOnce();
    expect(exp.runCheckpoint?.stage).toBe("rebuild");
  });

  it.each(["resume", "runStep"] as const)("%s finishes an interrupted spec stage even when the spec was already saved", async (entry) => {
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.spec = { targetUrl: URL, goal: "g", generatedAt: exp.createdAt, baselineRunIds: [], summary: "saved spec", changes: [], rebuildPhases: [] };
    exp.status = "comparing";
    exp.runCheckpoint = { stage: "spec", attempt: 2 };
    exp.createdAt = "2020-01-01T00:00:00.000Z";
    const internal = orch as unknown as { runSpec: (id: string) => Promise<Experiment>; runCompare: () => Promise<void> };
    vi.spyOn(internal, "runCompare").mockResolvedValue();
    const spec = vi.spyOn(internal, "runSpec");
    if (entry === "resume") expect((await orch.resume(id, { inline: true })).resumed).toBe(true);
    else await orch.runStep(id);
    expect(spec).toHaveBeenCalledOnce();
    const done = store.all.get(id)!;
    expect(done.status).toBe("complete");
    expect(done.spec?.summary).toBe("saved spec");
    expect(done.mockup).toBeDefined();
    expect(done.runCheckpoint).toBeUndefined();
  });

  it("recovers a stalled opt-in rebuild with no site from a stale spec checkpoint", async () => {
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.spec = { targetUrl: URL, goal: "g", generatedAt: exp.createdAt, baselineRunIds: [], summary: "", changes: [], rebuildPhases: [] };
    exp.status = "rebuilding";
    exp.runCheckpoint = { stage: "spec", attempt: 4 };
    exp.createdAt = "2020-01-01T00:00:00.000Z";
    const work = vi.spyOn(orch as unknown as { stepBody: () => Promise<void> }, "stepBody").mockResolvedValue();
    expect((await orch.resume(id, { inline: true })).resumed).toBe(true);
    expect(exp.runCheckpoint).toEqual({ stage: "rebuild", attempt: 0 });
    expect(work).toHaveBeenCalledOnce();
  });

  it("does not resume a locally locked experiment or consume a slot while a queued run waits for its lock", async () => {
    vi.useFakeTimers();
    process.env.REHEARSAL_MAX_CONCURRENT_RUNS = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    store.all.get(id)!.createdAt = "2020-01-01T00:00:00.000Z";
    const internal = orch as unknown as { exclusive: (id: string, stage: string, fn: () => Promise<void>) => Promise<void>; stepBody: () => Promise<void> };
    let release!: () => void;
    const held = internal.exclusive(id, "rebuild", () => new Promise<void>((r) => { release = r; }));
    const work = vi.spyOn(internal, "stepBody").mockResolvedValue();
    expect((await orch.resume(id, { inline: true })).resumed).toBe(false);
    await orch.scheduleRun(id);
    expect(await withRunSlot(async () => "free")).toEqual({ busy: false, value: "free" });
    expect(work).not.toHaveBeenCalled();
    release();
    await held;
    await vi.advanceTimersByTimeAsync(2000);
    expect(work).toHaveBeenCalledOnce();
  });

  it("expires abandoned experiment locks for both exclusive and resume without releasing a newer lock", async () => {
    vi.useFakeTimers();
    process.env.REHEARSAL_RUN_SLOT_TTL_MS = "1000";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    store.all.get(id)!.createdAt = "2020-01-01T00:00:00.000Z";
    const internal = orch as unknown as { exclusive: (id: string, stage: string, fn: () => Promise<void>) => Promise<void>; stepBody: () => Promise<void> };
    const renewal = vi.spyOn(globalThis, "setInterval").mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>);
    let oldRelease!: () => void;
    const old = internal.exclusive(id, "rebuild", () => new Promise<void>((r) => { oldRelease = r; }));
    expect((await orch.resume(id, { inline: true })).resumed).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    let newRelease!: () => void;
    const next = internal.exclusive(id, "spec", () => new Promise<void>((r) => { newRelease = r; }));
    oldRelease();
    await old;
    await expect(internal.exclusive(id, "run", async () => {})).rejects.toMatchObject({ runningStage: "spec" });
    expect((await orch.resume(id, { inline: true })).resumed).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    renewal.mockRestore();
    const work = vi.spyOn(internal, "stepBody").mockResolvedValue();
    expect((await orch.resume(id, { inline: true })).resumed).toBe(true);
    expect(work).toHaveBeenCalledOnce();
    newRelease();
    await next;
  });

  it("persists spec completion without a checkpoint before the slice finishes", async () => {
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    store.all.get(id)!.runCheckpoint = { stage: "spec", attempt: 0 };
    vi.spyOn(orch as unknown as { runCompare: () => Promise<void> }, "runCompare").mockResolvedValue();
    const save = vi.spyOn(store, "save");
    await orch.runStep(id);
    expect(save.mock.calls.some(([e]) => e.spec && e.status === "complete" && !e.runCheckpoint)).toBe(true);
  });
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

  /** Home linking to /p1../p7 — 8 urls × 2 viewports = 16 crawled pages, more than one checkpoint batch. */
  const WIDE_PAGES: Record<string, string> = {
    [URL]: `<html><head><title>Home</title></head><body><h1>Home</h1>${[1, 2, 3, 4, 5, 6, 7]
      .map((n) => `<a href="/p${n}">P${n}</a>`)
      .join(" ")}</body></html>`,
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((n) => [`https://site.test/p${n}`, `<html><head><title>P${n}</title></head><body><h1>P${n}</h1></body></html>`]),
    ),
  };

  /** Crawls until `killAfter` pages have opened, then hangs the next open forever — a slice the runtime killed mid-crawl. */
  async function killedCrawl(killAfter: number, tick?: () => void) {
    let opened = 0;
    let killed!: () => void;
    const hung = new Promise<void>((r) => (killed = r));
    const dying: BrowserRunner = {
      ...runner(WIDE_PAGES),
      async openPage(url) {
        if (opened === killAfter) {
          killed();
          return new Promise(() => {});
        }
        opened += 1;
        tick?.();
        return { html: WIDE_PAGES[url] };
      },
    };
    const store = memoryStore();
    const first = new Orchestrator({ store, fetcher: fetcher(WIDE_PAGES), probeFetcher: fetcher(WIDE_PAGES), runner: dying });
    const { id } = await seededRun(first);
    void first.discover(id);
    await hung;
    return { id, store };
  }

  it("a crawl killed mid-discover resumes from its last checkpoint, redoing fewer than one batch of pages", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    process.env.REHEARSAL_BROWSER = "playwright";
    const total = 16;
    for (let killAfter = 1; killAfter < total; killAfter++) {
      const { id, store } = await killedCrawl(killAfter);
      const saved = (await store.get(id))!.runCheckpoint?.discover?.states.length ?? 0;
      expect(killAfter - saved).toBeGreaterThanOrEqual(0);
      expect(killAfter - saved).toBeLessThan(DISCOVER_CHECKPOINT_PAGES);

      // A fresh process picks the run up from the store: only pages past the checkpoint are re-opened.
      let reopened = 0;
      const second = new Orchestrator({
        store,
        fetcher: fetcher(WIDE_PAGES),
        probeFetcher: fetcher(WIDE_PAGES),
        runner: runner(WIDE_PAGES, () => reopened++),
      });
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + runSlotTtlMs());
      try {
        await second.discover(id);
      } finally {
        clock.mockRestore();
      }
      const stored = (await store.get(id))!;
      expect(reopened).toBe(total - saved);
      expect(stored.runCheckpoint).toBeUndefined();
      expect(stored.graph?.states).toHaveLength(total);
      expect(stored.siteSignatures).toHaveLength(8);
    }
  });

  it("checkpoints slow crawls on elapsed time before a full page batch", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    process.env.REHEARSAL_BROWSER = "playwright";
    let t = 0;
    const realNow = Date.now;
    Date.now = () => t;
    try {
      // Each page takes half the time cap — every second page is saved, well before a full batch.
      const { id, store } = await killedCrawl(3, () => (t += DISCOVER_CHECKPOINT_MS / 2));
      expect((await store.get(id))!.runCheckpoint?.discover?.states).toHaveLength(2);
    } finally {
      Date.now = realNow;
    }
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

  it("suspends analyze at the step budget and resumes finished sub-steps without re-calling the model", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.failures = [{ code: "BROWSER_UNAVAILABLE", stage: "verify", message: "skip" }];
    exp.runCheckpoint = { stage: "analyze", attempt: 0 };
    // The slice is too small for even one batch call — nothing launches, the
    // slice suspends cleanly instead of dying mid-await.
    let t = 0;
    const now = () => t;
    const llm = (orch as unknown as { llm: { complete: (p: string, o?: unknown) => Promise<string> } }).llm;
    const budgets: (number | undefined)[] = [];
    const llmSpy = vi.spyOn(llm, "complete").mockImplementation(async (_p, o) => {
      if (String(_p).startsWith("You are a UX auditor"))
        budgets.push((o as { timeoutMs?: number } | undefined)?.timeoutMs);
      t += 200;
      return "{}";
    });
    await orch.runStep(id, { deadlineMs: 100, now });
    expect(llmSpy).not.toHaveBeenCalled();
    const cp = store.all.get(id)!.runCheckpoint;
    expect(cp?.stage).toBe("analyze");
    expect(cp?.analyze?.llmFindings).toEqual([]);
    expect(cp?.analyze?.llmFindingsBatches).toBe(0);
    expect(cp?.analyze?.endpointFindings).toBeUndefined();
    // A wider slice runs the batch, bounded to what it has left (minus the save
    // margin). Calls from stages re-entered without a deadline (e.g. compare's
    // internal analyze) carry no bound — every bounded call fits the slice.
    t = 0;
    const res = await orch.runStep(id, { deadlineMs: 10_000, now });
    const bounded = budgets.filter((b): b is number => b !== undefined);
    expect(bounded.length).toBeGreaterThan(0);
    for (const b of bounded) expect(b).toBeLessThan(10_000);
    expect(res.status === "created" || res.status === "complete").toBe(true);
    expect(res.findings).toBeDefined();
  });

  it("accumulates llmFindings per page batch across slices — an mtc.so-sized graph finishes within the slice cap", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.failures = [{ code: "BROWSER_UNAVAILABLE", stage: "verify", message: "skip" }];
    exp.runCheckpoint = { stage: "analyze", attempt: 0 };
    // A multi-page graph like mtc.so's crawl: 12 states → 3 batches of 5.
    const { makeState } = await import("@/lib/graph");
    const vp = { name: "desktop" as const, width: 1440, height: 900 };
    exp.graph = {
      states: Array.from({ length: 12 }, (_, i) =>
        makeState({
          url: `${URL}p${i}`,
          viewport: vp,
          title: `Page ${i}`,
          visibleText: `Page ${i} content with some text to audit.`,
          actions: [{ label: `Go ${i}`, role: "link", href: `${URL}p${i}`, type: "click" as const, enabled: true, safeToExecute: true }],
        }),
      ),
      edges: [],
    };
    await store.save(exp);
    // Each model call consumes nearly the whole slice: one batch per slice.
    let t = 0;
    const now = () => t;
    const llm = (orch as unknown as { llm: { complete: (p: string, o?: unknown) => Promise<string> } }).llm;
    let calls = 0;
    vi.spyOn(llm, "complete").mockImplementation(async (_p) => {
      if (String(_p).startsWith("You are a UX auditor")) calls++;
      t += 8_000;
      return JSON.stringify({ findings: [{ title: `Issue batch ${calls}`, category: "clarity", severity: "medium", evidenceType: "hypothesis", description: "d", recommendation: "r", principle: "dont-make-users-think" }] });
    });
    let slices = 0;
    for (;;) {
      slices++;
      const res = await orch.runStep(id, { deadlineMs: 10_000, now });
      if (res.status === "created" || res.status === "complete") break;
      expect(slices).toBeLessThanOrEqual(10);
    }
    const done = store.all.get(id)!;
    expect(done.status).toBe("created");
    // Three batches → three accumulated real findings, plus deterministic rule findings.
    expect(done.findings.filter((f) => f.title.startsWith("Issue batch")).length).toBe(3);
    expect(calls).toBe(3);
  });

  it("builds the spec mockup across slices — a slice-filling spec call can't starve page generation into early exhaustion", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.runCheckpoint = { stage: "spec", attempt: 0 };
    exp.errors = ["[STAGE_TIMEOUT] Stage spec did not finish within 10 run steps — the runtime's step budget is too small for it"];
    exp.findings = [{
      findingId: "f1", title: "Cut needless words", category: "copy-economy",
      severity: "medium", evidenceType: "hypothesis", description: "d",
      affectedStates: ["st_1"], affectedActions: [], evidencePaths: [],
      recommendation: "r", verificationStatus: "unverified",
      principle: "cut-needless-words",
    }];
    exp.comparisons = [{
      baselineRunId: "b1", variantRunId: "v1",
      deltas: {
        goalCompleted: { baseline: true, variant: true },
        interactionCount: { baseline: 1, variant: 1 },
        backtracks: { baseline: 0, variant: 0 },
        failedInteractions: { baseline: 0, variant: 0 },
        runtimeErrors: { baseline: 0, variant: 0 },
        findingReproduces: true,
      },
    }];
    const { makeState } = await import("@/lib/graph");
    const vp = { name: "desktop" as const, width: 1440, height: 900 };
    exp.graph = {
      states: Array.from({ length: 6 }, (_, i) =>
        makeState({
          url: `${URL}p${i}`,
          viewport: vp,
          title: `Page ${i}`,
          visibleText: `Page ${i} content with some text to audit.`,
          actions: [{ label: `Go ${i}`, role: "link", href: `${URL}p${i}`, type: "click" as const, enabled: true, safeToExecute: true }],
        }),
      ),
      edges: [],
    };
    await store.save(exp);
    // Every model call fills most of a slice: spec writes once (bounded), then
    // each mockup page lands one-per-slice without early exhaustion wiping it.
    let t = 0;
    const now = () => t;
    const llm = (orch as unknown as { llm: { complete: (p: string, o?: unknown) => Promise<string> } }).llm;
    const llmSpy = vi.spyOn(llm, "complete").mockImplementation(async (p, o) => {
      if (String(p).startsWith("You are writing a rebuild spec"))
        expect((o as { timeoutMs?: number } | undefined)?.timeoutMs).toBeLessThan(10_000);
      t += 8_000;
      return JSON.stringify({ html: "<html><body>page</body></html>", title: "t" });
    });
    let slices = 0;
    for (;;) {
      slices++;
      const res = await orch.runStep(id, { deadlineMs: 10_000, now });
      if (res.status === "complete") break;
      expect(slices).toBeLessThanOrEqual(10);
    }
    const done = store.all.get(id)!;
    expect(done.status).toBe("complete");
    expect(done.spec).toBeDefined();
    expect(done.mockup?.pages.length).toBeGreaterThan(0);
    // A finished stage clears stale errors naming it.
    expect(done.errors.filter((m) => /Stage spec\b/.test(m))).toEqual([]);
    expect(llmSpy).toHaveBeenCalled();
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

  it("resume() drains a queued-stage checkpoint on a finished run instead of discarding it", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages = { [URL]: HOME };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const { id } = await seededRun(orch);
    const exp = store.all.get(id)!;
    exp.spec = { targetUrl: URL, goal: "g", generatedAt: exp.createdAt, baselineRunIds: [], summary: "", changes: [], rebuildPhases: [] };
    exp.status = "complete";
    exp.createdAt = "2020-01-01T00:00:00.000Z";
    exp.failures = [{ code: "BROWSER_UNAVAILABLE", stage: "verify", message: "skip" }];
    // enqueueStage's breadcrumb: a stage click on an idle/finished run leaves a
    // queued checkpoint so the watchdog drains the recorded request.
    exp.runCheckpoint = { stage: "analyze", attempt: 1, queued: true };
    const feed: ActivityEvent[] = [
      { ts: exp.createdAt, stage: "run", kind: "queued", message: "analyze" },
    ];
    vi.spyOn(store, "appendActivity").mockImplementation(async (_id, e) => { feed.push(e); });
    vi.spyOn(store, "activity").mockImplementation(async () => feed);
    const work = vi.spyOn(orch as unknown as { stepBody: () => Promise<void> }, "stepBody");
    expect((await orch.resume(id, { inline: true })).resumed).toBe(true);
    expect(work).toHaveBeenCalledOnce();
    expect(feed.some((e) => e.kind === "queued-start" && e.message === "analyze")).toBe(true);
    const stored = (await store.get(id))!;
    expect(stored.runCheckpoint?.queued).toBeUndefined();
  });
});
