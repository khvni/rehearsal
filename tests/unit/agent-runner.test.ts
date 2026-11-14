import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  Experiment,
  VIEWPORTS,
  type AgentCandidate,
  type AgentDriver,
  type AgentRunArgs,
  type BrowserRun,
  type BrowserRunner,
  type ExperimentStore,
  type TrajectoryArgs,
} from "@/lib/contracts";
import { agentLoop } from "@/lib/browser/agent";
import { agentVerifyEnabled } from "@/lib/browser/runner";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { Orchestrator } from "@/lib/orchestrator";

const HTML = "<html><head><title>Schedule — Fixture Conf</title></head><body><h1>Schedule</h1><p>Wednesday talks</p></body></html>";

function fixtureDriver(candidates: Record<string, AgentCandidate[]>, failOn?: string) {
  const observed: (string | undefined)[] = [];
  const acted: string[] = [];
  const driver: AgentDriver = {
    async observe(instruction) {
      observed.push(instruction);
      const key = Object.keys(candidates).find((label) => instruction?.includes(`"${label}"`));
      return key ? candidates[key] : [];
    },
    async act(instruction) {
      acted.push(instruction);
      return failOn && instruction.includes(failOn) ? { ok: false, detail: "no match" } : { ok: true };
    },
    async extract() {
      return { heading: "Schedule" };
    },
    probe: () => ({
      bodyText: async () => HTML.replace(/<title>.*<\/title>/, "").replace(/<[^>]+>/g, " "),
      isVisible: async (s) => HTML.includes(`<${s}`),
      count: async (s) => HTML.split(`<${s}`).length - 1,
      title: async () => /<title>(.*)<\/title>/.exec(HTML)?.[1] ?? "",
      url: async () => "https://fixture.test/talks",
    }),
  };
  return { driver, observed, acted };
}

const baseArgs = (actions: AgentRunArgs["actions"]): AgentRunArgs => ({
  url: "https://fixture.test/",
  viewport: VIEWPORTS.desktop,
  actions,
  assertions: [
    { kind: "text-present", value: "wednesday talks" },
    { kind: "element-visible", value: "heading", selector: "h1" },
    { kind: "url-matches", value: "/pricing" },
  ],
  runId: "run_t",
  goal: "find the conference schedule",
});

describe("agentLoop", () => {
  it("maps observe→act into steps, evaluates assertions, shoots on cadence", async () => {
    const { driver, observed, acted } = fixtureDriver(
      {
        Program: [{ selector: "xpath=/a[1]", description: "the Program link in the header", method: "click" }],
        Talks: [{ selector: "xpath=/a[2]", description: "the Talks tab" }],
        Day: [{ selector: "xpath=/a[3]", description: "Day 2 link", method: "click" }],
        Schedule: [{ selector: "xpath=/a[4]", description: "Full schedule", method: "click" }],
      },
      "Day 2",
    );
    const shots: string[] = [];
    const run = await agentLoop(
      driver,
      baseArgs([
        { actionId: "a1", label: "Program", role: "link" },
        { actionId: "a2", label: "Talks", role: "link" },
        { actionId: "a3", label: "Day", role: "button" },
        { actionId: "a4", label: "Schedule", role: "link" },
      ]),
      async (name) => {
        shots.push(name);
        return `/evidence/${name}.png`;
      },
    );
    expect(observed[0]).toContain('link labelled "Program"');
    expect(observed[0]).toContain("find the conference schedule");
    expect(acted).toEqual(["click the Program link in the header", "the Talks tab", "click Day 2 link", "click Full schedule"]);
    expect(run.steps).toEqual([
      { actionId: "a1", label: "Program", ok: true },
      { actionId: "a2", label: "Talks", ok: true },
      { actionId: "a3", label: "Day", ok: false, error: "act failed: no match" },
      { actionId: "a4", label: "Schedule", ok: true },
    ]);
    expect(run.assertions.map((a) => a.passed)).toEqual([true, true, false]);
    expect(shots).toEqual(["run_t_3", "run_t_4"]);
    expect(run.screenshotPaths).toEqual(["/evidence/run_t_3.png", "/evidence/run_t_4.png"]);
    expect(run.success).toBe(false);
    expect(run.consoleErrorCount).toBe(0);
  });

  it("falls back to a direct act() when observe finds nothing, and honours maxSteps", async () => {
    const { driver, acted } = fixtureDriver({});
    const run = await agentLoop(
      driver,
      { ...baseArgs([{ label: "Schedule", role: "link" }, { label: "Register" }]), maxSteps: 1, assertions: [] },
      async () => null,
    );
    expect(acted).toEqual(['click the link labelled "Schedule"']);
    expect(run.steps).toEqual([{ actionId: undefined, label: "Schedule", ok: true }]);
    expect(run.screenshotPaths).toEqual([]);
    expect(run.success).toBe(true);
  });
});

describe("agentVerifyEnabled", () => {
  it("reads REHEARSAL_VERIFY_AGENT", () => {
    expect(agentVerifyEnabled({})).toBe(false);
    expect(agentVerifyEnabled({ REHEARSAL_VERIFY_AGENT: "0" })).toBe(false);
    expect(agentVerifyEnabled({ REHEARSAL_VERIFY_AGENT: "1" })).toBe(true);
  });
});

describe("orchestrator verify routes to runAgentTask only when opted in and supported", () => {
  const AIE_URL = "https://ai.engineer/code/2026";
  const pages: Record<string, string> = {
    [AIE_URL]: readFileSync(path.join(__dirname, "..", "evals", "fixtures", "aie-code-2026.html"), "utf8"),
    [`${AIE_URL}/talks`]: HTML,
  };
  const okRun = (args: TrajectoryArgs): BrowserRun => ({
    runId: args.runId, viewport: args.viewport, success: true,
    steps: args.actions.map((a) => ({ actionId: a.actionId, label: a.label, ok: true })),
    assertions: args.assertions.map((assertion) => ({ assertion, passed: true })),
    errors: [], consoleErrorCount: 0, screenshotPaths: [], durationMs: 0,
  });

  function fixtureRunner(supportsAgent: boolean) {
    const calls = { trajectory: 0, agent: [] as string[] };
    const runner: BrowserRunner = {
      name: "fixture-runner",
      supportsAgent,
      async openPage(url) {
        const html = pages[url];
        if (!html) throw new Error(`no fixture for ${url}`);
        return { html, screenshotPath: "" };
      },
      async runTrajectory(args) {
        calls.trajectory++;
        return okRun(args);
      },
      async runAgentTask(args) {
        calls.agent.push(args.goal);
        return okRun(args);
      },
      async close() {},
    };
    return { runner, calls };
  }

  async function verifyWith(runner: BrowserRunner) {
    const mem = new Map<string, Experiment>();
    const store: ExperimentStore = {
      name: "memory",
      async save(e) { mem.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
      async get(id) { return mem.get(id) ?? null; },
      async list() { return [...mem.values()]; },
    };
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment(AIE_URL, "find the conference schedule", {
      viewports: ["desktop"], trajectories: 50, verifyCount: 2, maxStates: 3,
    });
    const verified = await orch.verify(exp.id);
    expect(verified.browserTests.length).toBeGreaterThan(0);
    return verified;
  }

  afterEach(() => {
    delete process.env.REHEARSAL_VERIFY_AGENT;
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  });

  it("uses runAgentTask with the goal when REHEARSAL_VERIFY_AGENT=1", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    process.env.REHEARSAL_VERIFY_AGENT = "1";
    const { runner, calls } = fixtureRunner(true);
    const exp = await verifyWith(runner);
    expect(calls.trajectory).toBe(0);
    expect(calls.agent.length).toBe(exp.browserTests.length);
    expect(new Set(calls.agent)).toEqual(new Set(["find the conference schedule"]));
  });

  it("keeps runTrajectory when the flag is unset", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const { runner, calls } = fixtureRunner(true);
    const exp = await verifyWith(runner);
    expect(calls.agent).toEqual([]);
    expect(calls.trajectory).toBe(exp.browserTests.length);
  });

  it("falls back to runTrajectory when supportsAgent=false even with the flag set", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    process.env.REHEARSAL_VERIFY_AGENT = "1";
    const { runner, calls } = fixtureRunner(false);
    const exp = await verifyWith(runner);
    expect(calls.agent).toEqual([]);
    expect(calls.trajectory).toBe(exp.browserTests.length);
  });
});
