import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import { UnavailableRunner } from "@/lib/browser/function-runner";
import { RehearsalError } from "@/lib/errors";
import type { BrowserRunner, Experiment, ExperimentStore, PageFetcher } from "@/lib/contracts";

const URL = "https://site.test/";
const PAGES: Record<string, string> = {
  [URL]: `<html><head><title>Home</title></head><body><h1>Home</h1><p>Welcome to the site, find pricing and contact details here.</p><a href="/pricing">Pricing</a> <a href="/contact">Contact</a></body></html>`,
  "https://site.test/pricing": `<html><head><title>Pricing</title></head><body><h1>Pricing</h1><p>Plans start at $10 per month.</p><a href="/">Home</a></body></html>`,
  "https://site.test/contact": `<html><head><title>Contact</title></head><body><h1>Contact</h1><p>Email us any time.</p><a href="/">Home</a></body></html>`,
};

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

const fetcher: PageFetcher = {
  name: "fixture-fetch",
  async fetchHtml(url) {
    const html = PAGES[url];
    if (html === undefined) throw new Error(`fixture 404: ${url}`);
    return html;
  },
};

function quotaRunner(): BrowserRunner {
  const quota = () => {
    throw new RehearsalError("PROVIDER_QUOTA", "402 Payment Required");
  };
  return { name: "quota-runner", openPage: async () => quota(), runTrajectory: async () => quota(), async close() {} };
}

/** No browser (workerd default) or an exhausted provider must still produce a spec from crawl + simulation. */
describe("run without a browser", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.REHEARSAL_BROWSER;
    delete process.env.REHEARSAL_BROWSER;
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.REHEARSAL_BROWSER;
    else process.env.REHEARSAL_BROWSER = prev;
  });

  it.each([
    ["BROWSER_UNAVAILABLE", () => new UnavailableRunner("No browser can run inside workerd")],
    ["PROVIDER_QUOTA", quotaRunner],
  ])("%s: verify and compare degrade, spec completes", async (code, makeRunner) => {
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher,
      probeFetcher: fetcher,
      runner: makeRunner(),
    });
    const { experiment } = await orch.startExperiment(URL, "find pricing");
    const done = await orch.spec(experiment.id);
    expect(done.status).toBe("complete");
    expect(done.spec?.changes.length).toBeGreaterThan(0);
    expect(done.browserTests).toEqual([]);
    expect(done.comparisons).toEqual([]);
    expect(done.failures.filter((f) => f.stage === "verify").map((f) => f.code)).toEqual([code]);
    expect(done.variants.every((v) => v.status === "proposed")).toBe(true);
    expect(done.errors).toEqual([]);
  });
});
