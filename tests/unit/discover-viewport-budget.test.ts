import { beforeEach, describe, expect, it } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import { UnavailableRunner } from "@/lib/browser/function-runner";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { Experiment, type ExperimentConfig, type ExperimentStore, type PageFetcher } from "@/lib/contracts";

const URL = "https://site.test/";
// Six reachable pages: enough for the desktop pass to exhaust a small
// maxStates budget entirely, leaving nothing for the mobile pass.
const PAGES: Record<string, string> = {
  [URL]: `<html><head><title>Home</title></head><body><h1>Home</h1><p>Welcome.</p>
    <a href="/a">A</a> <a href="/b">B</a> <a href="/c">C</a> <a href="/d">D</a> <a href="/e">E</a></body></html>`,
  "https://site.test/a": `<html><body><h1>A</h1><p>Page A.</p><a href="/">Home</a></body></html>`,
  "https://site.test/b": `<html><body><h1>B</h1><p>Page B.</p><a href="/">Home</a></body></html>`,
  "https://site.test/c": `<html><body><h1>C</h1><p>Page C.</p><a href="/">Home</a></body></html>`,
  "https://site.test/d": `<html><body><h1>D</h1><p>Page D.</p><a href="/">Home</a></body></html>`,
  "https://site.test/e": `<html><body><h1>E</h1><p>Page E.</p><a href="/">Home</a></body></html>`,
};

const fetcher: PageFetcher = {
  name: "fixture-fetch",
  async fetchHtml(url) {
    const html = PAGES[url];
    if (html === undefined) throw new Error(`fixture 404: ${url}`);
    return html;
  },
};

function memoryStore(): ExperimentStore {
  const all = new Map<string, Experiment>();
  return {
    name: "memory",
    async save(e) {
      all.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e))));
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

async function runDiscover(config: Partial<ExperimentConfig>) {
  const orch = new Orchestrator({
    store: memoryStore(),
    fetcher,
    probeFetcher: fetcher,
    runner: new UnavailableRunner("no browser"),
    jev: new FixtureJevClient(),
    llm: new FixtureLlmClient(),
  });
  const { experiment } = await orch.startExperiment(URL, "browse the site", config);
  return orch.discover(experiment.id);
}

describe("discover viewport budget", () => {
  beforeEach(() => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  });

  it("reserves page budget so every requested viewport gets crawled", async () => {
    const done = await runDiscover({ maxStates: 4, viewports: ["desktop", "mobile"] });
    const byViewport = new Map<string, number>();
    for (const s of done.graph?.states ?? []) {
      byViewport.set(s.viewport.name, (byViewport.get(s.viewport.name) ?? 0) + 1);
    }
    expect(byViewport.get("mobile") ?? 0).toBeGreaterThan(0);
    expect(byViewport.get("desktop") ?? 0).toBeGreaterThan(0);
    expect(done.graph?.states.length ?? 0).toBeLessThanOrEqual(4);
  });

  it("gives a single requested viewport the whole budget", async () => {
    const done = await runDiscover({ maxStates: 4, viewports: ["desktop"] });
    expect(done.graph?.states.length).toBe(4);
    expect(done.graph?.states.every((s) => s.viewport.name === "desktop")).toBe(true);
  });
});
