import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Experiment,
  VIEWPORTS,
  type ActionNode,
  type Assertion,
  type BehavioralProfile,
  type Finding,
  type SimWeights,
  type SiteState,
  type StateGraph,
  type Trajectory,
} from "@/lib/contracts";
import { extractPage, isVagueLabel } from "@/lib/browser/extract";
import { GraphBuilder, makeState } from "@/lib/graph";
import { FixtureJevClient, scoreActions } from "@/lib/decisions/jev";
import {
  rankForVerification,
  selectTrajectories,
  simulateTrajectories,
} from "@/lib/simulation";
import { extractPastDates, ruleFindings } from "@/lib/analysis/findings";
import { generateSpec, specToMarkdown } from "@/lib/analysis/spec";
import { FixtureLlmClient } from "@/lib/analysis/gemini";

// stateIds/actionIds come from randomUUID, and FixtureJevClient's tiebreak jitter is keyed
// by actionId — so seed the ids to keep simulated outcomes bit-for-bit reproducible.
const uuid = vi.hoisted(() => ({ n: 0 }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () =>
    `${(uuid.n++).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000` as const;
  return { ...actual, default: { ...actual, randomUUID }, randomUUID };
});

const CONFIG = JSON.parse(
  readFileSync(path.join(__dirname, "evals.config.json"), "utf8"),
) as { thresholds: Record<string, number | boolean> };
const T = CONFIG.thresholds;
const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const AIE_URL = "https://ai.engineer/code/2026";
const VAGUE_URL = "https://workshops.example.com/spring";
const REFERENCE_NOW = "2026-11-13T12:00:00Z";
const aiePage = extractPage(fixture("aie-code-2026.html"), AIE_URL);
const vaguePage = extractPage(fixture("vague-labels.html"), VAGUE_URL);

function pageState(page: ReturnType<typeof extractPage>, url: string): SiteState {
  return makeState({
    url,
    viewport: VIEWPORTS.desktop,
    title: page.title,
    visibleText: page.visibleText,
    actions: page.actions,
  });
}

const SEVERITY_RANK: Record<Finding["severity"], number> = { critical: 4, high: 3, medium: 2, low: 1 };

// ── (a) profile shaping on a multi-state journey graph ──────────────────────

const JOURNEY_GOAL = "find the conference schedule";
const JOURNEY_ASSERTIONS: Assertion[] = [{ kind: "text-present", value: "full day-by-day timetable" }];

const link = (label: string, href: string): Omit<ActionNode, "actionId" | "stateId"> => ({
  type: "click", label, role: "link", href, enabled: true, safeToExecute: true,
});

/**
 * Home = the real AIE fixture page. "Schedule" leads to a hub whose day links
 * reach the goal; every other safe home action leads to a detour leaf whose only
 * action returns home. All edges are known, so the walk never self-loops.
 */
async function buildJourney(): Promise<{ graph: StateGraph; startStateId: string; weights: SimWeights }> {
  uuid.n = 0;
  const b = new GraphBuilder(1000, 3);
  const add = (args: Parameters<typeof makeState>[0]) => b.add(makeState(args)).state;
  const vp = VIEWPORTS.desktop;
  const back = link("Back to home", AIE_URL);

  const home = b.add(pageState(aiePage, AIE_URL)).state;
  const hub = add({
    url: `${AIE_URL}/schedule`, viewport: vp, title: "Schedule", visibleText: "Schedule. Pick a day.",
    actions: [
      link("Nov 11 sessions", `${AIE_URL}/schedule/nov-11`),
      link("Nov 12 sessions", `${AIE_URL}/schedule/nov-12`),
      link("Companies A–Z", `${AIE_URL}/companies`),
      back,
    ],
  });
  const day = (d: string) =>
    add({
      url: `${AIE_URL}/schedule/${d}`, viewport: vp, title: d,
      visibleText: `Full day-by-day timetable for ${d}.`, actions: [back],
    });
  const leaf = (slug: string, title: string) => {
    const s = add({ url: `${AIE_URL}/${slug}`, viewport: vp, title, visibleText: title, actions: [back] });
    b.link(s.stateId, s.actions[0].actionId, home.stateId);
    return s;
  };

  const [nov11, nov12, companies, hubBack] = hub.actions;
  b.link(hub.stateId, nov11.actionId, day("nov-11").stateId);
  b.link(hub.stateId, nov12.actionId, day("nov-12").stateId);
  b.link(hub.stateId, companies.actionId, leaf("companies", "Companies").stateId);
  b.link(hub.stateId, hubBack.actionId, home.stateId);

  let scheduleLinked = 0;
  home.actions
    .filter((a) => a.enabled && a.safeToExecute)
    .forEach((a, i) => {
      if (a.label === "Schedule") {
        b.link(home.stateId, a.actionId, hub.stateId);
        scheduleLinked++;
      } else {
        b.link(home.stateId, a.actionId, leaf(`detour/${i}`, a.label).stateId);
      }
    });
  expect(scheduleLinked).toBe(1);

  const graph = b.build();
  // Mirror the orchestrator: goal-directed Jev weights, profile shaping happens in simulation.
  const jev = new FixtureJevClient();
  const weights: SimWeights = { byState: new Map(), ambiguity: new Map() };
  for (const state of graph.states) {
    const { scored, ambiguity } = await scoreActions(jev, state, JOURNEY_GOAL, "goal-directed");
    weights.byState.set(state.stateId, new Map(scored.map((s) => [s.action.actionId, s.weight])));
    weights.ambiguity.set(state.stateId, ambiguity);
  }
  return { graph, startStateId: home.stateId, weights };
}

const PROFILE_SEEDS = [1337, 2026, 7];
const actionsTaken = (t: Trajectory) => t.steps.length - 1;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function simulateProfile(
  journey: Awaited<ReturnType<typeof buildJourney>>,
  profile: BehavioralProfile,
  seed: number,
): Trajectory[] {
  return simulateTrajectories({
    ...journey,
    assertions: JOURNEY_ASSERTIONS,
    seed,
    count: T.profileTrajectoriesPerSeed as number,
    maxDepth: 3,
    profiles: [profile],
  });
}

describe("eval: impatient vs exploratory mean steps to goal", () => {
  it("impatient reaches the goal in <= mean steps of exploratory on the same graph", async () => {
    const journey = await buildJourney();
    const home = journey.graph.states.find((s) => s.stateId === journey.startStateId)!;
    expect(home.visibleText.toLowerCase()).not.toContain(JOURNEY_ASSERTIONS[0].value);

    const goalSteps = (p: BehavioralProfile) =>
      PROFILE_SEEDS.flatMap((seed) => simulateProfile(journey, p, seed))
        .filter((t) => t.outcome === "goal-reached")
        .map(actionsTaken);
    const impatient = goalSteps("impatient");
    const exploratory = goalSteps("exploratory");
    expect(impatient.length).toBeGreaterThanOrEqual(T.minGoalReachedPerProfile as number);
    expect(exploratory.length).toBeGreaterThanOrEqual(T.minGoalReachedPerProfile as number);
    expect(mean(impatient) / mean(exploratory)).toBeLessThanOrEqual(
      T.maxImpatientToExploratoryStepRatio as number,
    );

    const rerun = simulateProfile(journey, "impatient", PROFILE_SEEDS[0]);
    const again = simulateProfile(await buildJourney(), "impatient", PROFILE_SEEDS[0]);
    expect(JSON.stringify(again)).toBe(JSON.stringify(rerun));
  });
});

// ── (b) verification ranking keeps a success path ───────────────────────────

const traj = (
  id: string,
  outcome: Trajectory["outcome"],
  steps: number,
  backtracks: number,
): Trajectory => ({
  trajectoryId: id,
  seed: 0,
  profile: "goal-directed",
  steps: Array.from({ length: steps }, (_, i) => ({ stateId: `s${i}` })),
  outcome,
  backtracks,
});

/** Adversarial pool: every goal-reached path has the lowest possible risk. */
function adversarialPool(): Trajectory[] {
  const pool: Trajectory[] = [];
  for (let i = 0; i < 20; i++) pool.push(traj(`fail${i}`, "terminal-failure", 12, 5));
  for (let i = 0; i < 10; i++) pool.push(traj(`dead${i}`, "dead-end", 8, 3));
  pool.push(traj("win0", "goal-reached", 2, 0), traj("win1", "goal-reached", 3, 0));
  return pool;
}

describe("eval: verification ranking retains a goal-reached trajectory", () => {
  it("rankForVerification keeps every trajectory, including goal-reached, with unique risk ranks", () => {
    const pool = adversarialPool();
    const ranked = rankForVerification(pool.map((t) => ({ ...t })));
    expect(ranked.length).toBe(pool.length);
    expect(new Set(ranked.map((t) => t.trajectoryId))).toEqual(new Set(pool.map((t) => t.trajectoryId)));
    expect(ranked.some((t) => t.outcome === "goal-reached")).toBe(true);
    const scores = ranked.map((t) => t.riskScore);
    expect(scores).toEqual([...scores].sort((a, b) => b! - a!));
    expect(new Set(scores).size).toBe(ranked.length);
  });

  it("top-N selection retains >= 1 goal-reached for every N when one exists", async () => {
    const journey = await buildJourney();
    const simulated = simulateTrajectories({
      ...journey, assertions: JOURNEY_ASSERTIONS, seed: 1337, count: 300, maxDepth: 3,
    });
    const pools = { adversarial: adversarialPool(), simulated };
    let checks = 0;
    let retained = 0;
    for (const [name, pool] of Object.entries(pools)) {
      expect(pool.some((t) => t.outcome === "goal-reached"), name).toBe(true);
      for (let n = 1; n <= Math.min(pool.length, 40); n++) {
        const picked = selectTrajectories(pool.map((t) => ({ ...t })), n);
        expect(picked.length, `${name} n=${n}`).toBe(n);
        checks++;
        if (picked.some((t) => t.outcome === "goal-reached")) retained++;
      }
    }
    expect(retained / checks).toBeGreaterThanOrEqual(T.minGoalRetentionRate as number);
  });

  it("does not fabricate a goal-reached trajectory when none exists", () => {
    const pool = adversarialPool().filter((t) => t.outcome !== "goal-reached");
    const picked = selectTrajectories(pool, 5);
    expect(picked.length).toBe(5);
    expect(picked.some((t) => t.outcome === "goal-reached")).toBe(false);
  });
});

// ── (c) spec ordering + phased rebuild plan ─────────────────────────────────

function syntheticFinding(id: string, severity: Finding["severity"], title: string): Finding {
  return {
    findingId: id,
    title,
    category: "clarity",
    severity,
    evidenceType: "hypothesis",
    description: `${title} — synthetic ${severity} finding for ordering eval.`,
    affectedStates: [],
    affectedActions: [],
    evidencePaths: [],
    recommendation: `Address: ${title}.`,
    verificationStatus: "unverified",
    krugPrinciple: "dont-make-me-think",
  };
}

describe("eval: spec ordering + rebuild plan", () => {
  it("orders changes by severity desc and emits phased rebuild plan sections", async () => {
    const home = pageState(aiePage, AIE_URL);
    const ruled = ruleFindings({ states: [home], runs: [], assertions: [], referenceNowIso: REFERENCE_NOW });
    // Interleave severities so input order is never already sorted.
    const findings: Finding[] = [
      syntheticFinding("syn-low-1", "low", "Footer social links lack labels"),
      ...ruled.slice(0, 1),
      syntheticFinding("syn-medium-1", "medium", "Search placeholder is cryptic"),
      syntheticFinding("syn-critical-1", "critical", "Checkout path unreachable"),
      ...ruled.slice(1),
      syntheticFinding("syn-low-2", "low", "Inconsistent date formats"),
      syntheticFinding("syn-high-1", "high", "Primary CTA below the fold on mobile"),
    ];
    expect(new Set(findings.map((f) => f.severity)).size).toBe(4);

    const exp = Experiment.parse({
      id: "eval-spec-order", targetUrl: AIE_URL, goal: "can I still register?", status: "complete",
      createdAt: "2026-11-13T00:00:00Z", configuration: {},
      findings, browserTests: [], simulations: [], variants: [], comparisons: [],
    });
    const spec = await generateSpec(exp, new FixtureLlmClient());
    const byId = new Map(findings.map((f) => [f.findingId, f]));

    expect(spec.changes.length).toBe(findings.length);
    expect(spec.changes.map((c) => c.rank)).toEqual(findings.map((_, i) => i + 1));
    const severities = spec.changes.map((c) => SEVERITY_RANK[byId.get(c.findingId!)!.severity]);
    for (let i = 1; i < severities.length; i++) {
      expect(severities[i], `change #${i + 1} outranks #${i}`).toBeLessThanOrEqual(severities[i - 1]);
    }
    // Stable within a severity tier: input order is preserved.
    const lows = spec.changes.filter((c) => byId.get(c.findingId!)!.severity === "low").map((c) => c.findingId);
    expect(lows).toEqual(["syn-low-1", "syn-low-2"]);

    expect(spec.rebuildPhases.length).toBeGreaterThanOrEqual(T.minRebuildPhases as number);
    expect(new Set(spec.rebuildPhases.map((p) => p.name)).size).toBe(spec.rebuildPhases.length);
    for (const p of spec.rebuildPhases) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.goal.length).toBeGreaterThan(5);
      expect(p.items.length).toBeGreaterThan(0);
    }
    // Critical/high changes land in the first phase.
    const urgent = spec.changes.filter((c) => SEVERITY_RANK[byId.get(c.findingId!)!.severity] >= 3);
    for (const c of urgent) expect(spec.rebuildPhases[0].items).toContain(c.title);

    const md = specToMarkdown(spec);
    const planAt = md.indexOf("## Rebuild plan");
    const changesAt = md.indexOf("## Changes (by impact)");
    expect(changesAt).toBeGreaterThanOrEqual(0);
    expect(planAt).toBeGreaterThan(changesAt);
    let cursor = planAt;
    for (const p of spec.rebuildPhases) {
      const at = md.indexOf(`### ${p.name}`, cursor);
      expect(at, `phase section "${p.name}"`).toBeGreaterThan(cursor);
      cursor = at;
    }
    let changeCursor = changesAt;
    for (const c of spec.changes) {
      const at = md.indexOf(`### ${c.rank}. ${c.title}`, changeCursor);
      expect(at).toBeGreaterThan(changeCursor);
      expect(at).toBeLessThan(planAt);
      changeCursor = at;
    }
  });
});

// ── (d) graph dedup by stateHash ────────────────────────────────────────────

describe("eval: graph dedup on fixture states", () => {
  it("collapses states with identical stateHash into one node", () => {
    const b = new GraphBuilder(50, 3);
    const first = b.add(pageState(aiePage, AIE_URL));
    const sameAgain = b.add(pageState(aiePage, AIE_URL));
    const reordered = b.add(
      makeState({
        url: AIE_URL, viewport: VIEWPORTS.desktop, title: "different title", visibleText: "different text",
        actions: [...aiePage.actions].reverse().map((a) => ({ ...a, label: a.label.toUpperCase() })),
      }),
    );
    expect(first.isNew).toBe(true);
    for (const dup of [sameAgain, reordered]) {
      expect(dup.isNew).toBe(false);
      expect(dup.state.stateId).toBe(first.state.stateId);
    }
    const mobile = b.add(
      makeState({
        url: AIE_URL, viewport: VIEWPORTS.mobile, title: aiePage.title,
        visibleText: aiePage.visibleText, actions: aiePage.actions,
      }),
    );
    expect(mobile.isNew).toBe(true);

    const graph = b.build();
    expect(graph.states.length).toBe(2);
    const perHash = new Map<string, number>();
    for (const s of graph.states) perHash.set(s.stateHash, (perHash.get(s.stateHash) ?? 0) + 1);
    expect(Math.max(...perHash.values())).toBeLessThanOrEqual(T.maxStatesPerStateHash as number);
  });

  it("journey graph has one node per stateHash and edges only reference canonical nodes", async () => {
    const { graph } = await buildJourney();
    const hashes = graph.states.map((s) => s.stateHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    const ids = new Set(graph.states.map((s) => s.stateId));
    for (const e of graph.edges) {
      expect(ids.has(e.fromStateId)).toBe(true);
      expect(ids.has(e.toStateId)).toBe(true);
    }
  });
});

// ── (e) vague-label finding lists the actual labels ─────────────────────────

describe("eval: vague-label finding lists the labels found on the page", () => {
  const vagueFinding = (findings: Finding[]) => findings.find((f) => /ambiguous link labels/i.test(f.title));

  it("names exactly the vague labels present on the vague-labels fixture", () => {
    const state = pageState(vaguePage, VAGUE_URL);
    const expected = state.actions.filter((a) => isVagueLabel(a.label));
    expect(expected.map((a) => a.label).sort()).toEqual(["Click here", "Learn more", "Read more", "here"]);
    expect(expected.length).toBeGreaterThanOrEqual(T.minVagueLabelsDetected as number);

    const f = vagueFinding(ruleFindings({ states: [state], runs: [], assertions: [], referenceNowIso: REFERENCE_NOW }));
    expect(f).toBeDefined();
    expect(f!.title).toContain(`(${expected.length})`);
    for (const a of expected) expect(f!.description).toContain(`"${a.label}"`);
    expect(f!.affectedActions.sort()).toEqual(expected.map((a) => a.actionId).sort());
    for (const a of state.actions.filter((x) => !isVagueLabel(x.label))) {
      expect(f!.description).not.toContain(`"${a.label}"`);
    }
    expect(f!.krugPrinciple).toBe("dont-make-me-think");
    expect(f!.evidenceType).toBe("reproducible-concern");
  });

  it("emits no vague-label finding when the page has none (AIE fixture)", () => {
    const state = pageState(aiePage, AIE_URL);
    expect(state.actions.some((a) => isVagueLabel(a.label))).toBe(false);
    const findings = ruleFindings({ states: [state], runs: [], assertions: [], referenceNowIso: REFERENCE_NOW });
    expect(vagueFinding(findings)).toBeUndefined();
  });
});

// ── (f) stale-date finding cites the detected past dates ────────────────────

describe("eval: stale-date finding evidence includes detected past dates", () => {
  const staleFinding = (findings: Finding[]) => findings.find((f) => /post-event|stale/i.test(f.title));
  const run = (nowIso: string) => {
    const state = pageState(aiePage, AIE_URL);
    return {
      state,
      past: extractPastDates(state.visibleText, new Date(nowIso)),
      finding: staleFinding(ruleFindings({ states: [state], runs: [], assertions: [], referenceNowIso: nowIso })),
    };
  };

  it("lists every detected past date in the finding description", () => {
    const { state, past, finding } = run(REFERENCE_NOW);
    expect(past.length).toBeGreaterThanOrEqual(T.minPastDatesDetected as number);
    expect(past).toContain("NOV 10-12, 2026");
    expect(finding).toBeDefined();
    if (T.requireStaleDateEvidence) {
      for (const d of past) expect(finding!.description).toContain(d);
    }
    expect(finding!.affectedStates).toEqual([state.stateId]);
    const ctaLabels = finding!.affectedActions.map((id) => state.actions.find((a) => a.actionId === id)!.label);
    expect(ctaLabels.length).toBeGreaterThan(0);
    for (const l of ctaLabels) expect(l).toMatch(/\b(apply|register)\b/i);
  });

  it("does not flag the event as stale before it ends", () => {
    for (const nowIso of ["2026-11-01T12:00:00Z", "2026-11-12T12:00:00Z"]) {
      const { past, finding } = run(nowIso);
      expect(past, nowIso).toEqual([]);
      expect(finding, nowIso).toBeUndefined();
    }
  });
});
