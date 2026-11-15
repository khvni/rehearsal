import { beforeEach, describe, expect, it } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { generateSpec } from "@/lib/analysis/spec";
import { RehearsalError } from "@/lib/errors";
import { Experiment, type BrowserRunner, type ExperimentStore, type PageFetcher } from "@/lib/contracts";

const URL = "https://site.test/";
const PAGES: Record<string, string> = {
  [URL]: `<html><head><title>Home</title></head><body><h1>Home</h1><p>Welcome to the site, find pricing and contact details here.</p><a href="/pricing">Pricing</a> <a href="/contact">Contact</a></body></html>`,
  "https://site.test/pricing": `<html><head><title>Pricing</title></head><body><h1>Pricing</h1><p>Plans start at $10 per month.</p><a href="/">Home</a></body></html>`,
  "https://site.test/contact": `<html><head><title>Contact</title></head><body><h1>Contact</h1><p>Email us any time.</p><a href="/">Home</a></body></html>`,
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

/** Replays every action successfully; the baseline fails its assertions so analyze has a verified failure to vary. */
const runner: BrowserRunner = {
  name: "stub-runner",
  async openPage(url) {
    return { html: PAGES[url] ?? "", screenshotPath: "" };
  },
  async runTrajectory(args) {
    return {
      runId: args.runId,
      viewport: args.viewport,
      success: Boolean(args.patches),
      steps: args.actions.map((a) => ({ actionId: a.actionId, label: a.label, ok: true })),
      assertions: args.assertions.map((assertion) => ({ assertion, passed: Boolean(args.patches) })),
      errors: [],
      consoleErrorCount: 0,
      screenshotPaths: [],
      durationMs: 0,
    };
  },
  async close() {},
};

const runIds = (e: Experiment) => e.browserTests.map((r) => r.runId);

describe("stage re-runs replace that stage's earlier results", () => {
  beforeEach(() => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  });

  async function setup() {
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher,
      probeFetcher: fetcher,
      runner,
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const { experiment } = await orch.startExperiment(URL, "find pricing");
    return { orch, id: experiment.id };
  }

  it("re-running verify replaces its browser runs instead of appending duplicates", async () => {
    const { orch, id } = await setup();
    const first = await orch.verify(id);
    expect(first.browserTests.length).toBeGreaterThan(0);
    const again = await orch.verify(id);
    expect(runIds(again)).toEqual(runIds(first));
    expect(new Set(runIds(again)).size).toBe(again.browserTests.length);
  });

  it("re-running compare replaces its variant, variant run and comparison", async () => {
    const { orch, id } = await setup();
    const first = await orch.compare(id);
    expect(first.variants).toHaveLength(1);
    expect(first.comparisons).toHaveLength(1);
    const again = await orch.compare(id);
    expect(again.variants).toHaveLength(1);
    expect(again.comparisons).toHaveLength(1);
    const variantRuns = again.browserTests.filter((r) => r.variantId);
    expect(variantRuns.map((r) => r.variantId)).toEqual([again.variants[0].variantId]);
    expect(again.comparisons[0].variantRunId).toBe(variantRuns[0].runId);
    expect(runIds(again).filter((r) => !r.startsWith("run_variant_"))).toEqual(
      runIds(first).filter((r) => !r.startsWith("run_variant_")),
    );
  });

  it("re-running verify after compare keeps the variant run behind the fresh baseline", async () => {
    const { orch, id } = await setup();
    const compared = await orch.compare(id);
    const again = await orch.verify(id);
    expect(runIds(again)).toEqual(runIds(compared));
    expect(again.browserTests[0].variantId).toBeUndefined();
  });

  it("spec after compare references only baseline browser runs", async () => {
    const { orch, id } = await setup();
    const compared = await orch.compare(id);
    const baselineIds = compared.browserTests.filter((r) => !r.variantId).map((r) => r.runId);
    expect(baselineIds.length).toBeGreaterThan(0);
    expect(compared.browserTests.some((r) => r.variantId)).toBe(true);

    const result = await orch.spec(id);
    expect(result.spec?.baselineRunIds).toEqual(baselineIds);
  });

  it.each(["empty", "variant-only", "llm-error"])("spec baseline references handle %s runs", async (scenario) => {
    const { orch, id } = await setup();
    const compared = await orch.compare(id);
    const browserTests = scenario === "empty" ? [] : scenario === "variant-only"
      ? compared.browserTests.filter((r) => r.variantId)
      : compared.browserTests;
    const llm = scenario === "llm-error" ? {
      name: "unavailable",
      async complete(): Promise<string> { throw new Error("LLM unavailable"); },
    } : new FixtureLlmClient();

    const spec = await generateSpec({ ...compared, browserTests }, llm);
    expect(spec.baselineRunIds).toEqual(browserTests.filter((r) => !r.variantId).map((r) => r.runId));
  });

  it("analyze re-run after verify and compare re-runs counts each baseline run once", async () => {
    const { orch, id } = await setup();
    const analyzed = await orch.analyze(id);
    await orch.compare(id);
    await orch.verify(id);
    const again = await orch.analyze(id);
    expect(again.findings.map((f) => f.title)).toEqual(analyzed.findings.map((f) => f.title));
  });

  it("re-running compare with the variant replay unavailable records one compare failure", async () => {
    const orch = new Orchestrator({
      store: memoryStore(),
      fetcher,
      probeFetcher: fetcher,
      runner: {
        ...runner,
        async runTrajectory(args) {
          if (args.patches) throw new RehearsalError("PROVIDER_QUOTA", "402 Payment Required");
          return runner.runTrajectory(args);
        },
      },
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
    });
    const { experiment } = await orch.startExperiment(URL, "find pricing");
    await orch.compare(experiment.id);
    const again = await orch.compare(experiment.id);
    expect(again.failures.filter((f) => f.stage === "compare").map((f) => f.code)).toEqual(["PROVIDER_QUOTA"]);
    expect(again.variants.map((v) => v.status)).toEqual(["proposed"]);
  });
});
