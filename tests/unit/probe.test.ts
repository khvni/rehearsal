import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Experiment, VIEWPORTS, VisitorPersona, type ExperimentStore, type SiteState } from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import { makeState } from "@/lib/graph";
import { brandSignalsFromHtml } from "@/lib/rebuild";
import { inferGoalAndPersonas } from "@/lib/intents";
import { Orchestrator } from "@/lib/orchestrator";

const AIE_URL = "https://ai.engineer/code/2026";
const aieHtml = readFileSync(path.join(__dirname, "..", "evals", "fixtures", "aie-code-2026.html"), "utf8");

/** The state the first-page probe would build for a given page. */
function probedState(html = aieHtml, url = AIE_URL): SiteState {
  const page = extractPage(html, url);
  const state = makeState({ url, viewport: VIEWPORTS.desktop, title: page.title, visibleText: page.visibleText, actions: page.actions });
  state.brand = brandSignalsFromHtml(html, url);
  return state;
}

const store: ExperimentStore = {
  name: "memory",
  async save() {},
  async get() { return null; },
  async list() { return []; },
  async appendActivity() {},
  async activity() { return []; },
};

afterEach(() => {
  delete process.env.REHEARSAL_ALLOW_PRIVATE;
});

describe("probe: inferGoalAndPersonas", () => {
  it("derives a goal and personas from the AIE first page", () => {
    const { goal, personas } = inferGoalAndPersonas(probedState());
    // a real CTA/endpoint signal, not the generic fallback
    expect(goal.length).toBeGreaterThan(0);
    expect(goal).not.toMatch(/^Learn what .+ offers$/);
    expect(personas.length).toBeGreaterThanOrEqual(1);
    expect(personas.length).toBeLessThanOrEqual(3);
    // AIE exposes a schedule (information) and an apply CTA (proposal)
    expect(personas.map((p) => p.intent)).toEqual(expect.arrayContaining(["information", "proposal"]));
    for (const p of personas) {
      expect(p.personaId).toMatch(/^per_[0-9a-f]{8}$/);
      expect(p.goal.length).toBeGreaterThan(0);
      expect(p.targetEndpointClasses.length).toBeGreaterThan(0);
      expect(() => VisitorPersona.parse(p)).not.toThrow();
    }
  });

  it("is deterministic across calls on the same page", () => {
    const state = probedState();
    expect(inferGoalAndPersonas(state)).toEqual(inferGoalAndPersonas(state));
  });

  it("falls back to a generic goal and a single info persona on an empty page", () => {
    const state = makeState({ url: "https://empty.test/", viewport: VIEWPORTS.desktop, title: "", visibleText: "", actions: [] });
    const { goal, personas } = inferGoalAndPersonas(state);
    expect(goal).toBe("Learn what empty.test offers");
    expect(personas).toHaveLength(1);
    expect(personas[0].intent).toBe("information");
    expect(personas[0].targetEndpointClasses).toEqual([]);
  });
});

describe("probe: createExperiment wiring (fixture adapters)", () => {
  it("probes the first page and stores goalSource + personas when goal is omitted", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const fetchHtml = vi.fn(async () => aieHtml);
    const orch = new Orchestrator({ store, fetcher: { name: "fixture-fetch", fetchHtml } });
    const exp = await orch.createExperiment(AIE_URL);
    expect(exp.goalSource).toBe("inferred");
    expect(exp.goal.length).toBeGreaterThan(0);
    expect(exp.personas.length).toBeGreaterThanOrEqual(1);
    expect(() => Experiment.parse(JSON.parse(JSON.stringify(exp)))).not.toThrow();
    // the probe hands the fetcher a cancellable signal so a timed-out probe kills the request
    expect(fetchHtml).toHaveBeenCalledWith(AIE_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("never fetches when the caller supplies a goal", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const fetchHtml = vi.fn(async () => aieHtml);
    const orch = new Orchestrator({ store, fetcher: { name: "fixture-fetch", fetchHtml } });
    const exp = await orch.createExperiment(AIE_URL, "  check the schedule  ");
    expect(exp.goal).toBe("check the schedule");
    expect(exp.goalSource).toBe("user");
    expect(exp.personas).toEqual([]);
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("defaults to a hostname goal when the probe fetch fails", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({
      store,
      fetcher: { name: "failing-fetch", fetchHtml: async () => { throw new Error("unreachable"); } },
    });
    const exp = await orch.createExperiment("https://down.test/");
    expect(exp.goalSource).toBe("default");
    expect(exp.goal).toBe("Learn what down.test offers");
    expect(exp.personas).toEqual([]);
  });
});
