import type {
  AgentJourney,
  Assertion,
  BehavioralProfile,
  BrowserRunner,
  Endpoint,
  ExperimentConfig,
  IntentCategory,
  IntentProfile,
  JevClient,
  PersonaKind,
  PersonaSwarm,
  StateGraph,
  Trajectory,
  Viewport,
} from "../contracts";
import { withDecideCache } from "../decisions/jev";
import { CLASS_INTENTS } from "../intents/patterns";
import { mulberry32 } from "./index";

/**
 * The persona swarm: `maxAgents` cheap browser agents, each running one
 * PersonaJourney through the runner (one Function invocation per agent on
 * Browserbase). Persona mix is derived from what the site offers — endpoint
 * classes map to intent categories, intents map to personas — so a site heavy
 * on pricing gets mostly quotation-checkers.
 */

export const INTENT_PERSONA: Record<IntentCategory, PersonaKind> = {
  information: "info-seeker",
  quotation: "quotation-checker",
  proposal: "proposal-comparer",
};

/** Persona → behavioral profile used when a journey is replayed/recorded as a Trajectory. */
export const PERSONA_PROFILE: Record<PersonaKind, BehavioralProfile> = {
  "info-seeker": "exploratory",
  "quotation-checker": "impatient",
  "proposal-comparer": "goal-directed",
};

const TOP_JOURNEYS = 10;

/** Persona weights from what the site offers. Each endpoint contributes its weight to the persona(s) its class serves. */
export function personaWeights(
  endpoints?: Endpoint[],
  intents?: IntentProfile[],
): Record<PersonaKind, number> {
  const weights: Record<PersonaKind, number> = {
    "info-seeker": 1,
    "quotation-checker": 1,
    "proposal-comparer": 1,
  };
  if (endpoints && endpoints.length > 0) {
    for (const e of endpoints) {
      for (const intent of CLASS_INTENTS[e.class] ?? []) weights[INTENT_PERSONA[intent]] += e.weight;
    }
  } else {
    for (const i of intents ?? []) weights[INTENT_PERSONA[i.category]] += 1.5;
  }
  return weights;
}

function summarize(journeys: AgentJourney[]): Pick<
  PersonaSwarm,
  "dropOffDistribution" | "stateVisits" | "mostTravelled" | "mostDropped"
> {
  const dropOffDistribution: Record<string, number> = {};
  const stateVisits: Record<string, number> = {};
  const dropPoints = new Map<string, number>();
  for (const j of journeys) {
    for (const s of j.steps) stateVisits[s.stateHash] = (stateVisits[s.stateHash] ?? 0) + 1;
    if (j.dropOff) {
      dropOffDistribution[j.dropOff.reason] = (dropOffDistribution[j.dropOff.reason] ?? 0) + 1;
      dropPoints.set(j.dropOff.stateHash, (dropPoints.get(j.dropOff.stateHash) ?? 0) + 1);
    }
  }
  const popularity = (j: AgentJourney) =>
    j.steps.reduce((acc, s) => acc + (stateVisits[s.stateHash] ?? 0), 0);
  const mostTravelled = [...journeys]
    .sort((a, b) => popularity(b) - popularity(a) || b.steps.length - a.steps.length || a.agentId.localeCompare(b.agentId))
    .slice(0, TOP_JOURNEYS)
    .map((j) => j.agentId);
  const mostDropped = journeys
    .filter((j) => j.dropOff)
    .sort(
      (a, b) =>
        (dropPoints.get(b.dropOff!.stateHash) ?? 0) - (dropPoints.get(a.dropOff!.stateHash) ?? 0) ||
        b.steps.length - a.steps.length ||
        a.agentId.localeCompare(b.agentId),
    )
    .slice(0, TOP_JOURNEYS)
    .map((j) => j.agentId);
  return { dropOffDistribution, stateVisits, mostTravelled, mostDropped };
}

export async function runPersonaSwarm(args: {
  runner: BrowserRunner;
  url: string;
  goal: string;
  assertions: Assertion[];
  endpoints?: Endpoint[];
  intents?: IntentProfile[];
  config: ExperimentConfig;
  viewport: Viewport;
  /** Optional injected decision client (e.g. a fixture in tests), deduped across the swarm; runners select their own when absent. */
  jev?: JevClient;
}): Promise<PersonaSwarm> {
  const { runner, url, goal, assertions, config, viewport } = args;
  const run = runner.runPersonaJourney;
  if (!run) throw new Error(`${runner.name} does not support persona journeys`);
  const jev = args.jev && withDecideCache(args.jev);

  const weights = personaWeights(args.endpoints, args.intents);
  const kinds = Object.keys(weights) as PersonaKind[];
  const total = kinds.reduce((a, k) => a + weights[k], 0);
  const rng = mulberry32(config.seed);
  const personaMix: Record<string, number> = {};
  const personas: PersonaKind[] = [];
  for (let i = 0; i < config.maxAgents; i++) {
    let pick = rng() * total;
    let kind = kinds[0];
    for (const k of kinds) {
      pick -= weights[k];
      if (pick <= 0) {
        kind = k;
        break;
      }
    }
    personas.push(kind);
    personaMix[kind] = (personaMix[kind] ?? 0) + 1;
  }

  const journeys: AgentJourney[] = new Array(config.maxAgents);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(config.maxConcurrentAgents, config.maxAgents) },
    async () => {
      for (;;) {
        const i = cursor;
        cursor += 1;
        if (i >= config.maxAgents) return;
        const agentId = `agent-${String(i).padStart(4, "0")}`;
        const seed = config.seed * 100003 + i;
        try {
          journeys[i] = await run.call(runner, {
            agentId,
            url,
            viewport,
            persona: personas[i],
            goal,
            assertions,
            seed,
            maxSteps: config.maxStepsPerAgent,
            jev,
          });
        } catch {
          journeys[i] = {
            agentId,
            persona: personas[i],
            seed,
            steps: [],
            outcome: "dropped-off",
            dropOff: {
              reason: "error",
              atStep: 0,
              stateHash: "",
              url,
            },
            backtracks: 0,
          };
        }
      }
    },
  );
  await Promise.all(workers);

  return {
    seed: config.seed,
    viewport: viewport.name,
    agents: config.maxAgents,
    personaMix,
    journeys,
    ...summarize(journeys),
  };
}

/**
 * Pick verify candidates: interleave the most-dropped journeys (drop-off is
 * the interesting evidence) with the most-travelled, always keeping ≥1
 * goal-reached journey when one exists.
 */
export function selectJourneys(swarm: PersonaSwarm, n: number): AgentJourney[] {
  const byId = new Map(swarm.journeys.map((j) => [j.agentId, j]));
  const picked: AgentJourney[] = [];
  const seen = new Set<string>();
  const queues = [swarm.mostDropped, swarm.mostTravelled];
  const idx = [0, 0];
  while (picked.length < n) {
    let advanced = false;
    for (let q = 0; q < queues.length && picked.length < n; q++) {
      while (idx[q] < queues[q].length && seen.has(queues[q][idx[q]])) idx[q] += 1;
      if (idx[q] < queues[q].length) {
        const id = queues[q][idx[q]];
        idx[q] += 1;
        const j = byId.get(id);
        if (j) {
          picked.push(j);
          seen.add(id);
          advanced = true;
        }
      }
    }
    if (!advanced) break;
  }
  // The queues cap at TOP_JOURNEYS; fill any remaining slots with unselected journeys.
  for (const j of swarm.journeys) {
    if (picked.length >= n) break;
    if (seen.has(j.agentId)) continue;
    picked.push(j);
    seen.add(j.agentId);
  }
  if (!picked.some((j) => j.outcome === "goal-reached")) {
    const success = swarm.journeys.find((j) => j.outcome === "goal-reached");
    if (success) {
      if (picked.length >= n && picked.length > 0) picked[picked.length - 1] = success;
      else picked.push(success);
    }
  }
  return picked;
}

/**
 * Record emergent journeys as Trajectories so existing consumers (heat,
 * verify fallback, bench coverage) keep working. stateHash resolves to the
 * discovered stateId when the page was crawled; unvisited pages keep the hash.
 * Journey actions resolve to the graph actionId matching label/role/href on the
 * same state — synthetic `act_N` ids would never resolve in actionById lookups.
 */
export function journeysToTrajectories(swarm: PersonaSwarm, graph?: StateGraph): Trajectory[] {
  const hashToId = new Map((graph?.states ?? []).map((s) => [s.stateHash, s.stateId]));
  const actionIdByKey = new Map(
    (graph?.states ?? []).flatMap((s) =>
      s.actions.map((a) => [`${s.stateHash}|${a.role ?? "link"}|${a.label}|${a.href ?? ""}`, a.actionId] as const),
    ),
  );
  const resolveAction = (s: AgentJourney["steps"][number]): string | undefined =>
    s.action
      ? actionIdByKey.get(`${s.stateHash}|${s.action.role ?? "link"}|${s.action.label}|${s.action.href ?? ""}`)
      : undefined;
  return swarm.journeys.map((j) => ({
    trajectoryId: j.agentId,
    seed: j.seed,
    profile: PERSONA_PROFILE[j.persona],
    persona: j.persona,
    steps: j.steps.map((s) => ({
      stateId: hashToId.get(s.stateHash) ?? s.stateHash,
      actionId: resolveAction(s),
    })),
    outcome: j.outcome === "goal-reached" ? "goal-reached" : "dropped-off",
    backtracks: j.backtracks,
  }));
}
