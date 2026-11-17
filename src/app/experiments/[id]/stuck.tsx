"use client";

import { useMemo } from "react";
import type { StateGraph as Graph, Trajectory, TrajectoryOutcome, TrajectoryStep } from "@/lib/contracts";
import { ArrowIcon } from "../../_components/icons";
import { Badge } from "@/components/ui/badge";

const OUTCOME_LABEL: Record<TrajectoryOutcome, string> = {
  "goal-reached": "Reached goal",
  "terminal-failure": "Failed",
  "repetition-limit": "Looped",
  "max-depth": "Ran out of steps",
  "dead-end": "Dead end",
  "dropped-off": "Gave up",
};

const OUTCOME_COLOR: Record<TrajectoryOutcome, "green" | "red" | "gray" | "blue"> = {
  "goal-reached": "green",
  "terminal-failure": "red",
  "repetition-limit": "blue",
  "max-depth": "gray",
  "dead-end": "gray",
  "dropped-off": "gray",
};

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}` || "/";
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "") || "/";
  }
}

type PathGroup = { steps: TrajectoryStep[]; count: number; outcomes: Map<TrajectoryOutcome, number> };

/**
 * "Watch where visitors got stuck": aggregate the stored trajectories into
 * outcome share, stop points, loops, and the most common paths, so the
 * breakdown reads in seconds without opening findings.
 */
export function WhereStuck({
  graph,
  simulations,
}: {
  graph: Graph | undefined;
  simulations: Trajectory[];
}) {
  const stateById = useMemo(() => {
    const m = new Map<string, { title: string; path: string }>();
    for (const s of graph?.states ?? []) m.set(s.stateId, { title: s.pageTitle, path: shortPath(s.url) });
    return m;
  }, [graph]);

  const actionById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of graph?.states ?? []) for (const a of s.actions) m.set(a.actionId, a.label);
    return m;
  }, [graph]);

  const { outcomes, stops, loops, paths } = useMemo(() => {
    const outcomes = new Map<TrajectoryOutcome, number>();
    const stops = new Map<string, { count: number; outcomes: Map<TrajectoryOutcome, number> }>();
    const loops = new Map<string, number>();
    const paths = new Map<string, PathGroup>();
    let loopers = 0;

    for (const t of simulations) {
      outcomes.set(t.outcome, (outcomes.get(t.outcome) ?? 0) + 1);

      if (t.outcome !== "goal-reached" && t.steps.length > 0) {
        const end = t.steps[t.steps.length - 1].stateId;
        const entry = stops.get(end) ?? { count: 0, outcomes: new Map<TrajectoryOutcome, number>() };
        entry.count += 1;
        entry.outcomes.set(t.outcome, (entry.outcomes.get(t.outcome) ?? 0) + 1);
        stops.set(end, entry);
      }

      const seen = new Map<string, number>();
      for (const s of t.steps) seen.set(s.stateId, (seen.get(s.stateId) ?? 0) + 1);
      let looped = false;
      for (const [stateId, n] of seen) {
        if (n > 1) {
          loops.set(stateId, (loops.get(stateId) ?? 0) + (n - 1));
          looped = true;
        }
      }
      if (looped) loopers += 1;

      const signature = t.steps.map((s) => `${s.stateId}:${s.actionId ?? ""}`).join(">");
      const group = paths.get(signature) ?? { steps: t.steps, count: 0, outcomes: new Map() };
      group.count += 1;
      group.outcomes.set(t.outcome, (group.outcomes.get(t.outcome) ?? 0) + 1);
      paths.set(signature, group);
    }

    return {
      outcomes: [...outcomes.entries()].sort((a, b) => b[1] - a[1]),
      stops: [...stops.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6),
      loops: [...loops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
      paths: [...paths.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      loopers,
    };
  }, [simulations]);

  const total = simulations.length;
  const reached = simulations.filter((t) => t.outcome === "goal-reached").length;
  const stuck = total - reached;

  return (
    <div className="stuck">
      <div className="stuck-headline">
        <span className="tabular stuck-big">{total.toLocaleString()}</span>
        <span className="stuck-big-label">
          simulated journeys ·{" "}
          <b className={stuck > 0 ? "stuck-bad" : "stuck-good"}>
            {stuck.toLocaleString()} didn’t reach the goal
          </b>{" "}
          ({total > 0 ? Math.round((stuck / total) * 100) : 0}%)
        </span>
      </div>

      <ul className="stuck-outcomes" aria-label="Journey outcomes">
        {outcomes.map(([outcome, n]) => {
          const share = Math.round((n / Math.max(1, total)) * 100);
          return (
            <li key={outcome} className="swarm-dropoff">
              <span className={`swarm-reason stuck-${OUTCOME_COLOR[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
              <span className="swarm-bar" aria-hidden>
                <span
                  className={`swarm-fill stuck-fill-${OUTCOME_COLOR[outcome]}`}
                  style={{ width: `${share}%` }}
                />
              </span>
              <span className="tabular swarm-count">
                {n.toLocaleString()} · {share}%
              </span>
            </li>
          );
        })}
      </ul>

      {stops.length > 0 && (
        <section className="stuck-section" aria-label="Where journeys ended">
          <p className="swarm-sub">Where they stopped</p>
          <ul className="stuck-stops">
            {stops.map(([stateId, info]) => {
              const st = stateById.get(stateId);
              const top = [...info.outcomes.entries()].sort((a, b) => b[1] - a[1]);
              return (
                <li key={stateId} className="stuck-stop">
                  <span className="stuck-stop-name">
                    <span className="stuck-stop-title">{st?.title ?? stateId}</span>
                    {st && <span className="mono stuck-stop-path">{st.path}</span>}
                  </span>
                  <span className="stuck-stop-outcomes">
                    {top.map(([o, n]) => (
                      <Badge key={o} variant="dot" color={OUTCOME_COLOR[o]} size="compact">
                        {OUTCOME_LABEL[o]} {n}
                      </Badge>
                    ))}
                  </span>
                  <span className="tabular stuck-stop-count">{info.count}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {loops.length > 0 && (
        <section className="stuck-section" aria-label="States visitors revisited">
          <p className="swarm-sub">Where they looped</p>
          <ul className="stuck-loops">
            {loops.map(([stateId, n]) => {
              const st = stateById.get(stateId);
              return (
                <li key={stateId} className="stuck-loop">
                  <span className="stuck-stop-title">{st?.title ?? stateId}</span>
                  <span className="tabular swarm-count">
                    {n} extra {n === 1 ? "visit" : "visits"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {paths.length > 0 && (
        <section className="stuck-section" aria-label="Most common paths">
          <p className="swarm-sub">Most common paths</p>
          <ol className="stuck-paths">
            {paths.map((p, i) => {
              const topOutcome = [...p.outcomes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
              return (
                <li key={i} className="stuck-path">
                  <span className="tabular stuck-path-count">×{p.count.toLocaleString()}</span>
                  <span className="run-path stuck-path-steps">
                    {p.steps.map((step, si) => {
                      const st = stateById.get(step.stateId);
                      // simulateTrajectories stores the incoming action on the
                      // destination step, so this step's own actionId is the
                      // action that led to it.
                      const via = si > 0 ? actionById.get(step.actionId ?? "") : undefined;
                      return (
                        <span key={si} className="stuck-path-step">
                          {si > 0 && <ArrowIcon size={12} className="arrow" />}
                          {via && <span className="stuck-path-action">“{via}”</span>}
                          <span title={st ? `${st.title} · ${st.path}` : step.stateId}>
                            {st?.title ?? step.stateId}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                  {topOutcome && (
                    <Badge variant="dot" color={OUTCOME_COLOR[topOutcome]} size="compact">
                      {OUTCOME_LABEL[topOutcome]}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
