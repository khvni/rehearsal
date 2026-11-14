import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Experiment,
  VIEWPORTS,
  type BrowserRun,
  type BrowserRunner,
  type ExperimentStore,
  type RebuildGoal,
  type StateGraph,
} from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import { GraphBuilder, makeState } from "@/lib/graph";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { discoverEndpoints, intentForGoal } from "@/lib/intents";
import { Orchestrator } from "@/lib/orchestrator";
import { brandSignalsFromHtml, generateRebuild, inferGoals, rollupBrand } from "@/lib/rebuild";

// Thresholds for this eval (kept local so evals.config.json stays owned by core evals).
const T = {
  minNavItems: 8,
  minGoals: 4,
  minCtaGoals: 1,
  slugPattern: /^[a-z0-9][a-z0-9-]*$/,
  pinnedClock: "2026-11-20T12:00:00.000Z",
};

const AIE_URL = "https://ai.engineer/code/2026";
const AIE_ORIGIN = new URL(AIE_URL).origin;
const GOAL = "find the conference schedule";
const aieHtml = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const TALKS_URL = `${AIE_URL}/talks`;
const talksHtml =
  "<html><head><title>Sessions — AIE Code 2026</title></head><body><h1>Schedule</h1><p>Wednesday November 11 talks</p></body></html>";

function fixtureGraph(): StateGraph {
  const b = new GraphBuilder(30, 3);
  for (const [url, html] of [[AIE_URL, aieHtml], [TALKS_URL, talksHtml]] as const) {
    const page = extractPage(html, url);
    const state = makeState({ url, viewport: VIEWPORTS.desktop, title: page.title, visibleText: page.visibleText, actions: page.actions });
    state.brand = brandSignalsFromHtml(html, url);
    b.add(state);
  }
  return b.build();
}

function fixtureExperiment(): Experiment {
  const graph = fixtureGraph();
  const goalIntent = intentForGoal(GOAL);
  return Experiment.parse({
    id: "exp_rebuild",
    targetUrl: AIE_URL,
    goal: GOAL,
    status: "created",
    createdAt: "2026-11-01T00:00:00.000Z",
    configuration: { viewports: ["desktop"] },
    graph,
    intents: [goalIntent],
    endpoints: discoverEndpoints(graph, { intents: [goalIntent] }),
  });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const imgSrcs = (html: string) => [...html.matchAll(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]);

describe("eval: rebuild brand extraction on the AIE fixture", () => {
  const signals = brandSignalsFromHtml(aieHtml, AIE_URL);

  it("reads site name, theme color, favicon, and the primary nav resolved against the page", () => {
    expect(signals.siteName).toMatch(/AI Engineer/);
    expect(signals.themeColor?.toLowerCase()).toBe("#ffffff");
    expect(signals.faviconUrl).toBe(`${AIE_ORIGIN}/favicon.ico`);
    expect(signals.navItems.length).toBeGreaterThanOrEqual(T.minNavItems);
    expect(signals.navItems.some((n) => /apply to attend/i.test(n.label))).toBe(true);
    expect(signals.navItems.some((n) => /speakers/i.test(n.label))).toBe(true);
    expect(signals.navItems.every((n) => new URL(n.href).origin === AIE_ORIGIN)).toBe(true);
  });

  it("cssVars is a string record (the fixture declares no :root custom properties)", () => {
    expect(typeof signals.cssVars).toBe("object");
    expect(Object.values(signals.cssVars).every((v) => typeof v === "string")).toBe(true);
    expect(Object.keys(signals.cssVars).every((k) => k.startsWith("--"))).toBe(true);
  });

  it("is deterministic: parsing and rollupBrand deep-equal across calls", () => {
    expect(brandSignalsFromHtml(aieHtml, AIE_URL)).toEqual(signals);
    const states = fixtureGraph().states;
    expect(rollupBrand(states)).toEqual(rollupBrand(fixtureGraph().states));
  });
});

describe("eval: rebuild goal inference coverage", () => {
  const exp = fixtureExperiment();
  const goals = inferGoals(exp);

  it(`infers ≥${T.minGoals} goals with the experiment goal first`, () => {
    expect(goals.length).toBeGreaterThanOrEqual(T.minGoals);
    expect(goals[0].source).toBe("experiment-goal");
    expect(goals[0].goal).toBe(GOAL);
    expect(goals.filter((g) => g.source === "cta").length).toBeGreaterThanOrEqual(T.minCtaGoals);
  });

  it("slugs are unique and url-safe; weights in [0,1]; deterministic", () => {
    const slugs = goals.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => T.slugPattern.test(s))).toBe(true);
    expect(goals.every((g) => g.weight >= 0 && g.weight <= 1)).toBe(true);
    expect(inferGoals(fixtureExperiment())).toEqual(goals);
  });
});

describe("eval: rebuild generated pages (fixture LLM)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T.pinnedClock));
  });
  afterEach(() => vi.useRealTimers());

  const ctaLabelIn = (goal: RebuildGoal, html: string) => {
    const label = goal.sourceLabel;
    if (!label) return true;
    const lower = html.toLowerCase();
    return lower.includes(label.toLowerCase()) || lower.includes(escapeHtml(label).toLowerCase());
  };

  it("one safe, branded page per goal, byte-identical across runs", async () => {
    const result = await generateRebuild(fixtureExperiment(), new FixtureLlmClient());
    expect(result.pages.length).toBe(result.goals.length);
    expect(result.pages.map((p) => p.slug)).toEqual(result.goals.map((g) => g.slug));
    for (const [i, page] of result.pages.entries()) {
      const goal = result.goals[i];
      expect(page.html).not.toMatch(/<script\b/i);
      for (const src of imgSrcs(page.html)) expect(new URL(src, AIE_URL).origin).toBe(AIE_ORIGIN);
      if (goal.source === "cta") expect(ctaLabelIn(goal, page.html)).toBe(true);
      expect(page.bytes).toBe(Buffer.byteLength(page.html, "utf8"));
    }
    const again = await generateRebuild(fixtureExperiment(), new FixtureLlmClient());
    expect(again.pages.map((p) => p.html)).toEqual(result.pages.map((p) => p.html));
    expect(again).toEqual(result);
  });
});

describe("eval: orchestrator wires the rebuild stage (fixture adapters)", () => {
  const pages: Record<string, string> = { [AIE_URL]: aieHtml, [TALKS_URL]: talksHtml };
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
        errors: [], consoleErrorCount: 0, screenshotPaths: [], durationMs: 0,
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

  it("rebuild chains earlier stages, stores experiment.rebuild, and round-trips the contract", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // skip DNS for the fixture origin
    const llm = new FixtureLlmClient();
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm,
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    try {
      const exp = await orch.createExperiment(AIE_URL, GOAL, {
        viewports: ["desktop"], trajectories: 200, verifyCount: 2, maxStates: 5,
      });
      await orch.rebuild(exp.id);
      const stored = (await orch.get(exp.id))!;
      expect(stored.status).toBe("complete");
      expect(stored.spec).toBeDefined();
      expect(stored.graph?.states.every((s) => s.brand !== undefined)).toBe(true);
      expect(stored.rebuild).toBeDefined();
      expect(stored.rebuild!.llm).toBe(llm.name);
      expect(stored.rebuild!.pages.length).toBe(stored.rebuild!.goals.length);
      expect(stored.rebuild!.goals[0].source).toBe("experiment-goal");
      // what GET /api/experiments/[id] serializes must round-trip through the contract
      expect(Experiment.parse(JSON.parse(JSON.stringify(stored))).rebuild).toEqual(stored.rebuild);
    } finally {
      delete process.env.REHEARSAL_ALLOW_PRIVATE;
    }
  });
});
