import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Experiment, VIEWPORTS, type BrowserRun, type SiteState, type StateGraph } from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import type { BrowserRunner } from "@/lib/browser/types";
import { GraphBuilder, makeState } from "@/lib/graph";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { endpointFindings } from "@/lib/analysis/findings";
import type { ExperimentStore } from "@/lib/storage";
import { Orchestrator } from "@/lib/orchestrator";
import {
  EXPECTED_CLASSES,
  classifyGoal,
  defaultIntentsForSite,
  detectSiteType,
  discoverEndpoints,
  endpointGoalAssertions,
  endpointJourneys,
  intentForGoal,
} from "@/lib/intents";
import { goalSatisfiedInState } from "@/lib/simulation";

// Thresholds for this eval (kept local so evals.config.json stays owned by core evals).
const T = {
  minScheduleEndpoints: 1,
  minSignupEndpoints: 1,
  minTopEndpointWeight: 0.75,
  journeySeed: 1337,
};

const AIE_URL = "https://ai.engineer/code/2026";
const aieHtml = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const aie = extractPage(aieHtml, AIE_URL);

function aieGraph(): StateGraph {
  const b = new GraphBuilder(30, 3);
  b.add(makeState({ url: AIE_URL, viewport: VIEWPORTS.desktop, title: aie.title, visibleText: aie.visibleText, actions: aie.actions }));
  return b.build();
}

const link = (label: string, href: string) =>
  ({ type: "click" as const, label, role: "link", href, enabled: true, safeToExecute: true });
const page = (url: string, title: string, text: string, actions: ReturnType<typeof link>[]): SiteState =>
  makeState({ url, viewport: VIEWPORTS.desktop, title, visibleText: text, actions });

describe("eval: intents + endpoints on the AIE fixture", () => {
  const graph = aieGraph();
  const endpoints = discoverEndpoints(graph);

  it("detects an event site and finds schedule-event + signup(apply) endpoints", () => {
    expect(detectSiteType(graph)).toBe("event");
    const schedule = endpoints.filter((e) => e.class === "schedule-event");
    const signup = endpoints.filter((e) => e.class === "signup");
    expect(schedule.length).toBeGreaterThanOrEqual(T.minScheduleEndpoints);
    expect(signup.length).toBeGreaterThanOrEqual(T.minSignupEndpoints);
    expect(signup.some((e) => /apply/i.test(e.label))).toBe(true);
    expect(schedule.some((e) => /sessions|schedule/i.test(e.label))).toBe(true);
    expect(endpoints[0].weight).toBeGreaterThanOrEqual(T.minTopEndpointWeight);
    expect(["schedule-event", "signup"]).toContain(endpoints[0].class);
  });

  it("weights are deterministic and bounded", () => {
    const again = discoverEndpoints(aieGraph()).map(({ endpointId, weight }) => [endpointId, weight]);
    expect(again).toEqual(endpoints.map(({ endpointId, weight }) => [endpointId, weight]));
    expect(endpoints.every((e) => e.weight >= 0 && e.weight <= 1)).toBe(true);
  });

  it("'find the conference schedule' is an information intent targeting schedule-event", () => {
    expect(classifyGoal("find the conference schedule")).toBe("information");
    expect(intentForGoal("find the conference schedule").targetEndpointClasses).toEqual(["schedule-event"]);
  });

  it("produces one default goal per RFX category, tailored to the event site", () => {
    const intents = defaultIntentsForSite(graph);
    expect(intents.map((i) => i.category)).toEqual(["information", "quotation", "proposal"]);
    expect(intents[0].targetEndpointClasses).toContain("schedule-event");
    expect(intents[2].targetEndpointClasses).toContain("signup");
    expect(intents.every((i) => i.goal.includes("AI Engineer Code Summit 2026"))).toBe(true);
  });

  it("no reachability findings for CTAs surfaced on the start page", () => {
    const journeys = endpointJourneys(graph, endpoints, { seed: T.journeySeed, maxDepth: 3 });
    const findings = endpointFindings({
      endpoints, journeys, expectedClasses: EXPECTED_CLASSES.event, siteType: "event", statesDiscovered: 1,
    });
    expect(findings).toEqual([]);
  });
});

describe("eval: endpoint findings on synthetic journeys", () => {
  // home → features → product → plans → pricing (4 clicks deep); /signup orphaned (no inbound edge).
  const home = page("https://acme.com/", "Acme platform", "Acme platform. Log in. API. Integrations. Dashboard. Free trial.", [
    link("Features", "https://acme.com/features"),
  ]);
  const features = page("https://acme.com/features", "Features", "", [link("Product tour", "https://acme.com/product")]);
  const product = page("https://acme.com/product", "Product", "", [link("Compare editions", "https://acme.com/compare")]);
  const compare = page("https://acme.com/compare", "Compare", "", [link("Pricing", "https://acme.com/pricing")]);
  const pricing = page("https://acme.com/pricing", "Pricing", "$10 per month", []);
  const signup = page("https://acme.com/signup", "Sign up", "", []);
  const graph: StateGraph = {
    states: [home, features, product, compare, pricing, signup],
    edges: [
      { fromStateId: home.stateId, actionId: home.actions[0].actionId, toStateId: features.stateId },
      { fromStateId: features.stateId, actionId: features.actions[0].actionId, toStateId: product.stateId },
      { fromStateId: product.stateId, actionId: product.actions[0].actionId, toStateId: compare.stateId },
      { fromStateId: compare.stateId, actionId: compare.actions[0].actionId, toStateId: pricing.stateId },
    ],
  };
  const endpoints = discoverEndpoints(graph);
  const journeys = endpointJourneys(graph, endpoints, { seed: T.journeySeed, maxDepth: 3 });
  const findings = endpointFindings({
    endpoints, journeys, expectedClasses: [...EXPECTED_CLASSES.saas, "docs-answers"], siteType: "saas", statesDiscovered: graph.states.length,
  });

  it("flags the orphaned signup as endpoint-unreachable", () => {
    const f = findings.find((x) => x.findingId.startsWith("f_endpoint-unreachable_ep_signup"));
    expect(f).toBeDefined();
    expect(f!.krugPrinciple).toBe("navigation");
  });

  it("flags the 4-click pricing page as endpoint-deep with its journey", () => {
    const j = journeys.find((x) => x.endpointId.startsWith("ep_pricing"))!;
    expect(j.medianSteps).toBe(4);
    expect(j.samplePath).toEqual(["Features", "Product tour", "Compare editions", "Pricing"]);
    const f = findings.find((x) => x.findingId.startsWith("f_endpoint-deep_ep_pricing"));
    expect(f?.krugPrinciple).toBe("mindless-choices");
  });

  it("flags expected classes the site never exposes", () => {
    expect(findings.map((f) => f.findingId)).toContain("f_missing-endpoint-class_docs-answers");
    expect(findings.map((f) => f.findingId)).not.toContain("f_missing-endpoint-class_pricing");
  });

  it("is deterministic across runs", () => {
    expect(endpointJourneys(graph, endpoints, { seed: T.journeySeed, maxDepth: 3 })).toEqual(journeys);
  });
});

describe("eval: orchestrator wires intents/endpoints through the pipeline (fixture adapters)", () => {
  const pages: Record<string, string> = {
    [AIE_URL]: aieHtml,
    [`${AIE_URL}/talks`]: "<html><head><title>Sessions — AIE Code 2026</title></head><body><h1>Schedule</h1><p>Wednesday November 11 talks</p></body></html>",
  };
  const runner: BrowserRunner = {
    name: "fixture-runner",
    async openPage(url) {
      const html = pages[url];
      if (!html) throw new Error(`no fixture for ${url}`);
      return { html, screenshotPath: "" };
    },
    async runTrajectory(args): Promise<BrowserRun> {
      return {
        runId: args.runId, viewport: args.viewport, success: true,
        steps: args.actions.map((a) => ({ actionId: a.actionId, label: a.label, ok: true })),
        assertions: args.assertions.map((assertion) => ({ assertion, passed: true })),
        errors: [], screenshotPaths: [], durationMs: 0,
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

  it("discover → analyze stores intents, endpoints, journeys; goal reached via schedule endpoint", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // skip DNS for the fixture origin
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment(AIE_URL, "find the conference schedule", {
      viewports: ["desktop"], trajectories: 300, verifyCount: 2, maxStates: 5,
    });
    await orch.discover(exp.id);
    const discovered = (await orch.get(exp.id))!;
    expect(discovered.intents?.[0]).toMatchObject({ category: "information", targetEndpointClasses: ["schedule-event"] });
    expect(discovered.intents?.map((i) => i.category)).toEqual(["information", "information", "quotation", "proposal"]);
    const talks = discovered.endpoints?.find((e) => e.class === "schedule-event" && e.url === `${AIE_URL}/talks`);
    expect(talks?.stateId).toBeDefined();
    expect(talks?.weight).toBeGreaterThanOrEqual(T.minTopEndpointWeight);
    expect(discovered.endpoints?.some((e) => e.class === "signup")).toBe(true);

    await orch.simulate(exp.id);
    const simulated = (await orch.get(exp.id))!;
    const talksState = simulated.graph!.states.find((s) => s.stateId === talks!.stateId)!;
    // the compiled goal assertions alone don't recognise /talks; the endpoint class does
    expect(goalSatisfiedInState(talksState, simulated.assertions)).toBe(false);
    const goalAssertions = [...simulated.assertions, ...endpointGoalAssertions(simulated.graph, simulated.intents?.[0], simulated.endpoints)];
    expect(goalSatisfiedInState(talksState, goalAssertions)).toBe(true);
    expect(goalSatisfiedInState(simulated.graph!.states[0], goalAssertions)).toBe(false);
    const viaTalks = simulated.simulations.filter((t) => t.steps.some((st) => st.stateId === talks!.stateId));
    expect(viaTalks.every((t) => t.outcome === "goal-reached")).toBe(true);

    await orch.analyze(exp.id);
    const analyzed = (await orch.get(exp.id))!;
    expect(analyzed.journeys?.length).toBeGreaterThan(0);
    // what GET /api/experiments/[id] serializes must round-trip through the contract
    expect(() => Experiment.parse(JSON.parse(JSON.stringify(analyzed)))).not.toThrow();
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  });
});
