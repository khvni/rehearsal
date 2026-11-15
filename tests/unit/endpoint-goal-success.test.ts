import { afterEach, describe, expect, it } from "vitest";
import { Orchestrator } from "@/lib/orchestrator";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { FixtureSiteRunner } from "../evals/bench/runner";
import type { ActivityEvent, BrowserRun, ExperimentStore, PageFetcher } from "@/lib/contracts";
import { Experiment, FixtureSiteManifest, VIEWPORTS } from "@/lib/contracts";
import { evaluateGoalAlternatives, failedGoalAssertions, goalSucceeded, summarizeRun } from "@/lib/browser/types";
import { ruleFindings } from "@/lib/analysis/findings";
import { generateSpec } from "@/lib/analysis/spec";

const pages = {
  "/": '<html><title>Home</title><body><h1>Welcome</h1><a href="/pricing">Pricing plans</a></body></html>',
  "/pricing": '<html><title>Plans</title><body><h1>Plans</h1><p>$10 per month</p></body></html>',
};
const previous = process.env.REHEARSAL_ALLOW_PRIVATE;
afterEach(() => {
  if (previous === undefined) delete process.env.REHEARSAL_ALLOW_PRIVATE;
  else process.env.REHEARSAL_ALLOW_PRIVATE = previous;
});

it("verify accepts a pricing endpoint instead of the compiled cost assertion", async () => {
  process.env.REHEARSAL_ALLOW_PRIVATE = "1";
  const experiments = new Map<string, Experiment>();
  const activity: ActivityEvent[] = [];
  const store: ExperimentStore = {
    name: "memory",
    async save(e) { experiments.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
    async get(id) { return experiments.get(id) ?? null; },
    async list() { return [...experiments.values()]; },
    async appendActivity(_id, event) { activity.push(event); },
    async activity() { return activity; },
  };
  const fetcher: PageFetcher = {
    name: "fixture",
    async fetchHtml(url) { return pages[new URL(url).pathname as keyof typeof pages] ?? ""; },
  };
  const runner = new FixtureSiteRunner({
    pages: new Map(Object.entries(pages)), dir: ".",
    manifest: FixtureSiteManifest.parse({ id: "cost", name: "Plans", goal: "Find the cost", mountPath: "/", pages: {} }),
  });
  const fixtureJev = new FixtureJevClient();
  const orch = new Orchestrator({
    store, fetcher, probeFetcher: fetcher, runner, llm: new FixtureLlmClient(),
    jev: {
      name: "follow-pricing-link",
      async decide(state, questions) {
        return (await fixtureJev.decide(state, questions)).map((result) => result.question === "next_step"
          ? { ...result, distribution: { c0: 1 }, selected: "c0" } : result);
      },
    },
  });
  const { experiment } = await orch.startExperiment("https://site.test/", "Find the cost", { viewports: ["desktop"], maxAgents: 3 });
  const verified = await orch.verify(experiment.id);
  expect(verified.assertions).toContainEqual({ kind: "url-matches", value: "cost" });
  expect(verified.endpoints?.some((e) => e.class === "pricing")).toBe(true);
  expect(verified.browserTests.length).toBeGreaterThan(0);
  expect(verified.swarm?.journeys.map((journey) => journey.outcome)).toEqual(["goal-reached", "goal-reached", "goal-reached"]);
  expect(verified.browserTests.map((run) => ({ success: run.success, steps: run.steps, alternatives: run.goalAlternatives }))).toEqual(
    verified.browserTests.map(() => ({ success: true, steps: [expect.objectContaining({ label: "Pricing plans", ok: true })], alternatives: [expect.objectContaining({ passed: true })] })),
  );
  expect(verified.browserTests.every((run) => run.goalAlternatives?.some((a) => a.passed))).toBe(true);
  expect(activity.some((event) => event.message.includes("Assertion failed"))).toBe(false);
  const analyzed = await orch.analyze(experiment.id);
  expect(analyzed.findings.filter((f) => f.evidenceType === "verified-failure" && f.category === "goal-completion")).toEqual([]);
  for (const endpointReached of [true, false]) {
    const prompts: string[] = [];
    await generateSpec({
      ...analyzed,
      browserTests: analyzed.browserTests.map((run) => ({
        ...run,
        goalAlternatives: run.goalAlternatives?.map((a) => ({ ...a, passed: endpointReached })),
      })),
    }, {
      name: "spec-evidence-fixture",
      async complete(prompt) { prompts.push(prompt); return "{}"; },
    });
    expect(prompts).toHaveLength(1);
    const failures = JSON.parse(prompts[0].match(/Verified run failures:\n([^\n]+)/)![1]);
    expect(failures).toEqual(endpointReached ? [] : analyzed.browserTests.map(() => "cost"));
  }
  const compared = await orch.compare(experiment.id);
  expect(compared.comparisons[0]?.deltas.goalCompleted).toEqual({ baseline: true, variant: true });
  expect(compared.browserTests.at(-1)?.goalAlternatives?.some((a) => a.passed)).toBe(true);
});

describe("shared goal predicate", () => {
  const cost: BrowserRun["assertions"][number] = { assertion: { kind: "url-matches", value: "cost" }, passed: false };
  const pricing: BrowserRun["assertions"][number] = { assertion: { kind: "url-matches", value: "/pricing" }, passed: true };

  it.each([
    ["compiled checks pass", [{ ...cost, passed: true }], [{ ...pricing, passed: false }], true],
    ["endpoint alternative passes", [cost], [pricing], true],
    ["neither passes", [cost], [{ ...pricing, passed: false }], false],
    ["all compiled checks are required", [cost, pricing], [], false],
    ["no assertions preserves navigation-only runs", [], [], true],
    ["missing positive goal evidence", undefined, [], false],
    ["absence alone is not alternative evidence", [cost], [{ assertion: { kind: "text-absent" as const, value: "cost" }, passed: true }], false],
  ] as const)("%s", (_name, required, alternatives, expected) => {
    expect(goalSucceeded(required && [...required], [...alternatives])).toBe(expected);
  });

  it.each(["step", "run"])("does not let an endpoint mask a %s failure", (failure) => {
    const run = summarizeRun({
      runId: "failed-navigation", viewport: VIEWPORTS.desktop, started: Date.now(),
      steps: [{ label: "Pricing plans", ok: failure !== "step" }],
      errors: failure === "run" ? ["run: navigation timed out"] : [],
      assertions: [cost], goalAlternatives: [pricing], screenshots: [],
    });
    expect(run.success).toBe(false);
    expect(failedGoalAssertions(run)).toEqual([]);
  });

  it("keeps unmatched alternatives out of assertion findings", () => {
    const run = summarizeRun({
      runId: "no-match", viewport: VIEWPORTS.desktop, started: Date.now(), steps: [], errors: [],
      assertions: [cost], goalAlternatives: [{ ...pricing, passed: false }], screenshots: [],
    });
    const findings = ruleFindings({ states: [], runs: [run], assertions: [cost.assertion], referenceNowIso: "2026-01-01T00:00:00Z" });
    expect(run.success).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('"cost"');
  });

  it("handles empty and throwing alternative probes", async () => {
    const probe = {
      async bodyText() { return ""; }, async title() { return ""; }, async url(): Promise<string> { throw new Error("closed page"); },
      async count() { return 0; }, async isVisible() { return false; },
    };
    expect(await evaluateGoalAlternatives(probe)).toEqual([]);
    expect(await evaluateGoalAlternatives(probe, [pricing.assertion])).toEqual([{ ...pricing, passed: false }]);
  });
});
