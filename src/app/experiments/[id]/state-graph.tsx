"use client";

import { useMemo, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, Controls, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StateGraph as Graph, Trajectory, Viewport } from "@/lib/contracts";

export function visitCounts(simulations: Trajectory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of simulations) {
    for (const s of t.steps) counts.set(s.stateId, (counts.get(s.stateId) ?? 0) + 1);
  }
  return counts;
}

function transitionCounts(simulations: Trajectory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of simulations) {
    for (let i = 1; i < t.steps.length; i++) {
      const key = `${t.steps[i - 1].stateId}>${t.steps[i].stateId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function heat(visits: number, max: number): number {
  if (max <= 0 || visits <= 0) return 0;
  return Math.log1p(visits) / Math.log1p(max);
}

const HEAT_STEPS = [0, 0.25, 0.5, 0.75, 1];

function heatFill(t: number): string {
  return `color-mix(in oklab, var(--hl) ${Math.round(t * 32)}%, var(--panel))`;
}

function heatBorder(t: number): string {
  return `color-mix(in oklab, var(--hl) ${Math.round(25 + t * 60)}%, var(--border))`;
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}` || "/";
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "") || "/";
  }
}

/** Layered layout: breadth-first depth from the first captured state, wrapped into rows. */
function layout(stateIds: string[], edges: [string, string][], visits: Map<string, number>, perRow: number) {
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) out.set(a, [...(out.get(a) ?? []), b]);
  const depth = new Map<string, number>();
  if (stateIds[0]) depth.set(stateIds[0], 0);
  const queue = stateIds.slice(0, 1);
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of out.get(id) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, depth.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  const layers = new Map<number, string[]>();
  for (const id of stateIds) {
    const d = depth.get(id) ?? maxDepth + 1;
    layers.set(d, [...(layers.get(d) ?? []), id]);
  }
  const pos = new Map<string, { col: number; row: number }>();
  let row = 0;
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    const ids = layers.get(d)!.sort((a, b) => (visits.get(b) ?? 0) - (visits.get(a) ?? 0));
    ids.forEach((id, i) => pos.set(id, { col: i % perRow, row: row + Math.floor(i / perRow) }));
    row += Math.ceil(ids.length / perRow);
  }
  return pos;
}

export function StateGraph({
  graph,
  simulations,
  viewport,
}: {
  graph: Graph;
  simulations: Trajectory[];
  viewport: Viewport["name"];
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const fresh = useMemo(() => {
    const visits = visitCounts(simulations);
    const transitions = transitionCounts(simulations);
    const states = graph.states.filter((s) => s.viewport.name === viewport);
    const ids = new Set(states.map((s) => s.stateId));
    const pairs = new Map<string, [string, string]>();
    for (const e of graph.edges) {
      if (e.fromStateId === e.toStateId || !ids.has(e.fromStateId) || !ids.has(e.toStateId)) continue;
      pairs.set(`${e.fromStateId}>${e.toStateId}`, [e.fromStateId, e.toStateId]);
    }
    const maxVisits = Math.max(0, ...states.map((s) => visits.get(s.stateId) ?? 0));
    const maxFlow = Math.max(0, ...[...pairs.keys()].map((k) => transitions.get(k) ?? 0));
    const perRow = viewport === "mobile" ? 3 : 5;
    const width = viewport === "mobile" ? 200 : 220;
    const pos = layout(states.map((s) => s.stateId), [...pairs.values()], visits, perRow);
    const rootId = states[0]?.stateId;

    const nodes = states.map((s) => {
      const v = visits.get(s.stateId) ?? 0;
      const t = heat(v, maxVisits);
      const p = pos.get(s.stateId) ?? { col: 0, row: 0 };
      return {
        id: s.stateId,
        position: { x: p.col * (width + 40), y: p.row * 110 },
        ariaLabel: `${shortPath(s.url)}, ${s.pageTitle}, ${v} visits`,
        data: {
          label: (
            <div className="node">
              <div className="node-path">{shortPath(s.url)}</div>
              <div className="node-title">{s.pageTitle}</div>
              <div className="node-foot">
                <span className={`node-visits ${v === 0 ? "zero" : ""}`}>{v.toLocaleString()} visits</span>
                {s.stateId === rootId && <span className="node-start">Start</span>}
              </div>
            </div>
          ),
        },
        style: {
          width,
          padding: "8px 10px",
          borderRadius: 8,
          background: heatFill(t),
          border: `1px solid ${heatBorder(t)}`,
          color: "var(--text)",
          textAlign: "left" as const,
          boxShadow: "none",
        },
      } satisfies Node;
    });

    const edges = [...pairs].map(([key, [source, target]]) => {
      const flow = transitions.get(key) ?? 0;
      const w = maxFlow > 0 && flow > 0 ? Math.log1p(flow) / Math.log1p(maxFlow) : 0;
      return { id: key, source, target, flow, w };
    });

    return { nodes, edges };
  }, [graph, simulations, viewport]);

  // Polling hands us new graph objects every few seconds. Keep node objects
  // stable until the content changes, so React Flow keeps its measurements.
  const sig = [
    viewport,
    graph.states.map((st) => st.stateId).join(","),
    graph.edges.length,
    simulations.map((t) => t.trajectoryId).join(","),
  ].join("|");
  const [kept, setKept] = useState({ sig, base: fresh });
  if (kept.sig !== sig) setKept({ sig, base: fresh });
  const base = kept.sig === sig ? kept.base : fresh;

  const { edges, dimCss } = useMemo(() => {
    const neighbors = new Set<string>();
    if (hovered) {
      neighbors.add(hovered);
      for (const e of base.edges) {
        if (e.source === hovered) neighbors.add(e.target);
        if (e.target === hovered) neighbors.add(e.source);
      }
    }
    const edges: Edge[] = base.edges.map((e) => {
      const incident = hovered !== null && (e.source === hovered || e.target === hovered);
      const opacity = hovered ? (incident ? 0.95 : 0.04) : e.flow > 0 ? 0.25 + e.w * 0.55 : 0.12;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        zIndex: incident ? 1 : 0,
        style: {
          stroke: incident ? "var(--hl)" : e.flow > 0 ? "var(--text-2)" : "var(--muted)",
          strokeWidth: e.flow > 0 ? 1 + e.w * 2.5 : 1,
          strokeOpacity: opacity,
          strokeDasharray: e.flow > 0 ? undefined : "3 4",
        },
      };
    });
    // Dim through CSS so hovering never hands React Flow new node objects;
    // replacing nodes mid-poll drops their measurements and blanks the graph.
    const keep = [...neighbors].map((id) => `[data-id=${JSON.stringify(id)}]`).join(", ");
    const dimCss = hovered ? `.graph-wrap .react-flow__node:not(${keep}) { opacity: 0.3; }` : "";
    return { edges, dimCss };
  }, [base, hovered]);

  return (
    <div className={`graph-wrap ${viewport}`}>
      {dimCss && <style>{dimCss}</style>}
      <ReactFlow
        key={`${viewport}:${base.nodes.length}:${simulations.length}`}
        nodes={base.nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeClick={(_, n) => setHovered((h) => (h === n.id ? null : n.id))}
        onPaneClick={() => setHovered(null)}
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function HeatLegend({ max }: { max: number }) {
  return (
    <div className="legend">
      <span>Visits</span>
      <span className="tabular">0</span>
      <span className="legend-scale" aria-hidden>
        {HEAT_STEPS.map((t) => (
          <span key={t} className="legend-swatch" style={{ background: heatFill(t), borderColor: heatBorder(t) }} />
        ))}
      </span>
      <span className="tabular">{max.toLocaleString()}</span>
      <span className="sep" aria-hidden>·</span>
      <span className="legend-edge">
        <span className="legend-line" aria-hidden />
        <span className="legend-line thick" aria-hidden />
        Line weight is journeys taken
      </span>
      <span className="sep" aria-hidden>·</span>
      <span className="legend-edge">
        <span className="legend-line" style={{ borderTopStyle: "dashed" }} aria-hidden />
        Never taken
      </span>
    </div>
  );
}
