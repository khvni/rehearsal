import { describe, expect, it } from "vitest";
import { Experiment, type BrowserRunner, type ExperimentStore } from "@/lib/contracts";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { Orchestrator, StageInProgressError } from "@/lib/orchestrator";

const URL_A = "https://example.com/";
const PAGE = "<html><head><title>Home</title></head><body><h1>Welcome</h1><p>No links here.</p></body></html>";

function setup() {
  const gates: (() => void)[] = [];
  const opened: string[] = [];
  const runner: BrowserRunner = {
    name: "slow-stub",
    async openPage(url) {
      opened.push(url);
      await new Promise<void>((resolve) => gates.push(resolve));
      return { html: PAGE, screenshotPath: "" };
    },
    async runTrajectory(args) {
      return {
        runId: args.runId, viewport: args.viewport, success: true, steps: [],
        assertions: [], errors: [], consoleErrorCount: 0, screenshotPaths: [], durationMs: 0,
      };
    },
    async close() {},
  };
  const mem = new Map<string, Experiment>();
  const store: ExperimentStore = {
    name: "memory",
    async save(e) { mem.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
    async get(id) { return mem.get(id) ?? null; },
    async list() { return [...mem.values()]; },
  };
  const orch = new Orchestrator({
    runner, store, jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
    fetcher: { name: "stub-fetch", fetchHtml: async () => "" },
  });
  const seed = async (id: string) =>
    store.save(Experiment.parse({
      id, targetUrl: URL_A, goal: "read the welcome", status: "created",
      createdAt: "2026-01-01T00:00:00.000Z", configuration: { viewports: ["desktop"], maxStates: 2 },
    }));
  /** Release every page load currently waiting, repeatedly, until `p` settles. */
  const drain = async <T>(p: Promise<T>): Promise<T> => {
    let done = false;
    p.then(() => (done = true), () => (done = true));
    while (!done) {
      gates.splice(0).forEach((g) => g());
      await new Promise((r) => setTimeout(r, 0));
    }
    return p;
  };
  return { orch, opened, seed, drain };
}

describe("orchestrator run lock", () => {
  it("rejects a second concurrent discover() and opens each page once", async () => {
    const { orch, opened, seed, drain } = setup();
    await seed("exp_a");
    const first = orch.discover("exp_a");
    await expect(orch.discover("exp_a")).rejects.toBeInstanceOf(StageInProgressError);
    const exp = await drain(first);
    expect(exp.graph?.states.length).toBe(1);
    expect(opened).toEqual([URL_A]);
  });

  it("blocks every stage (and runAll) while a run is in progress, naming the running stage", async () => {
    const { orch, seed, drain } = setup();
    await seed("exp_a");
    const first = orch.spec("exp_a");
    for (const call of [() => orch.discover("exp_a"), () => orch.simulate("exp_a"), () => orch.runAll("exp_a")]) {
      await expect(call()).rejects.toMatchObject({ name: "StageInProgressError", runningStage: "spec" });
    }
    expect((await drain(first)).status).toBe("complete");
  });

  it("lets different experiments run in parallel", async () => {
    const { orch, opened, seed, drain } = setup();
    await seed("exp_a");
    await seed("exp_b");
    const both = Promise.all([orch.discover("exp_a"), orch.discover("exp_b")]);
    await drain(both);
    expect(opened).toEqual([URL_A, URL_A]);
  });

  it("releases the lock after a run finishes or fails", async () => {
    const { orch, seed, drain } = setup();
    await seed("exp_a");
    await drain(orch.discover("exp_a"));
    await expect(drain(orch.simulate("exp_a"))).resolves.toMatchObject({ id: "exp_a" });
    await expect(orch.discover("exp_late")).rejects.toThrow(/Unknown experiment/);
    await seed("exp_late");
    await expect(drain(orch.discover("exp_late"))).resolves.toMatchObject({ id: "exp_late" });
  });
});
