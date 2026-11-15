import { describe, expect, it } from "vitest";
import type {
  AgentJourney,
  Assertion,
  AssertionProbe,
  BrowserRunner,
  BrowserRun,
  Endpoint,
  ExperimentConfig,
  OpenPageResult,
  PersonaDriver,
  PersonaJourneyArgs,
} from "@/lib/contracts";
import { Experiment, ExperimentConfig as Config, VIEWPORTS } from "@/lib/contracts";
import { personaJourneyLoop } from "@/lib/simulation/persona";
import { extractPage } from "@/lib/browser/extract";
import { journeysToTrajectories, personaWeights, runPersonaSwarm, selectJourneys } from "@/lib/simulation/swarm";
import { FixtureJevClient, withDecideCache } from "@/lib/decisions/jev";

const CONFIG: ExperimentConfig = Config.parse({
  maxAgents: 24,
  maxStepsPerAgent: 8,
  maxConcurrentAgents: 4,
  viewports: ["desktop"],
  trajectories: 50,
  verifyCount: 2,
});

const PAGES: Record<string, { title: string; text: string; links: [string, string][]; buttons: string[] }> = {
  "/": {
    title: "AIE Code 2026",
    text: "AI Engineer Code Summit November 10-12 San Francisco. Talks, workshops, schedule, pricing.",
    links: [
      ["Schedule", "/schedule"],
      ["Pricing", "/pricing"],
      ["Apply", "/apply"],
      ["Blog", "/blog"],
    ],
    buttons: ["Get tickets"],
  },
  "/schedule": {
    title: "Schedule",
    text: "Conference schedule. Wednesday November 11 talks and workshops.",
    links: [["Home", "/"], ["Speakers", "/speakers"]],
    buttons: [],
  },
  "/pricing": { title: "Pricing", text: "Tickets $499 early bird.", links: [["Home", "/"]], buttons: ["Buy now"] },
  "/apply": { title: "Apply", text: "Apply to attend.", links: [["Home", "/"]], buttons: [] },
  "/blog": { title: "Blog", text: "News and updates.", links: [["Home", "/"]], buttons: [] },
  "/speakers": { title: "Speakers", text: "Speaker lineup.", links: [["Schedule", "/schedule"]], buttons: [] },
};

function htmlFor(pathname: string): string | null {
  const p = PAGES[pathname];
  if (!p) return null;
  const links = p.links.map(([l, h]) => `<a href="${h}">${l}</a>`).join("");
  const buttons = p.buttons.map((b) => `<button>${b}</button>`).join("");
  return `<html><head><title>${p.title}</title></head><body><h1>${p.title}</h1><p>${p.text}</p>${links}${buttons}</body></html>`;
}

function fixtureDriver(initial: string): { driver: PersonaDriver; snapCalls: number } {
  let current = initial;
  const state = { snapCalls: 0 };
  const extract = (url: string) => extractPage(htmlFor(new URL(url).pathname) ?? "", url);
  const driver: PersonaDriver = {
    snapshot: async () => {
      state.snapCalls++;
      const html = htmlFor(new URL(current).pathname);
      if (html === null) return { url: current, title: current, visibleText: "", actions: [], candidates: [] };
      const ex = extract(current);
      return {
        url: current,
        title: ex.title,
        visibleText: ex.visibleText,
        actions: ex.actions.map((a) => ({ label: a.label, role: a.role })),
        candidates: ex.actions
          .map((a, i) => ({ a, actionId: `act_${i}` }))
          .filter(({ a }) => a.enabled && a.safeToExecute)
          .map(({ a, actionId }) => ({ actionId, label: a.label, href: a.href, role: a.role })),
      };
    },
    act: async (action) => {
      if (!action.href) return { ok: true };
      if (htmlFor(new URL(action.href).pathname) === null) return { ok: false, error: "no page" };
      current = action.href;
      return { ok: true };
    },
    probe: (): AssertionProbe => {
      const ex = extract(current);
      return {
        bodyText: async () => ex.visibleText,
        isVisible: async () => false,
        count: async () => 0,
        title: async () => ex.title,
        url: async () => current,
      };
    },
    screenshot: async () => null,
  };
  return { driver, snapCalls: 0 };
}

function mockRunner(opts?: { delay?: number; failEvery?: number; onStart?: () => void; useArgsJev?: boolean }) {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const runner: BrowserRunner & { stats: { maxActive: number; calls: number } } = {
    name: "mock-swarm",
    stats: { maxActive, calls },
    async openPage(): Promise<OpenPageResult> {
      return { html: "" };
    },
    async runTrajectory(): Promise<BrowserRun> {
      throw new Error("unused");
    },
    async runPersonaJourney(a: PersonaJourneyArgs): Promise<AgentJourney> {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      opts?.onStart?.();
      if (opts?.delay) await new Promise((r) => setTimeout(r, opts.delay));
      try {
        if (opts?.failEvery && calls % opts.failEvery === 0) throw new Error("runner exploded");
        const { driver } = fixtureDriver(a.url);
        const jev = opts?.useArgsJev && a.jev ? a.jev : new FixtureJevClient();
        return await personaJourneyLoop(driver, jev, a);
      } finally {
        active--;
      }
    },
    async close() {},
  };
  Object.defineProperty(runner.stats, "maxActive", { get: () => maxActive });
  Object.defineProperty(runner.stats, "calls", { get: () => calls });
  return runner;
}

const BASE = "https://aie.example.com";
const SCHEDULE: Assertion[] = [{ kind: "text-present", value: "schedule" }];
const MISSING: Assertion[] = [{ kind: "text-present", value: "nonexistent" }];

describe("personaJourneyLoop", () => {
  it("reaches the goal deterministically for a given seed", async () => {
    const args: PersonaJourneyArgs = {
      agentId: "a1",
      url: BASE,
      viewport: VIEWPORTS.desktop,
      persona: "info-seeker",
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      seed: 7,
      maxSteps: 8,
    };
    const a = await personaJourneyLoop(fixtureDriver(BASE).driver, new FixtureJevClient(), args);
    const b = await personaJourneyLoop(fixtureDriver(BASE).driver, new FixtureJevClient(), args);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.outcome).toBe("goal-reached");
    expect(a.steps[0].url).toBe(BASE);
  });

  it("drops off on a dead end", async () => {
    const args: PersonaJourneyArgs = {
      agentId: "a2",
      url: `${BASE}/apply`,
      viewport: VIEWPORTS.desktop,
      persona: "proposal-comparer",
      goal: "zzz no matching tokens qqq",
      assertions: MISSING,
      seed: 42,
      maxSteps: 8,
    };
    const j = await personaJourneyLoop(fixtureDriver(`${BASE}/apply`).driver, new FixtureJevClient(), args);
    expect(j.outcome).toBe("dropped-off");
    expect(j.dropOff?.reason).toBeDefined();
    expect(j.dropOff?.stateHash).toBe(j.steps[j.dropOff!.atStep].stateHash);
  });
});

describe("runPersonaSwarm", () => {
  it("is deterministic: same seed → identical journeys", async () => {
    const args = {
      url: BASE,
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    };
    const a = await runPersonaSwarm({ ...args, runner: mockRunner() });
    const b = await runPersonaSwarm({ ...args, runner: mockRunner() });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.journeys.length).toBe(CONFIG.maxAgents);
  });

  it("dedupes identical Jev payloads across agents without changing journeys", async () => {
    const args = {
      url: BASE,
      goal: "zzz unreachable goal qqq",
      assertions: MISSING,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    };
    const uncached = await runPersonaSwarm({ ...args, runner: mockRunner() });
    const jev = new FixtureJevClient();
    const payloads: string[] = [];
    const decide = jev.decide.bind(jev);
    jev.decide = (state, questions) => {
      payloads.push(JSON.stringify([state, questions]));
      return decide(state, questions);
    };
    const cached = await runPersonaSwarm({ ...args, runner: mockRunner({ useArgsJev: true }), jev });
    expect(JSON.stringify(cached)).toBe(JSON.stringify(uncached));
    const decisionSteps = uncached.journeys.reduce((n, j) => n + j.steps.filter((s) => s.action).length, 0);
    expect(payloads.length).toBeLessThan(decisionSteps);
    expect(new Set(payloads).size).toBe(payloads.length);
  });

  it("bounds concurrency and covers every agent", async () => {
    const runner = mockRunner({ delay: 2 });
    const swarm = await runPersonaSwarm({
      runner,
      url: BASE,
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    });
    expect(runner.stats.calls).toBe(24);
    expect(runner.stats.maxActive).toBeLessThanOrEqual(4);
    expect(swarm.journeys.every((j) => j.agentId.startsWith("agent-"))).toBe(true);
  });

  it("records drop-off reasons and the distribution sums to dropped agents", async () => {
    const swarm = await runPersonaSwarm({
      runner: mockRunner(),
      url: BASE,
      goal: "zzz unreachable goal qqq",
      assertions: MISSING,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    });
    const dropped = swarm.journeys.filter((j) => j.outcome === "dropped-off").length;
    const dist = Object.values(swarm.dropOffDistribution).reduce((a, b) => a + b, 0);
    expect(dist).toBe(dropped);
    expect(dropped).toBeGreaterThan(0);
    expect(swarm.stateVisits).toBeDefined();
  });

  it("survives runner failures without crashing the swarm", async () => {
    const swarm = await runPersonaSwarm({
      runner: mockRunner({ failEvery: 3 }),
      url: BASE,
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    });
    expect(swarm.journeys.length).toBe(24);
    expect(swarm.dropOffDistribution.error).toBeGreaterThan(0);
  });
});

describe("personaWeights + selection", () => {
  it("derives persona mix from what the site offers", () => {
    const endpoints: Endpoint[] = [
      { endpointId: "e1", class: "pricing", url: `${BASE}/pricing`, label: "Pricing", weight: 1, intent: ["quotation"] },
      { endpointId: "e2", class: "schedule-event", url: `${BASE}/schedule`, label: "Schedule", weight: 0.8, intent: ["information"] },
    ];
    const w = personaWeights(endpoints, undefined);
    expect(w["quotation-checker"]).toBeGreaterThan(w["proposal-comparer"]);
    expect(w["info-seeker"]).toBeGreaterThan(1);
  });

  it("selectJourneys interleaves most-dropped and most-travelled, keeps a success", async () => {
    const swarm = await runPersonaSwarm({
      runner: mockRunner(),
      url: BASE,
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    });
    const picked = selectJourneys(swarm, 5);
    expect(picked.length).toBe(5);
    expect(new Set(picked.map((j) => j.agentId)).size).toBe(5);
    expect(picked.some((j) => j.outcome === "goal-reached")).toBe(true);
  });

  it("journeys become Trajectories that heat-map consumers understand", async () => {
    const swarm = await runPersonaSwarm({
      runner: mockRunner(),
      url: BASE,
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    });
    const trajectories = journeysToTrajectories(swarm);
    expect(trajectories.length).toBe(swarm.journeys.length);
    expect(trajectories.every((t) => t.persona !== undefined)).toBe(true);
  });
});

describe("contract round-trip", () => {
  it("Experiment parses a swarm-bearing document", async () => {
    const swarm = await runPersonaSwarm({
      runner: mockRunner(),
      url: BASE,
      goal: "find the conference schedule",
      assertions: SCHEDULE,
      config: CONFIG,
      viewport: VIEWPORTS.desktop,
    });
    const exp = Experiment.parse({
      id: "exp_x",
      targetUrl: BASE,
      goal: "find the conference schedule",
      status: "created",
      createdAt: new Date(0).toISOString(),
      configuration: CONFIG,
      simulations: journeysToTrajectories(swarm),
      swarm,
    });
    expect(exp.swarm?.agents).toBe(CONFIG.maxAgents);
    expect(exp.simulations[0].persona).toBeDefined();
  });
});

describe("withDecideCache", () => {
  const question = { type: "choice" as const, name: "q", instructions: "pick", criteria: { a: "A", b: "B" } };

  it("shares one call for identical in-flight payloads", async () => {
    const inner = new FixtureJevClient();
    let calls = 0;
    const decide = inner.decide.bind(inner);
    inner.decide = (state, questions) => {
      calls++;
      return decide(state, questions);
    };
    const jev = withDecideCache(inner);
    const [a, b] = await Promise.all([jev.decide({ goal: "x" }, [question]), jev.decide({ goal: "x" }, [question])]);
    await jev.decide({ goal: "y" }, [question]);
    expect(a).toEqual(b);
    expect(calls).toBe(2);
  });

  it("retries a payload whose call failed", async () => {
    let calls = 0;
    const jev = withDecideCache({
      name: "flaky",
      async decide() {
        calls++;
        if (calls === 1) throw new Error("quota");
        return [];
      },
    });
    await expect(jev.decide({ goal: "x" }, [question])).rejects.toThrow("quota");
    await expect(jev.decide({ goal: "x" }, [question])).resolves.toEqual([]);
    expect(calls).toBe(2);
  });
});
