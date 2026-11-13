import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { KRUG_DIMENSIONS, VIEWPORTS, type Assertion } from "@/lib/contracts";
import { extractPage } from "@/lib/browser/extract";
import { GraphBuilder, makeState, adjacency } from "@/lib/graph";
import { FixtureJevClient, scoreActions } from "@/lib/decisions/jev";
import { simulateTrajectories, selectTrajectories } from "@/lib/simulation";
import { extractPastDates, ruleFindings } from "@/lib/analysis/findings";
import { generateSpec } from "@/lib/analysis/spec";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { RUBRIC } from "@/lib/analysis/rubric";
import { patchesIdempotent } from "@/lib/variants";
import { assertPublicUrl } from "@/lib/fetch/guards";
import { Experiment } from "@/lib/contracts";

const CONFIG = JSON.parse(
  readFileSync(path.join(__dirname, "evals.config.json"), "utf8"),
) as { thresholds: Record<string, number | boolean> };
const T = CONFIG.thresholds;
const html = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const URL_ = "https://ai.engineer/code/2026";

const page = extractPage(html, URL_);
const builder = new GraphBuilder(30, 3);
const home = builder.add(
  makeState({
    url: URL_,
    viewport: VIEWPORTS.desktop,
    title: page.title,
    visibleText: page.visibleText,
    actions: page.actions,
  }),
).state;
const graph = builder.build();
const jev = new FixtureJevClient();
const ASSERTIONS: Assertion[] = [
  { kind: "text-present", value: "november" },
  { kind: "text-present", value: "san francisco" },
];

describe("eval: discovery coverage", () => {
  it("extracts enough actions/headings from the target", () => {
    expect(page.actions.length).toBeGreaterThanOrEqual(T.minActionsExtracted as number);
    expect(page.actions.filter((a) => a.role === "link").length).toBeGreaterThanOrEqual(
      T.minLinksExtracted as number,
    );
    expect(page.headings.length).toBeGreaterThanOrEqual(T.minHeadingsExtracted as number);
  });
});

describe("eval: simulation determinism + scale", () => {
  it("produces >= threshold trajectories, reproducible per seed", async () => {
    const { scored } = await scoreActions(jev, home, "find the conference schedule", "goal-directed");
    const weights = {
      byState: new Map([[home.stateId, new Map(scored.map((s) => [s.action.actionId, s.weight]))]]),
      ambiguity: new Map([[home.stateId, 0.3]]),
    };
    const args = {
      graph, startStateId: home.stateId, weights, assertions: ASSERTIONS,
      seed: 1337, count: T.simulatedTrajectories as number, maxDepth: 3,
    };
    const a = simulateTrajectories(args);
    const b = simulateTrajectories(args);
    expect(a.length).toBeGreaterThanOrEqual(T.simulatedTrajectories as number);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const outcomes = new Set(a.map((t) => t.outcome));
    expect(outcomes.size).toBeGreaterThanOrEqual(1);
    const selected = selectTrajectories(a, 8);
    expect(selected.length).toBe(8);
    void adjacency(graph);
  });
});

describe("eval: jev mapping validity", () => {
  it("scores map to known actionIds and rank goal-aligned actions top", async () => {
    const { scored, ambiguity } = await scoreActions(
      jev, home, "find the conference schedule", "goal-directed",
    );
    const ids = new Set(home.actions.map((a) => a.actionId));
    expect(scored.every((s) => ids.has(s.action.actionId))).toBe(true);
    expect(ambiguity).toBeLessThanOrEqual(T.maxAmbiguity as number);
    const top = scored.sort((x, y) => y.weight - x.weight)[0];
    expect(/schedule|agenda|program|sessions/i.test(top.action.label)).toBe(true);
  });
});

describe("eval: krug rubric coverage", () => {
  it("every rubric dimension is defined and citable", () => {
    for (const d of KRUG_DIMENSIONS) {
      expect(RUBRIC[d].question.length).toBeGreaterThan(10);
      expect(RUBRIC[d].principle.length).toBeGreaterThan(3);
    }
  });
});

describe("eval: findings quality on fixture", () => {
  it("detects the stale post-event registration CTA (Scenario B)", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const past = extractPastDates(page.visibleText, now);
    const findings = ruleFindings({
      states: [home], runs: [], assertions: ASSERTIONS,
      referenceNowIso: now.toISOString(),
    });
    const stale = findings.find((f) => /post-event|stale|invites registration/i.test(f.title));
    if (T.requireStaleDateFinding) {
      expect(past.length).toBeGreaterThan(0);
      expect(stale).toBeDefined();
      expect(stale?.evidenceType).toBe("reproducible-concern");
      expect(stale?.krugPrinciple).toBe("omit-words");
    }
    // every finding carries a valid krug principle + evidence class
    for (const f of findings) {
      expect(f.krugPrinciple.length).toBeGreaterThan(3);
      expect(["verified-failure", "reproducible-concern", "hypothesis"]).toContain(f.evidenceType);
    }
  });
});

describe("eval: spec completeness", () => {
  it("generates a change for every finding + rebuild phases", async () => {
    const findings = ruleFindings({
      states: [home], runs: [], assertions: ASSERTIONS,
      referenceNowIso: "2026-11-13T12:00:00Z",
    });
    const exp = Experiment.parse({
      id: "eval", targetUrl: URL_, goal: "can I still register?", status: "complete",
      createdAt: "2026-11-13T00:00:00Z", configuration: {},
      graph, findings,
      browserTests: [], simulations: [], variants: [], comparisons: [],
    });
    const spec = await generateSpec(exp, new FixtureLlmClient());
    expect(spec.changes.length).toBe(findings.length);
    const completeness =
      spec.changes.filter((c) => c.change.length > 5 && c.rationale.length > 5).length /
      Math.max(1, spec.changes.length);
    expect(completeness).toBeGreaterThanOrEqual(T.minSpecChangeCompleteness as number);
    expect(spec.rebuildPhases.length).toBeGreaterThanOrEqual(2);
    expect(spec.changes.every((c, i) => c.rank === i + 1)).toBe(true);
  });
});

describe("eval: variant reproducibility", () => {
  it("patch compilation is idempotent", () => {
    const patches = [
      { op: "insertNotice" as const, selector: "body", value: "This event has concluded." },
      { op: "relabel" as const, selector: "a[href*='apply']", value: "Watch recordings" },
    ];
    expect(patchesIdempotent(patches)).toBe(true);
  });
});

describe("eval: ssrf guards", () => {
  it("blocks private/localhost targets", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl(URL_)).resolves.toBeTruthy();
  });
});
