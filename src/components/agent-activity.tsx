"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEvent, PanelState } from "@/lib/contracts";
import { Panel } from "../app/_components/panel";

const POLL_MS = 2000;

const KIND_LABEL: Record<ActivityEvent["kind"], string> = {
  info: "Info",
  fetch: "Fetch",
  map: "Map",
  decide: "Decide",
  browser: "Browser",
  assert: "Assert",
  finding: "Finding",
  error: "Error",
};

function clock(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour12: false });
}

/** Live feed of what the agent is doing — polls the activity endpoint while a run is live. */
export function AgentActivity({ id, live }: { id: string; live: boolean }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const feedRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/experiments/${id}/activity`, { cache: "no-store" });
      if (res.ok) setEvents((await res.json()) as ActivityEvent[]);
    } catch {
      /* keep the last rendered feed */
    }
  }, [id]);

  useEffect(() => {
    const tick = () => void load();
    const first = setTimeout(tick, 0);
    if (!live) return () => clearTimeout(first);
    const interval = setInterval(tick, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [live, load]);

  const count = events.length;
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const state: PanelState =
    count > 0
      ? { kind: "ready" }
      : live
        ? { kind: "loading", label: "Waiting for the first move…" }
        : { kind: "empty", message: "Nothing logged yet — run a step to watch the agent work." };

  return (
    <Panel
      title="Agent activity"
      className="span-2"
      meta={count > 0 && <span className="tabular">{count} events</span>}
      busy={live}
      enter="none"
      state={state}
    >
      <ol className="activity list" ref={feedRef} aria-label="Agent activity">
        {events.map((e, i) => (
          <li key={i} className={`k-${e.kind}`}>
            <span className="activity-time">{clock(e.ts)}</span>
            <span className={`activity-dot k-${e.kind}`} aria-hidden />
            <span className="activity-stage">{e.stage}</span>
            <span className="activity-kind muted">{KIND_LABEL[e.kind] ?? e.kind}</span>
            <span className="activity-msg">
              {e.message}
              {e.url && !e.message.includes(e.url) && <span className="activity-url"> {e.url}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
