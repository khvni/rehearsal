import { describe, expect, it } from "vitest";
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
