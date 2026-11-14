import { afterEach, describe, expect, it } from "vitest";
import { contentSignatureFor, normalizeSiteUrl } from "@/lib/browser/extract";
import { classifyError, RehearsalError } from "@/lib/errors";
import { enqueueRun } from "@/lib/access";
import { Orchestrator } from "@/lib/orchestrator";
import type { BrowserRunner, Experiment, ExperimentStore, PageFetcher } from "@/lib/contracts";

const HTML_V1 = `<html><head><title>Alpha</title></head><body><h1>Alpha</h1><p>Hello world</p><a href="/about">About us</a></body></html>`;
const HTML_V2 = `<html><head><title>Alpha</title></head><body><h1>Alpha</h1><p>Hello world — now with more</p><a href="/about">About us</a></body></html>`;
const URL = "https://site.test/";

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

function runner(pages: Record<string, string>, failWith?: unknown): BrowserRunner {
  return {
    name: "fixture-runner",
    async openPage(url) {
      if (failWith) throw failWith;
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

afterEach(() => {
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
  delete process.env.REHEARSAL_MAX_CONCURRENT_RUNS;
});

describe("normalizeSiteUrl", () => {
  it.each([
    ["https://EXAMPLE.com/", "https://example.com"],
    ["https://example.com", "https://example.com"],
    ["https://example.com/#section", "https://example.com"],
    ["https://example.com/?utm_source=x&utm_medium=y", "https://example.com"],
    ["https://example.com/?gclid=abc", "https://example.com"],
    ["https://example.com/a/", "https://example.com/a"],
    ["https://example.com/a/?utm_campaign=q", "https://example.com/a"],
  ])("normalizes %s → %s", (raw, expected) => {
    expect(normalizeSiteUrl(raw)).toBe(expected);
  });

  it("keeps real query params and treats different paths as different keys", () => {
    expect(normalizeSiteUrl("https://example.com/?page=2")).toBe("https://example.com/?page=2");
    expect(normalizeSiteUrl("https://example.com/a")).not.toBe(normalizeSiteUrl("https://example.com/b"));
  });
});

describe("contentSignatureFor", () => {
  const page = { title: "T", visibleText: "body text", actions: [{ label: "B", role: "link" }] };
  it("is stable for identical content and different for changed content", () => {
    const a = contentSignatureFor("https://x.test/", page);
    expect(a).toBe(contentSignatureFor("https://x.test/", page));
    expect(a).not.toBe(contentSignatureFor("https://x.test/", { ...page, visibleText: "body text!" }));
    expect(a).not.toBe(contentSignatureFor("https://x.test/", { ...page, actions: [{ label: "C" }] }));
  });
});

describe("classifyError: PROVIDER_QUOTA", () => {
  it.each([
    "Browserbase Function API 402 on /v1/functions/x/invoke: Payment Required",
    "Fetch failed 429 for https://x.test/",
    "quota exceeded for this plan",
    "insufficient credits",
  ])("classifies %s as PROVIDER_QUOTA", (message) => {
    expect(classifyError(new Error(message))).toBe("PROVIDER_QUOTA");
  });

  it("leaves generic failures alone", () => {
    expect(classifyError(new Error("something broke"))).toBe("UNKNOWN");
  });
});

describe("startExperiment dedupe", () => {
  it("returns the existing experiment for a repeat idempotency key", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({ store: memoryStore(), fetcher: fetcher({ [URL]: HTML_V1 }) });
    const first = await orch.startExperiment(URL, "g", undefined, { idempotencyKey: "k-1" });
    const second = await orch.startExperiment(URL, "g", undefined, { idempotencyKey: "k-1" });
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, via: "idempotency" });
    expect(second.experiment.id).toBe(first.experiment.id);
  });

  it("dedupes the normalized site (utm/hash/case/trailing slash) even without a key", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({ store: memoryStore(), fetcher: fetcher({ [URL]: HTML_V1 }) });
    const first = await orch.startExperiment("https://site.test/?utm_source=a#frag", "g");
    const second = await orch.startExperiment("https://SITE.test/", "g");
    expect(second).toMatchObject({ created: false, via: "site" });
    expect(second.experiment.id).toBe(first.experiment.id);
    // a different path is a different site key — a new experiment is created
    const other = await orch.startExperiment("https://site.test/pricing", "g");
    expect(other.created).toBe(true);
    expect(other.experiment.id).not.toBe(first.experiment.id);
  });
});

describe("discover quota fallback", () => {
  it("falls back to the fetcher once the runner reports provider quota", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: fetcher({ [URL]: HTML_V1 }),
      runner: runner({ [URL]: HTML_V1 }, new RehearsalError("PROVIDER_QUOTA", "402 Payment Required")),
    });
    const exp = await orch.startExperiment(URL, "g").then((r) => r.experiment);
    const done = await orch.discover(exp.id);
    expect(done.graph?.states.length).toBeGreaterThan(0);
    expect(done.siteSignatures.length).toBeGreaterThan(0);
    const feed = (done.siteSignatures ?? []).map((s) => s.url);
    expect(feed).toContain(URL);
  });

  it("fails the stage with PROVIDER_QUOTA when both runner and fetcher are blocked", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const quota = new RehearsalError("PROVIDER_QUOTA", "429 too many requests");
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher: {
        name: "quota-fetch",
        async fetchHtml() {
          throw new Error("Browserbase fetch failed: 429");
        },
      },
      runner: runner({ [URL]: HTML_V1 }, quota),
    });
    const exp = await orch.startExperiment(URL, "g").then((r) => r.experiment);
    await expect(orch.discover(exp.id)).rejects.toMatchObject({ code: "PROVIDER_QUOTA" });
    const stored = await orch.get(exp.id);
    expect(stored?.failures.some((f) => f.code === "PROVIDER_QUOTA")).toBe(true);
  });
});

describe("rescan", () => {
  async function discovered(fetcherPages: Record<string, string>) {
    const store = memoryStore();
    const orch = new Orchestrator({
      store,
      fetcher: fetcher(fetcherPages),
      runner: runner(fetcherPages),
    });
    const exp = await orch.startExperiment(URL, "g").then((r) => r.experiment);
    await orch.discover(exp.id);
    return { orch, exp };
  }

  it("reports unchanged when the probed pages still match", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const { orch, exp } = await discovered({ [URL]: HTML_V1 });
    const { experiment, report } = await orch.rescan(exp.id);
    expect(report).toMatchObject({ changed: false, restarted: false, goalChanged: false });
    expect(report.checked).toBeGreaterThan(0);
    expect(experiment.graph).toBeDefined();
  });

  it("resets derived artifacts and marks for re-run when content changed", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const pages: Record<string, string> = { [URL]: HTML_V1 };
    const store = memoryStore();
    const orch = new Orchestrator({ store, fetcher: fetcher(pages), runner: runner(pages) });
    const exp = await orch.startExperiment(URL, "g").then((r) => r.experiment);
    await orch.discover(exp.id);
    pages[URL] = HTML_V2;
    const { experiment, report } = await orch.rescan(exp.id);
    expect(report).toMatchObject({ changed: true, restarted: true });
    expect(report.mismatches).toContain(URL);
    expect(experiment.graph).toBeUndefined();
    expect(experiment.siteSignatures).toEqual([]);
    expect(experiment.status).toBe("queued");
  });

  it("regenerates on a new goal while keeping the graph (skipDiscover)", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const { orch, exp } = await discovered({ [URL]: HTML_V1 });
    const { experiment, report } = await orch.rescan(exp.id, { goal: "find pricing" });
    expect(report).toMatchObject({ changed: false, restarted: true, goalChanged: true });
    expect(experiment.goal).toBe("find pricing");
    expect(experiment.goalSource).toBe("user");
    expect(experiment.graph).toBeDefined();
    expect(experiment.siteSignatures.length).toBeGreaterThan(0);
  });
});

describe("enqueueRun", () => {
  it("waits for a free slot instead of dropping work", async () => {
    process.env.REHEARSAL_MAX_CONCURRENT_RUNS = "1";
    const order: string[] = [];
    const first = enqueueRun(async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("a-end");
    }, 5);
    const second = enqueueRun(async () => {
      order.push("b");
    }, 5);
    await Promise.all([first, second]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
  });
});
