import { describe, expect, it } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import { contentSignatureFor, extractPage } from "@/lib/browser/extract";
import { Experiment, type ActivityEvent, type ExperimentStore, type PageFetcher } from "@/lib/contracts";

const URL = "https://site.test/";
const HTML = "<html><body><h1>Pricing</h1><p>Plans start at $10.</p></body></html>";

function setup({ unchanged = false, empty = false, probeFails = false } = {}) {
  let stored = Experiment.parse({
    id: "exp_rescan", targetUrl: URL, goal: "find pricing", status: "failed",
    createdAt: "2026-01-01T00:00:00.000Z", configuration: {},
    errors: empty ? [] : ["old failure"],
    failures: empty ? [] : [{ stage: "run", code: "UNKNOWN", message: "old failure" }],
    siteSignatures: [{ url: URL, signature: unchanged ? contentSignatureFor(URL, extractPage(HTML, URL)) : "old" }],
  });
  const history: ActivityEvent[] = [{ ts: stored.createdAt, stage: "run", kind: "error", message: "Run failed: old failure" }];
  const store: ExperimentStore = {
    name: "memory",
    async save(exp) { stored = Experiment.parse(structuredClone(exp)); },
    async get() { return Experiment.parse(structuredClone(stored)); },
    async list() { return [stored]; },
    async appendActivity(_id, event) { history.push(event); },
    async activity() { return [...history]; },
  };
  const fetcher: PageFetcher = {
    name: "fixture",
    async fetchHtml() {
      if (probeFails) throw new Error("probe unavailable");
      return HTML;
    },
  };
  return { orch: new Orchestrator({ store, fetcher, probeFetcher: fetcher }), store, history };
}

describe("rescan failure reset", () => {
  it.each([false, true])("clears previous failures when restarting (goal-only: %s)", async (goalOnly) => {
    const { orch, store, history } = setup({ unchanged: goalOnly });
    const oldEvent = structuredClone(history[0]);
    const { experiment, report } = await orch.rescan("exp_rescan", goalOnly ? { goal: "contact sales" } : undefined);
    expect(report.restarted).toBe(true);
    expect(experiment.errors).toEqual([]);
    expect(experiment.failures).toEqual([]);
    expect(experiment.status).toBe("queued");
    expect(await store.get(experiment.id)).toEqual(experiment);
    expect(await orch.activity(experiment.id)).toEqual([oldEvent, expect.objectContaining({ stage: "rescan", kind: "info" })]);
  });

  it("keeps empty failure arrays empty on restart", async () => {
    const { orch } = setup({ empty: true });
    const { experiment, report } = await orch.rescan("exp_rescan");
    expect(report.restarted).toBe(true);
    expect(experiment.errors).toEqual([]);
    expect(experiment.failures).toEqual([]);
  });

  it.each([false, true])("preserves failures without a restart (probe fails: %s)", async (probeFails) => {
    const { orch } = setup({ unchanged: true, probeFails });
    const { experiment, report } = await orch.rescan("exp_rescan");
    expect(report.restarted).toBe(false);
    expect(experiment.status).toBe("failed");
    expect(experiment.errors).toEqual(["old failure"]);
    expect(experiment.failures).toEqual([{ stage: "run", code: "UNKNOWN", message: "old failure" }]);
  });
});
