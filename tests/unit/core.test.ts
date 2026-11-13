import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Experiment,
  ExperimentConfig,
  Finding,
  SiteState,
  SpecReport,
  VIEWPORTS,
} from "@/lib/contracts";
import { extractPage, isVagueLabel, normalizeUrl, stateHashFor } from "@/lib/browser/extract";
import { GraphBuilder, makeState } from "@/lib/graph";
import { mulberry32, simulateTrajectories, selectTrajectories, applyProfile } from "@/lib/simulation";
import { FixtureJevClient, scoreActions } from "@/lib/decisions/jev";
import { compilePatches, patchesIdempotent } from "@/lib/variants";
import { extractPastDates, ruleFindings } from "@/lib/analysis/findings";
import { specToMarkdown } from "@/lib/analysis/spec";
import { summarizeRun } from "@/lib/browser/types";
import { GeminiClient } from "@/lib/analysis/gemini";

const FIXTURE = path.join(__dirname, "..", "evals", "fixtures", "aie-code-2026.html");
const aieHtml = readFileSync(FIXTURE, "utf8");
const AIE_URL = "https://ai.engineer/code/2026";

describe("contracts", () => {
  it("parses a full experiment", () => {
    const e = Experiment.parse({
      id: "exp_t", targetUrl: AIE_URL, goal: "g", status: "created",
      createdAt: new Date().toISOString(), configuration: {},
    });
    expect(e.configuration.maxStates).toBe(30);
    expect(ExperimentConfig.parse({}).trajectories).toBe(1000);
  });

  it("rejects invalid finding evidence type", () => {
    const base = {
      findingId: "f1", title: "t", category: "clarity", severity: "high",
      evidenceType: "not-real", description: "d", affectedStates: [],
      recommendation: "r", verificationStatus: "verified", krugPrinciple: "conventions",
    };
    expect(() => Finding.parse(base)).toThrow();
  });
});

describe("extract", () => {
  it("extracts actions, title, text from the AIE fixture", () => {
    const page = extractPage(aieHtml, AIE_URL);
    expect(page.title.toLowerCase()).toContain("ai engineer code summit");
    expect(page.actions.length).toBeGreaterThan(20);
    expect(page.actions.some((a) => a.role === "link" && a.href)).toBe(true);
    expect(page.headings.length).toBeGreaterThan(0);
  });

  it("flags vague labels", () => {
    expect(isVagueLabel("Learn more")).toBe(true);
    expect(isVagueLabel("Schedule")).toBe(false);
  });

  it("normalizes URLs deterministically", () => {
    expect(normalizeUrl("https://a.b/x/?y=1#f")).toBe("https://a.b/x");
  });
});

describe("graph dedup", () => {
  it("dedupes states by stateHash", () => {
    const builder = new GraphBuilder(10, 3);
    const args = {
      url: AIE_URL, viewport: VIEWPORTS.desktop, title: "t", visibleText: "x",
      actions: [{ type: "click" as const, label: "Schedule", role: "link", href: `${AIE_URL}/schedule`, enabled: true, safeToExecute: true }],
    };
    const a = builder.add(makeState(args));
    const b = builder.add(makeState(args));
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(b.state.stateHash).toBe(a.state.stateHash);
    expect(builder.build().states.length).toBe(1);
  });

  it("stateHash differs across viewports", () => {
    const actions = [{ label: "x", role: "link" }];
    expect(stateHashFor("https://a.b/", "desktop", actions, false)).not.toBe(
      stateHashFor("https://a.b/", "mobile", actions, false),
    );
  });
});

describe("simulation determinism", () => {
  const state = makeState({
    url: AIE_URL, viewport: VIEWPORTS.desktop, title: "AIE", visibleText: "conference schedule tickets",
    actions: [
      { type: "click" as const, label: "Schedule", role: "link", href: `${AIE_URL}#schedule`, enabled: true, safeToExecute: true },
      { type: "click" as const, label: "Apply", role: "link", href: `${AIE_URL}#apply`, enabled: true, safeToExecute: true },
    ],
  });
  const graph = { states: [state], edges: [] };

  it("same seed → identical trajectories", () => {
    const weights = { byState: new Map([[state.stateId, new Map([[state.actions[0].actionId, 0.7], [state.actions[1].actionId, 0.3]])]]), ambiguity: new Map() };
    const args = { graph, startStateId: state.stateId, weights, assertions: [{ kind: "text-present" as const, value: "schedule" }], seed: 42, count: 200, maxDepth: 3 };
    const a = simulateTrajectories(args);
    const b = simulateTrajectories(args);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBe(200);
  });

  it("mulberry32 is seeded", () => {
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it("profiles reshape weights", () => {
    const w = new Map([["a", 0.8], ["b", 0.2]]);
    const impatient = applyProfile(w, "impatient", 0);
    expect(impatient.get("a")!).toBeGreaterThan(impatient.get("b")!);
    const exploratory = applyProfile(w, "exploratory", 0);
    expect(exploratory.get("a")! / exploratory.get("b")!).toBeLessThan(4);
  });

  it("selectTrajectories keeps a success path when present", () => {
    const ts = [
      { trajectoryId: "t0", seed: 1, profile: "goal-directed" as const, steps: [], outcome: "terminal-failure" as const, backtracks: 4 },
      { trajectoryId: "t1", seed: 2, profile: "goal-directed" as const, steps: [], outcome: "goal-reached" as const, backtracks: 0 },
    ];
    const sel = selectTrajectories(ts, 1);
    expect(sel[0].outcome).toBe("goal-reached");
  });
});

describe("jev fixture client", () => {
  it("maps distribution to known actionIds and picks the goal-aligned action", async () => {
    const jev = new FixtureJevClient();
    const state: SiteState = makeState({
      url: AIE_URL, viewport: VIEWPORTS.desktop, title: "AIE", visibleText: "",
      actions: [
        { type: "click" as const, label: "View schedule", role: "link", href: "#s", enabled: true, safeToExecute: true },
        { type: "click" as const, label: "Sponsor us", role: "link", href: "#sp", enabled: true, safeToExecute: true },
      ],
    });
    const { scored, ambiguity } = await scoreActions(jev, state, "find the conference schedule", "goal-directed");
    expect(scored.length).toBe(2);
    expect(scored.every((s) => state.actions.some((a) => a.actionId === s.action.actionId))).toBe(true);
    const top = scored.sort((x, y) => y.weight - x.weight)[0];
    expect(top.action.label.toLowerCase()).toContain("schedule");
    expect(ambiguity).toBeGreaterThanOrEqual(0);
    expect(ambiguity).toBeLessThanOrEqual(1);
  });
});

describe("variants", () => {
  it("compiles patches deterministically", () => {
    const patches = [{ op: "insertNotice" as const, selector: "body", value: "hi" }];
    expect(patchesIdempotent(patches)).toBe(true);
    expect(compilePatches(patches)).toContain("insertNotice");
  });
});

describe("rule findings", () => {
  it("detects stale post-event registration CTA on the AIE fixture", () => {
    const page = extractPage(aieHtml, AIE_URL);
    const state = makeState({
      url: AIE_URL, viewport: VIEWPORTS.desktop, title: page.title, visibleText: page.visibleText,
      actions: page.actions,
    });
    const now = new Date("2026-11-13T12:00:00Z");
    const past = extractPastDates(page.visibleText, now);
    expect(past.length).toBeGreaterThan(0);
    const findings = ruleFindings({ states: [state], runs: [], assertions: [], referenceNowIso: now.toISOString() });
    const stale = findings.find((f) => /post-event|stale|invites registration/i.test(f.title));
    expect(stale).toBeDefined();
    expect(stale?.krugPrinciple).toBe("omit-words");
  });
});

describe("browser run success", () => {
  const base = {
    runId: "r1", viewport: VIEWPORTS.desktop, started: Date.now(),
    steps: [{ label: "Hackathons", ok: true }],
    assertions: [{ assertion: { kind: "url-matches" as const, value: "hackathon" }, passed: true }],
    screenshots: [],
  };

  it("passes when navigation completes and the goal assertion holds, despite console errors", () => {
    const run = summarizeRun({ ...base, errors: ["console: Failed to load resource", "pageerror: x is undefined"] });
    expect(run.success).toBe(true);
    expect(run.consoleErrorCount).toBe(2);
  });

  it("fails on a failed assertion, a failed step, or a runner error", () => {
    expect(summarizeRun({ ...base, errors: [], assertions: [{ ...base.assertions[0], passed: false }] }).success).toBe(false);
    expect(summarizeRun({ ...base, errors: [], steps: [{ label: "x", ok: false }] }).success).toBe(false);
    const crashed = summarizeRun({ ...base, errors: ["run: Timeout 30000ms exceeded"] });
    expect(crashed.success).toBe(false);
    expect(crashed.consoleErrorCount).toBe(0);
  });

  it("emits one low-severity console-errors finding per viewport, citing K9", () => {
    const state = makeState({ url: AIE_URL, viewport: VIEWPORTS.desktop, title: "AIE", visibleText: "", actions: [] });
    const noisy = summarizeRun({ ...base, errors: ["console: boom"] });
    const clean = summarizeRun({ ...base, runId: "r2", errors: [] });
    const findings = ruleFindings({ states: [state], runs: [noisy, clean, { ...noisy, runId: "r3" }], assertions: [] });
    const f = findings.filter((x) => x.findingId.startsWith("f_console-errors_"));
    expect(f).toHaveLength(1);
    expect(f[0].findingId).toBe("f_console-errors_desktop");
    expect(f[0].severity).toBe("low");
    expect(f[0].krugPrinciple).toBe("testing-beats-arguing");
    expect(f[0].affectedStates).toEqual([state.stateId]);
    expect(f[0].description).toContain("2 page/console errors across 2 of 3 desktop runs");
    expect(ruleFindings({ states: [state], runs: [clean], assertions: [] }).some((x) => x.findingId.startsWith("f_console-errors_"))).toBe(false);
  });
});

describe("gemini call budget", () => {
  it("caps calls per run at REHEARSAL_GEMINI_MAX_CALLS and resets per run", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("REHEARSAL_GEMINI_MAX_CALLS", "2");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const llm = new GeminiClient();
      await expect(llm.complete("a")).resolves.toBe("ok");
      await expect(llm.complete("b")).resolves.toBe("ok");
      await expect(llm.complete("c")).rejects.toThrow(/budget/);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      llm.resetBudget();
      await expect(llm.complete("d")).resolves.toBe("ok");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("spec markdown", () => {
  it("renders a spec with changes + rebuild phases", () => {
    const spec = SpecReport.parse({
      targetUrl: AIE_URL, goal: "g", generatedAt: "2026-11-13T00:00:00Z",
      summary: "s", baselineRunIds: [],
      changes: [{ rank: 1, title: "Fix stale CTA", change: "Replace apply with recordings", rationale: "dates passed", effort: "S", evidencePaths: [], krugPrinciple: "omit-words" }],
      rebuildPhases: [{ name: "Truth pass", goal: "g", items: ["fix dates"] }],
    });
    const md = specToMarkdown(spec);
    expect(md).toContain("Fix stale CTA");
    expect(md).toContain("Truth pass");
  });
});
