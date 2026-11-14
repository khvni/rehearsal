import type { Endpoint, EndpointJourney, StateGraph } from "../contracts";
import { adjacency } from "../graph";
import { mulberry32 } from "../simulation";
import { classifyAction } from "./patterns";

/**
 * Seeded "information scent" walks toward each endpoint: a visitor seeking an
 * endpoint prefers links whose label/path matches its class and strongly prefers
 * the endpoint's own CTA. Reached = landing on the endpoint state, or on the
 * state that holds its CTA (+1 click). Deterministic for (graph, endpoints, seed).
 */
export function endpointJourneys(
  graph: StateGraph,
  endpoints: Endpoint[],
  opts: { seed: number; maxDepth: number; perEndpoint?: number; maxEndpoints?: number },
): EndpointJourney[] {
  const start = graph.states[0];
  if (!start) return [];
  const adj = adjacency(graph);
  const per = opts.perEndpoint ?? 200;
  const maxSteps = opts.maxDepth * 3;
  const known = new Set(graph.states.map((s) => s.stateId));

  return endpoints.slice(0, opts.maxEndpoints ?? 12).map((ep, epIndex) => {
    const target = ep.stateId && known.has(ep.stateId) ? ep.stateId : ep.sourceStateId;
    const viaCta = !(ep.stateId && known.has(ep.stateId));
    const ctaLabel = viaCta ? ep.label : undefined;
    if (!target || !known.has(target)) {
      return { endpointId: ep.endpointId, trajectories: per, goalReached: 0, samplePath: [] };
    }
    const steps: number[] = [];
    let best: string[] | undefined;
    for (let i = 0; i < per; i++) {
      const rng = mulberry32(opts.seed + epIndex * 7919 + i);
      let current = start.stateId;
      const path: string[] = [];
      const visits = new Map([[current, 1]]);
      for (let depth = 0; depth <= maxSteps; depth++) {
        if (current === target) {
          const full = ctaLabel ? [...path, ctaLabel] : path;
          steps.push(full.length);
          if (!best || full.length < best.length) best = full;
          break;
        }
        const entries = (adj.get(current) ?? []).filter((e) => e.toStateId);
        if (entries.length === 0) break;
        const w = entries.map(({ action }) =>
          1 + (classifyAction(action) === ep.class ? 4 : 0) + (action.actionId === ep.actionId ? 8 : 0),
        );
        let pick = rng() * w.reduce((a, b) => a + b, 0);
        let idx = 0;
        while (idx < w.length - 1 && (pick -= w[idx]) > 0) idx++;
        const chosen = entries[idx];
        path.push(chosen.action.label);
        current = chosen.toStateId!;
        const seen = (visits.get(current) ?? 0) + 1;
        visits.set(current, seen);
        if (seen >= 3) break;
      }
    }
    steps.sort((a, b) => a - b);
    return {
      endpointId: ep.endpointId,
      trajectories: per,
      goalReached: steps.length,
      medianSteps: steps.length ? steps[Math.floor((steps.length - 1) / 2)] : undefined,
      samplePath: best ?? [],
    };
  });
}
