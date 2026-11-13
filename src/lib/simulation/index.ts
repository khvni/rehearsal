import type {
  Assertion,
  BehavioralProfile,
  SiteState,
  StateGraph,
  Trajectory,
  TrajectoryOutcome,
} from "../contracts";
import { adjacency } from "../graph";

/** Deterministic PRNG (mulberry32). Same seed → identical sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimWeights {
  /** stateId -> actionId -> weight (from Jev scoring, profile-reweighted) */
  byState: Map<string, Map<string, number>>;
  /** stateId -> ambiguity score 0..1 */
  ambiguity: Map<string, number>;
}

export function applyProfile(
  weights: Map<string, number>,
  profile: BehavioralProfile,
  depth: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, w] of weights) {
    let v = w;
    if (profile === "impatient") v = Math.pow(w, 1.8); // sharpen toward top choice
    if (profile === "exploratory") v = Math.sqrt(w); // flatten — more detours
    if (profile === "goal-directed" && depth > 4) v *= 0.8;
    out.set(k, v);
  }
  return out;
}

/** Local goal check used inside simulation (no browser): text overlap with assertions. */
export function goalSatisfiedInState(state: SiteState, assertions: Assertion[]): boolean {
  if (assertions.length === 0) return false;
  const hay = `${state.pageTitle}\n${state.visibleText}`.toLowerCase();
  return assertions.some((a) => {
    if (a.kind === "text-present") return hay.includes(a.value.toLowerCase());
    if (a.kind === "url-matches") return state.url.toLowerCase().includes(a.value.toLowerCase());
    return false;
  });
}

/**
 * Sample `count` trajectories over the graph. Deterministic for a given seed:
 * identical (graph, weights, seed, count) => identical trajectories.
 */
export function simulateTrajectories(args: {
  graph: StateGraph;
  startStateId: string;
  weights: SimWeights;
  assertions: Assertion[];
  seed: number;
  count: number;
  maxDepth: number;
  profiles?: BehavioralProfile[];
}): Trajectory[] {
  const { graph, startStateId, weights, assertions, seed, count, maxDepth } = args;
  const profiles = args.profiles ?? ["goal-directed", "impatient", "exploratory"];
  const stateById = new Map(graph.states.map((s) => [s.stateId, s]));
  const adj = adjacency(graph);
  const trajectories: Trajectory[] = [];

  for (let i = 0; i < count; i++) {
    const rng = mulberry32(seed + i);
    const profile = profiles[i % profiles.length];
    const steps: { stateId: string; actionId?: string }[] = [{ stateId: startStateId }];
    const visited = new Map<string, number>([[startStateId, 1]]);
    let current = startStateId;
    let backtracks = 0;
    let outcome: TrajectoryOutcome = "max-depth";

    for (let depth = 0; depth < maxDepth * 3; depth++) {
      const state = stateById.get(current);
      if (!state) {
        outcome = "terminal-failure";
        break;
      }
      if (goalSatisfiedInState(state, assertions)) {
        outcome = "goal-reached";
        break;
      }
      const entries = adj.get(current) ?? [];
      if (entries.length === 0) {
        outcome = "dead-end";
        break;
      }
      const rawWeights = new Map<string, number>();
      for (const { action } of entries) {
        rawWeights.set(action.actionId, weights.byState.get(current)?.get(action.actionId) ?? 0.01);
      }
      const shaped = applyProfile(rawWeights, profile, depth);
      const total = [...shaped.values()].reduce((a, b) => a + b, 0);
      let pick = rng() * total;
      let chosen = entries[0];
      for (const { action, toStateId } of entries) {
        pick -= shaped.get(action.actionId) ?? 0;
        if (pick <= 0) {
          chosen = { action, toStateId };
          break;
        }
      }
      const nextId = chosen.toStateId ?? current;
      steps.push({ stateId: nextId, actionId: chosen.action.actionId });
      const seen = (visited.get(nextId) ?? 0) + 1;
      visited.set(nextId, seen);
      if (seen > 1) backtracks++;
      if (seen >= 3) {
        outcome = "repetition-limit";
        break;
      }
      current = nextId;
    }

    trajectories.push({
      trajectoryId: `t${i}`,
      seed: seed + i,
      profile,
      steps,
      outcome,
      backtracks,
    });
  }
  return trajectories;
}

/** Rank trajectories by information value for browser verification. */
export function rankForVerification(trajectories: Trajectory[]): Trajectory[] {
  const scored = trajectories.map((t) => {
    let risk = 0;
    if (t.outcome === "terminal-failure") risk += 4;
    if (t.outcome === "dead-end") risk += 3;
    if (t.outcome === "repetition-limit") risk += 2;
    risk += Math.min(t.backtracks, 5);
    risk += Math.min(t.steps.length / 10, 2);
    if (t.outcome === "goal-reached") risk += 1; // always verify a success path too
    return { t, risk };
  });
  scored.sort((a, b) => b.risk - a.risk);
  scored.forEach(({ t }, i) => {
    t.riskScore = scored.length - i;
  });
  return scored.map(({ t }) => t);
}

/** Pick top-N verification candidates, always including ≥1 goal-reached if present. */
export function selectTrajectories(trajectories: Trajectory[], n: number): Trajectory[] {
  const ranked = rankForVerification(trajectories);
  const picked = ranked.slice(0, n);
  if (!picked.some((t) => t.outcome === "goal-reached")) {
    const success = ranked.find((t) => t.outcome === "goal-reached");
    if (success) picked[picked.length - 1] = success;
  }
  return picked;
}
