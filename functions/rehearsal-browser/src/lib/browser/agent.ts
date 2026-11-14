import type { AgentCandidate, AgentDriver, AgentRunArgs, BrowserRun, TrajectoryAction } from "../contracts";
import { evaluateAssertion, shouldShoot, summarizeRun } from "./types";

function observeInstruction(a: TrajectoryAction, goal: string): string {
  return `Find the ${a.role ?? "element"} labelled "${a.label}" — the next step toward: ${goal}`;
}

function actInstruction(a: TrajectoryAction, best: AgentCandidate | undefined): string {
  if (best?.description) return best.method ? `${best.method} ${best.description}` : best.description;
  return `click the ${a.role ?? "element"} labelled "${a.label}"`;
}

/**
 * Agent-driven trajectory: per action, observe() for candidates, then act() on the best one
 * (or act() directly when observe finds nothing — Stagehand act self-heals). Assertions and
 * screenshots follow the same cadence and summary as the scripted runners.
 */
export async function agentLoop(
  driver: AgentDriver,
  args: AgentRunArgs,
  shoot: (name: string) => Promise<string | null>,
): Promise<BrowserRun> {
  const started = Date.now();
  const errors: string[] = [];
  const steps: BrowserRun["steps"] = [];
  const screenshots: string[] = [];
  const assertions: BrowserRun["assertions"] = [];
  try {
    const total = Math.min(args.actions.length, args.maxSteps ?? 12);
    for (let i = 0; i < total; i++) {
      const a = args.actions[i];
      try {
        const candidates = await driver.observe(observeInstruction(a, args.goal));
        const res = await driver.act(actInstruction(a, candidates[0]));
        steps.push(
          res.ok
            ? { actionId: a.actionId, label: a.label, ok: true }
            : { actionId: a.actionId, label: a.label, ok: false, error: `act failed: ${res.detail ?? ""}`.slice(0, 160) },
        );
      } catch (e) {
        steps.push({ actionId: a.actionId, label: a.label, ok: false, error: String(e).slice(0, 160) });
      }
      if (shouldShoot(i, total)) {
        const shot = await shoot(`${args.runId}_${i + 1}`).catch(() => null);
        if (shot) screenshots.push(shot);
      }
    }
    const probe = driver.probe();
    for (const assertion of args.assertions) {
      assertions.push({ assertion, passed: await evaluateAssertion(probe, assertion) });
    }
  } catch (e) {
    errors.push(`run: ${String(e).slice(0, 200)}`);
  }
  return summarizeRun({ runId: args.runId, viewport: args.viewport, started, steps, assertions, errors, screenshots });
}
