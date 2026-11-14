/**
 * Eval: persona swarm — emergent journeys replace static trajectory sampling.
 * Hermetic: FixtureSiteRunner pages come from the checked-in AIE manifest map;
 * FixtureJevClient + seeded RNG make every byte deterministic.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BrowserRunner, Experiment, ExperimentStore, PersonaJourneyArgs, TrajectoryArgs } from "@/lib/contracts";
import { Experiment as ExperimentSchema, type FixtureSiteManifest } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { FixtureSiteRunner } from "./bench/runner";
import { loadSite } from "./bench/sites";

const AIE_MANIFEST = path.join(__dirname, "fixtures", "aie-code-2026.manifest.json");
const MANIFEST = JSON.parse(readFileSync(AIE_MANIFEST, "utf8")) as FixtureSiteManifest;

const T = {
  maxAgents: 30,
  minDropOffReasons: 1,
  minGoalReached: 1,
  minDropOffs: 1,
  swarmJourneys: 30,
} as const;

function swarmCapableRunner(): BrowserRunner {
  const site = loadSite(MANIFEST);
  const inner = new FixtureSiteRunner(site);
  return {
    name: "fixture-swarm",
    openPage: (url, viewport) => inner.openPage(url, viewport),
    runTrajectory: (a: TrajectoryArgs) => inner.runTrajectory(a),
    runPersonaJourney: (a: PersonaJourneyArgs) => inner.runPersonaJourney(a),
    close: () => inner.close(),
  };
}

function memoryStore() {
  const mem = new Map<string, Experiment>();
  const store: ExperimentStore = {
    name: "memory",
    async save(e) {
      mem.set(e.id, ExperimentSchema.parse(JSON.parse(JSON.stringify(e))));
    },
    async get(id) {
      return mem.get(id) ?? null;
    },
    async list() {
      return [...mem.values()];
    },
    async appendActivity() {},
    async activity() {
      return [];
    },
  };
  return store;
}

describe("eval: persona swarm over the fixture site", () => {
  it("produces emergent journeys with first-class drop-offs, deterministic per seed", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const run = async () => {
      const orch = new Orchestrator({
        runner: swarmCapableRunner(),
        store: memoryStore(),
        jev: new FixtureJevClient(),
        llm: new FixtureLlmClient(),
        fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
      });
      const exp = await orch.createExperiment(`https://bench.local${MANIFEST.mountPath}`, MANIFEST.goal, {
        viewports: ["desktop"],
        maxStates: 5,
        verifyCount: 2,
        maxAgents: T.maxAgents,
        maxStepsPerAgent: 8,
        maxConcurrentAgents: 4,
      });
      await orch.discover(exp.id);
      await orch.simulate(exp.id);
      return (await orch.get(exp.id))!;
    };

    const a = await run();
    const b = await run();

    // swarm persisted on the experiment, journeys emergent and deterministic
    expect(a.swarm).toBeDefined();
    expect(JSON.stringify(a.swarm)).toBe(JSON.stringify(b.swarm));
    expect(a.swarm!.agents).toBe(T.maxAgents);
    expect(a.swarm!.journeys.length).toBe(T.swarmJourneys);

    // persona mix matches what the site offers; every journey has a persona + steps
    expect(Object.values(a.swarm!.personaMix).reduce((x, y) => x + y, 0)).toBe(T.maxAgents);
    for (const j of a.swarm!.journeys) {
      expect(j.persona).toBeDefined();
      expect(j.steps.length).toBeGreaterThan(0);
      if (j.outcome === "dropped-off") expect(j.dropOff?.reason).toBeDefined();
      else expect(j.outcome).toBe("goal-reached");
    }

    // drop-off distribution is first-class and covers the dropped agents
    const dropped = a.swarm!.journeys.filter((j) => j.outcome === "dropped-off").length;
    expect(dropped).toBeGreaterThanOrEqual(T.minDropOffs);
    expect(Object.keys(a.swarm!.dropOffDistribution).length).toBeGreaterThanOrEqual(T.minDropOffReasons);
    expect(Object.values(a.swarm!.dropOffDistribution).reduce((x, y) => x + y, 0)).toBe(dropped);
    expect(a.swarm!.journeys.filter((j) => j.outcome === "goal-reached").length).toBeGreaterThanOrEqual(T.minGoalReached);

    // journeys land in simulations as trajectories (heat/dashboard compat)
    expect(a.simulations.length).toBe(a.swarm!.journeys.length);
    expect(a.simulations.some((t) => t.outcome === "dropped-off")).toBe(true);

    // the whole experiment round-trips through the contract
    expect(ExperimentSchema.parse(JSON.parse(JSON.stringify(a))).swarm?.agents).toBe(T.maxAgents);
  }, 60000);

  it("verify replays most-travelled + most-dropped emergent journeys", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({
      runner: swarmCapableRunner(),
      store: memoryStore(),
      jev: new FixtureJevClient(),
      llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment(`https://bench.local${MANIFEST.mountPath}`, MANIFEST.goal, {
      viewports: ["desktop"],
      maxStates: 5,
      verifyCount: 2,
      maxAgents: T.maxAgents,
      maxStepsPerAgent: 8,
      maxConcurrentAgents: 4,
    });
    await orch.discover(exp.id);
    await orch.simulate(exp.id);
    await orch.verify(exp.id);
    const done = (await orch.get(exp.id))!;
    expect(done.browserTests.length).toBeGreaterThanOrEqual(2);
    // runIds carry the agent ids of the replayed journeys
    expect(done.browserTests.every((r) => /^run_agent-\d+_/.test(r.runId))).toBe(true);
  }, 60000);
});
