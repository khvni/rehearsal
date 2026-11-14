import type {
  AgentJourney,
  AgentStep,
  DropOffReason,
  JevClient,
  PersonaDriver,
  PersonaJourneyArgs,
} from "../contracts";
import { stateHashFor } from "../browser/extract";
import { evaluateAssertion } from "../browser/types";
import { mulberry32 } from "./index";

/**
 * The emergent-journey engine: one persona agent navigates the live site.
 * Each step takes a page snapshot, scores every candidate action plus a
 * reserved "leave" option in ONE batched Jev decide() call (never per action),
 * and a seeded RNG samples the winner. The agent quits when nothing looks
 * promising — the drop-off point and reason are the first-class result.
 */

export const LEAVE_OPTION_KEY = "__leave__";
export const NEXT_STEP_QUESTION = "next_step";
export const LEAVE_REASON_QUESTION = "leave_reason";

/** Reasons Jev may cite when the agent chooses to leave (involuntary reasons are set by the loop). */
const VOLUNTARY_REASONS: DropOffReason[] = ["nothing-promising", "confused", "lost-interest", "going-in-circles"];
const REASON_COPY: Record<string, string> = {
  "nothing-promising": "no offered action looked relevant to the goal",
  confused: "the page was confusing or the next step was unclear",
  "lost-interest": "the goal stopped seeming worth more effort",
  "going-in-circles": "options kept leading back to the same places",
};

const REVISIT_LIMIT = 3;
const MAX_CONSECUTIVE_FAILURES = 2;
const MAX_CANDIDATES = 24;

function sample(distribution: Record<string, number>, rng: () => number, keys: string[]): string {
  const order = keys.filter((k) => k in distribution);
  const rest = keys.filter((k) => !(k in distribution));
  const entries = [...order, ...rest].map((k) => [k, distribution[k] ?? 0.001] as const);
  let pick = rng();
  let chosen = entries.at(-1)?.[0] ?? keys[0];
  for (const [k, w] of entries) {
    pick -= w;
    if (pick <= 0) {
      chosen = k;
      break;
    }
  }
  return chosen;
}

export async function personaJourneyLoop(
  driver: PersonaDriver,
  jev: JevClient,
  args: PersonaJourneyArgs,
): Promise<AgentJourney> {
  const rng = mulberry32(args.seed);
  const steps: AgentStep[] = [];
  const seen = new Map<string, number>();
  let backtracks = 0;
  let failures = 0;

  const journey = (outcome: AgentJourney["outcome"], reason?: DropOffReason): AgentJourney => {
    const j: AgentJourney = {
      agentId: args.agentId,
      persona: args.persona,
      seed: args.seed,
      steps,
      outcome,
      backtracks,
    };
    const last = steps.at(-1);
    if (reason && last) {
      j.dropOff = { reason, atStep: steps.length - 1, stateHash: last.stateHash, url: last.url };
    }
    return j;
  };

  for (let i = 0; i < args.maxSteps; i++) {
    const snap = await driver.snapshot();
    const stateHash = stateHashFor(snap.url, args.viewport.name, snap.actions, false);
    const step: AgentStep = { stateHash, url: snap.url, title: snap.title };
    steps.push(step);
    const count = (seen.get(stateHash) ?? 0) + 1;
    seen.set(stateHash, count);
    if (i > 0 && count > 1) backtracks += 1;

    const probe = driver.probe();
    for (const assertion of args.assertions) {
      if (await evaluateAssertion(probe, assertion)) return journey("goal-reached");
    }

    if (count >= REVISIT_LIMIT) return journey("dropped-off", "going-in-circles");

    const candidates = snap.candidates.slice(0, MAX_CANDIDATES);
    if (candidates.length === 0) return journey("dropped-off", "dead-end");

    const criteria: Record<string, string> = Object.fromEntries(
      candidates.map((c, k) => [`c${k}`, `${c.label} — ${c.role ?? "link"}${c.href ? ` → ${c.href}` : ""}`]),
    );
    criteria[LEAVE_OPTION_KEY] = "leave this site and abandon the goal";

    // One batched scoring call per step covers every candidate + the leave option + the abandon reason.
    const results = await jev.decide(
      {
        goal: args.goal,
        persona: args.persona,
        state: {
          url: snap.url,
          title: snap.title,
          text: snap.visibleText.slice(0, 800),
          stepIndex: i,
          historyNote: "persona swarm journey",
        },
      },
      [
        {
          type: "choice",
          name: NEXT_STEP_QUESTION,
          instructions:
            `You are a ${args.persona} visitor with this goal. Score each candidate on how well it ` +
            `advances the goal for this persona. '${LEAVE_OPTION_KEY}' is a real option: visitors ` +
            `abandon a site when nothing looks promising, when it confuses them, or when the goal ` +
            `seems not worth more effort.`,
          criteria,
        },
        {
          type: "choice",
          name: LEAVE_REASON_QUESTION,
          instructions: "If this visitor abandons the site here, what is the most likely reason?",
          criteria: Object.fromEntries(VOLUNTARY_REASONS.map((r) => [r, REASON_COPY[r]])),
        },
      ],
    );

    const dist = results.find((r) => r.question === NEXT_STEP_QUESTION)?.distribution ?? {};
    const keys = [...candidates.map((_, k) => `c${k}`), LEAVE_OPTION_KEY];
    const chosenKey = sample(dist, rng, keys);

    if (chosenKey === LEAVE_OPTION_KEY) {
      const reasonDist = results.find((r) => r.question === LEAVE_REASON_QUESTION)?.distribution ?? {};
      const sampled = sample(reasonDist, rng, VOLUNTARY_REASONS);
      const reason = (DropOffReasonSafeParse(sampled) ?? "nothing-promising") as DropOffReason;
      const j = journey("dropped-off", reason);
      const shot = await driver.screenshot(`${args.agentId}_drop`).catch(() => null);
      if (j.dropOff && shot) j.dropOff.screenshotPath = shot;
      return j;
    }

    const action = candidates[Number(chosenKey.slice(1))] ?? candidates[0];
    step.action = action;
    const res = await driver.act(action).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160),
    }));
    step.ok = res.ok;
    if (!res.ok) {
      step.error = res.error;
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) return journey("dropped-off", "error");
    } else {
      failures = 0;
    }
  }
  return journey("dropped-off", "max-steps");
}

function DropOffReasonSafeParse(value: string): DropOffReason | undefined {
  return (VOLUNTARY_REASONS as string[]).includes(value) ? (value as DropOffReason) : undefined;
}
