"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StateGraph as Graph, Trajectory, Viewport } from "@/lib/contracts";

export function visitCounts(simulations: Trajectory[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of simulations) {
    for (const s of t.steps) counts.set(s.stateId, (counts.get(s.stateId) ?? 0) + 1);
  }
  return counts;
}

function heat(visits: number, max: number): number {
  if (max <= 0 || visits <= 0) return 0;
  return Math.log1p(visits) / Math.log1p(max);
}

export function StateGraph({
  graph,
  visits,
  viewport,
}: {
  graph: Graph;
  visits: Map<string, number>;
  viewport: Viewport["name"];
}) {
  const { nodes, edges } = useMemo(() => {
    const states = graph.states.filter((s) => s.viewport.name === viewport);
    const ids = new Set(states.map((s) => s.stateId));
    const max = Math.max(0, ...states.map((s) => visits.get(s.stateId) ?? 0));
    const cols = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(states.length))));
    const width = viewport === "mobile" ? 180 : 240;

    const nodes: Node[] = states.map((s, i) => {
      const v = visits.get(s.stateId) ?? 0;
      const t = heat(v, max);
      const pct = Math.round(t * 70);
      return {
        id: s.stateId,
        position: { x: (i % cols) * (width + 20), y: Math.floor(i / cols) * 120 },
        data: {
          label: (
            <div className="node">
              <div className="node-title">{s.pageTitle}</div>
              <div className="node-url">{s.url.replace(/^https?:\/\//, "")}</div>
              <div className="node-visits">{v.toLocaleString()} visits</div>
            </div>
          ),
        },
        style: {
          width,
          padding: 8,
          borderRadius: 6,
          background: `color-mix(in oklab, var(--accent) ${pct}%, var(--panel))`,
          border: `1px solid color-mix(in oklab, var(--accent) ${Math.round(t * 100)}%, var(--border))`,
          color: "var(--text)",
          textAlign: "left",
        },
      };
    });

    const edges: Edge[] = graph.edges
      .filter((e) => ids.has(e.fromStateId) && ids.has(e.toStateId))
      .map((e, i) => ({
        id: `e${i}`,
        source: e.fromStateId,
        target: e.toStateId,
        style: { stroke: "color-mix(in oklab, var(--accent) 55%, var(--border))" },
      }));

    return { nodes, edges };
  }, [graph, visits, viewport]);

  return (
    <div className={`graph-wrap ${viewport}`}>
      <ReactFlow
        key={viewport}
        nodes={nodes}
        edges={edges}
        fitView
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="#23272e" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function HeatLegend({ max }: { max: number }) {
  return (
    <div className="legend">
      <span>0</span>
      <span className="legend-bar" aria-hidden />
      <span className="tabular">{max.toLocaleString()} visits</span>
    </div>
  );
}
