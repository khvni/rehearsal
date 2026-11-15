import { afterEach, describe, expect, it, vi } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { Experiment, type ExperimentStore, type PageFetcher } from "@/lib/contracts";

afterEach(() => vi.unstubAllEnvs());

describe("rescan trailing-slash pages", () => {
  it("detects a change only to /docs/ when /docs is also discovered", async () => {
    vi.stubEnv("REHEARSAL_ALLOW_PRIVATE", "1");
    vi.stubEnv("REHEARSAL_BROWSER", "auto");
    const root = "https://site.test/";
    const pages: Record<string, string> = {
      [root]: `<html><head><title>Home</title></head><body><h1>Home</h1><a href="/docs">Docs</a><a href="/docs/">Docs directory</a></body></html>`,
      [`${root}docs`]: `<html><head><title>Docs</title></head><body><h1>Docs overview</h1><p>Read our documentation overview.</p></body></html>`,
      [`${root}docs/`]: `<html><head><title>Docs directory</title></head><body><h1>Documentation directory</h1><p>Browse the documentation guides.</p><a href="/">Home</a></body></html>`,
    };
    const fetcher: PageFetcher = {
      name: "fixture-fetch",
      async fetchHtml(url) {
        if (pages[url] === undefined) throw new Error(`fixture 404: ${url}`);
        return pages[url];
      },
    };
    const all = new Map<string, Experiment>();
    const store: ExperimentStore = {
      name: "memory",
      async save(e) { all.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
      async get(id) { return all.get(id) ?? null; },
      async list() { return [...all.values()]; },
      async appendActivity() {},
      async activity() { return []; },
    };
    const orch = new Orchestrator({
      store, fetcher, probeFetcher: fetcher,
      jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
    });
    const { experiment } = await orch.startExperiment(root, "read the docs");
    const discovered = await orch.discover(experiment.id);
    expect(new Set(discovered.graph?.states.map((s) => s.url))).toEqual(new Set(Object.keys(pages)));
    expect((await orch.rescan(experiment.id)).report.changed).toBe(false);

    pages[`${root}docs/`] = pages[`${root}docs/`].replace("Browse the documentation guides.", "New guides are now available.");
    const { report } = await orch.rescan(experiment.id);
    expect(report).toMatchObject({ changed: true, checked: 3, mismatches: [`${root}docs/`] });
  });
});
