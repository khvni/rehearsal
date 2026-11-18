import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Experiment,
  VIEWPORTS,
  type BrowserRun,
  type BrowserRunner,
  type ExperimentStore,
  type Finding,
  type LlmClient,
  type StateGraph,
} from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import { GraphBuilder, makeState } from "@/lib/graph";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { generateSpec, specToMarkdown } from "@/lib/analysis/spec";
import { generateMockup, rewriteLinks } from "@/lib/mockup";
import { Orchestrator } from "@/lib/orchestrator";
import { brandSignalsFromHtml } from "@/lib/rebuild";

// Thresholds for this eval (kept local so evals.config.json stays owned by core evals).
const T = {
  minPages: 2,
  pinnedClock: "2026-11-20T12:00:00.000Z",
  slugPattern: /^[a-z0-9][a-z0-9-]*$/,
};

const AIE_URL = "https://ai.engineer/code/2026";
const GOAL = "find the conference schedule";
const aieHtml = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const TALKS_URL = `${AIE_URL}/talks`;
const talksHtml =
  "<html><head><title>Sessions — AIE Code 2026</title></head><body><h1>Schedule</h1><p>Wednesday November 11 talks and workshops across three stages.</p><p>Doors open at nine, last session ends at five.</p></body></html>";

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

function fixtureFindings(graph: StateGraph): Finding[] {
  const home = graph.states[0];
  const cta = home.actions.find((a) => /apply/i.test(a.label)) ?? home.actions[0];
  return [
    {
      findingId: "f_stale", title: "Stale event dates", category: "consistency", severity: "high",
      evidenceType: "verified-failure", description: "Page advertises a past event",
      affectedStates: [home.stateId], affectedActions: [cta.actionId], evidencePaths: [],
      recommendation: "Drop the stale dates and show the current status",
      verificationStatus: "verified", principle: "cut-needless-words",
    },
    {
      findingId: "f_nav", title: "Crowded navigation", category: "navigation", severity: "medium",
      evidenceType: "reproducible-concern", description: "Nav lists too many items",
      affectedStates: [home.stateId], affectedActions: [], evidencePaths: [],
      recommendation: "Cut the nav to the six destinations visitors actually need",
      verificationStatus: "reproduced", principle: "familiar-conventions",
    },
  ];
}

function fixtureExperiment(): Experiment {
  const graph = fixtureGraph();
  return Experiment.parse({
    id: "exp_mockup",
    targetUrl: AIE_URL,
    goal: GOAL,
    status: "created",
    createdAt: "2026-11-01T00:00:00.000Z",
    configuration: { viewports: ["desktop"] },
    graph,
    findings: fixtureFindings(graph),
    // A spec change on the home page marks it for an LLM mockup page; pages
    // with no spec change render from the deterministic template instead.
    spec: {
      targetUrl: AIE_URL, goal: GOAL, generatedAt: "2026-11-01T00:00:00.000Z", baselineRunIds: [],
      summary: "Fix stale dates and crowded nav",
      changes: [
        { rank: 1, title: "Drop stale dates", change: "Remove past event dates", steps: ["Remove past event dates"], rationale: "r", effort: "S", findingId: "f_stale" },
        { rank: 2, title: "Cut the nav", change: "Trim nav to six items", steps: ["Trim nav to six items"], rationale: "r", effort: "S", findingId: "f_nav" },
      ],
      rebuildPhases: [{ name: "p", goal: "g", items: ["i"] }],
    },
  });
}

const stubLlm = (byMarker: Record<string, string>): LlmClient => ({
  name: "stub",
  async complete(prompt) {
    for (const [marker, out] of Object.entries(byMarker)) if (prompt.includes(marker)) return out;
    return "not json";
  },
});

describe("eval: spec enumerates every finding as concrete changes", () => {
  it("one change per finding with ordered steps naming the control and page", async () => {
    const exp = fixtureExperiment();
    const spec = await generateSpec(exp, new FixtureLlmClient());
    const byFinding = new Set(spec.changes.flatMap((c) => (c.findingId ? [c.findingId] : [])));
    for (const f of exp.findings) expect(byFinding.has(f.findingId)).toBe(true);
    for (const c of spec.changes) {
      expect(c.steps.length).toBeGreaterThan(0);
      expect(c.steps[0]).toBe(c.change);
    }
    const stale = spec.changes.find((c) => c.findingId === "f_stale")!;
    expect(stale.steps.some((s) => /Update the ".+" (link|button|control)/.test(s))).toBe(true);
    expect(stale.steps.some((s) => /Apply on ai\.engineer/.test(s))).toBe(true);
    // markdown enumerates the steps under each change
    const md = specToMarkdown(spec);
    expect(md).toContain("- Steps:");
    expect(md.indexOf("## Changes (by impact)")).toBeLessThan(md.indexOf("## Rebuild plan"));
  });

  it("an LLM spec that drops a finding still covers it deterministically", async () => {
    const exp = fixtureExperiment();
    const llm = stubLlm({
      "rebuild spec": JSON.stringify({
        summary: "Two fixes.",
        changes: [
          { title: "Rewrite A", change: "Do A", steps: ["step one"], rationale: "r", effort: "S", findingId: "f_stale" },
          { title: "Rewrite B", change: "Do B", steps: [], rationale: "r", effort: "S", findingId: "f_nav" },
        ],
        rebuildPhases: [{ name: "p", goal: "g", items: ["i"] }],
      }),
    });
    const spec = await generateSpec(exp, llm);
    expect(spec.changes.map((c) => c.findingId).sort()).toEqual(["f_nav", "f_stale"]);
    // steps left empty inherit the deterministic list; ranks stay sequential
    expect(spec.changes.every((c, i) => c.rank === i + 1)).toBe(true);
    expect(spec.changes.every((c) => c.steps.length > 0)).toBe(true);
  });
});

describe("eval: spec-stage mockup (fixture LLM)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T.pinnedClock));
  });
  afterEach(() => vi.useRealTimers());

  it("one self-contained page per crawled URL, byte-identical across runs", async () => {
    const exp = fixtureExperiment();
    const result = await generateMockup(exp, new FixtureLlmClient());
    expect(result.pages.length).toBeGreaterThanOrEqual(T.minPages);
    expect(result.llm).toBe("gemini-fixture");
    const base = `/experiments/${exp.id}/preview`;
    for (const page of result.pages) {
      expect(T.slugPattern.test(page.slug)).toBe(true);
      expect(page.bytes).toBe(Buffer.byteLength(page.html, "utf8"));
      // self-contained: no scripts, no external resources of any kind
      expect(page.html).not.toMatch(/<(script|img|link|iframe|object|embed)\b/i);
      expect(page.html).not.toMatch(/url\(|@import/i);
      expect(page.html).toContain("mock-flag");
    }
    // the crawled root is the preview's landing page; internal links stay inside the directory
    expect(result.pages.some((p) => p.slug === "code-2026" && p.sourceUrl === AIE_URL)).toBe(true);
    const index = result.pages.find((p) => p.slug === "code-2026")!;
    expect(index.html).toContain(`href="${base}/code-2026-talks"`);
    const again = await generateMockup(fixtureExperiment(), new FixtureLlmClient());
    expect(again.pages.map((p) => p.html)).toEqual(result.pages.map((p) => p.html));
  });

  it("LLM pages are sanitized: scripts stripped, mockup: links resolved, hostile hrefs neutralized", async () => {
    const hostile = `<!doctype html><html><body>
      <script>alert(1)</script>
      <img src="https://evil.example/x.png" onerror="alert(2)">
      <svg onload="alert(4)"><rect/></svg>
      <video autoplay src="https://evil.example/tracker.mp4"></video>
      <form action="https://evil.example/collect"><input name="x"></form>
      <a href="mockup:code-2026-talks">Sessions</a>
      <a href="${TALKS_URL}">Talks (crawled url)</a>
      <a href="javascript:alert(3)">bad</a>
      <a href="${AIE_URL}/unseen">uncrawled same-origin</a>
      <a href="https://elsewhere.example/x">exit</a>
      <p>hello</p></body></html>`;
    const llm = stubLlm({
      MOCKUP_PAGES_JSON: JSON.stringify({
        pages: [{ slug: "code-2026", title: "Mock", summary: "applied", html: hostile }],
      }),
    });
    const result = await generateMockup(fixtureExperiment(), llm);
    const index = result.pages.find((p) => p.slug === "code-2026")!;
    expect(index.source).toBe("gemini");
    expect(index.title).toBe("Mock");
    const base = "/experiments/exp_mockup/preview";
    expect(index.html).not.toMatch(/<(script|img|video|svg|form|input)\b/i);
    expect(index.html).not.toMatch(/onerror|onload|javascript:/i);
    expect(index.html).not.toContain("evil.example/tracker");
    expect(index.html).toContain(`href="${base}/code-2026-talks"`);
    expect(index.html).toContain('href="#"');
    expect(index.html).toContain("https://elsewhere.example/x");
    // pages the LLM skipped still render from the deterministic template
    const talks = result.pages.find((p) => p.slug === "code-2026-talks")!;
    expect(talks.source).toBe("template");
    expect(talks.html).toContain("mock-flag");
  });

  it("a finding captured on the mobile twin still applies to the page's mockup", async () => {
    const b = new GraphBuilder(30, 3);
    const page = extractPage(aieHtml, AIE_URL);
    const desktop = makeState({ url: AIE_URL, viewport: VIEWPORTS.desktop, title: page.title, visibleText: page.visibleText, actions: page.actions });
    const mobile = makeState({ url: AIE_URL, viewport: VIEWPORTS.mobile, title: page.title, visibleText: page.visibleText, actions: page.actions });
    desktop.brand = brandSignalsFromHtml(aieHtml, AIE_URL);
    mobile.brand = desktop.brand;
    b.add(desktop);
    b.add(mobile);
    const graph = b.build();
    const exp = Experiment.parse({
      id: "exp_mockup_mobile",
      targetUrl: AIE_URL,
      goal: GOAL,
      status: "created",
      createdAt: "2026-11-01T00:00:00.000Z",
      configuration: { viewports: ["desktop", "mobile"] },
      graph,
      findings: [
        {
          findingId: "f_mobile", title: "Mobile CTA unreachable", category: "navigation", severity: "high",
          evidenceType: "verified-failure", description: "Button off-viewport on mobile",
          affectedStates: [mobile.stateId], affectedActions: [], evidencePaths: [],
          recommendation: "Pin the primary CTA in the mobile header",
          verificationStatus: "verified", principle: "where-you-are",
        },
      ],
    });
    exp.spec = await generateSpec(exp, new FixtureLlmClient());
    const result = await generateMockup(exp, new FixtureLlmClient());
    const index = result.pages.find((p) => p.slug === "code-2026")!;
    expect(index.summary).toContain("Mobile CTA unreachable");
    expect(index.html).toContain("Mobile CTA unreachable");
  });

  it("HTML-escaped query hrefs resolve to preview paths", () => {
    const crawled = "https://ai.engineer/code/2026/talks?day=1&track=main";
    const urlToSlug = new Map([[crawled, "talks"]]);
    const out = rewriteLinks(
      `<a href="https://ai.engineer/code/2026/talks?day=1&amp;track=main">t</a>`,
      {
        previewBase: "/experiments/e1/preview",
        sourceUrl: "https://ai.engineer/code/2026",
        urlToSlug,
        slugs: new Set(["talks"]),
        targetOrigin: "https://ai.engineer",
      },
    );
    expect(out).toContain('href="/experiments/e1/preview/talks"');
  });
});

describe("eval: orchestrator wires mockup into the spec stage", () => {
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
    async appendActivity() {},
    async activity() { return []; },
  };

  it("spec stores experiment.mockup and the contract round-trips", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1"; // skip DNS for the fixture origin
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
      probeFetcher: {
        name: "fixture-fetch",
        async fetchHtml(url) {
          const html = pages[url];
          if (!html) throw new Error(`no fixture for ${url}`);
          return html;
        },
      },
    });
    try {
      const exp = await orch.createExperiment(AIE_URL, GOAL, {
        viewports: ["desktop"], trajectories: 200, verifyCount: 2, maxStates: 5,
      });
      await orch.spec(exp.id);
      const stored = (await orch.get(exp.id))!;
      expect(stored.status).toBe("complete");
      expect(stored.spec).toBeDefined();
      expect(stored.mockup).toBeDefined();
      expect(stored.mockup!.llm).toBe("gemini-fixture");
      expect(stored.mockup!.pages.length).toBeGreaterThanOrEqual(T.minPages);
      // every change covers a finding and ships concrete steps
      expect(stored.spec!.changes.length).toBeGreaterThanOrEqual(stored.findings.length);
      expect(stored.spec!.changes.every((c) => c.steps.length > 0)).toBe(true);
      // what GET /api/experiments/[id] serializes must round-trip through the contract
      expect(Experiment.parse(JSON.parse(JSON.stringify(stored))).mockup).toEqual(stored.mockup);
    } finally {
      delete process.env.REHEARSAL_ALLOW_PRIVATE;
    }
  });
});
