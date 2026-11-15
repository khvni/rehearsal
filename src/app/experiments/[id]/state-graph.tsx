"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  MarkerType,
  PanOnScrollMode,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ActionNode, StateGraph as Graph, Trajectory, Viewport } from "@/lib/contracts";
import { ArrowIcon, CompressIcon, DocIcon, ExpandIcon, FormIcon } from "../../_components/icons";

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
const NODE_HEIGHT = 68;
/** Virtualize node/edge rendering once the graph outgrows casual browsing. */
const VIRTUALIZE_AT = 60;

/** Visited nodes run pale→saturated blue; unvisited read as plain grey. */
function heatFill(t: number): string {
  if (t <= 0) return "var(--raised)";
  return `color-mix(in oklab, var(--flow-600) ${Math.round(12 + t * 70)}%, var(--panel))`;
}

function heatBorder(t: number): string {
  if (t <= 0) return "var(--border)";
  return `color-mix(in oklab, var(--flow-700) ${Math.round(35 + t * 60)}%, var(--border))`;
}

type NodeKind = "form" | "nav" | "info";
const KIND_LABEL: Record<NodeKind, string> = {
  form: "Form",
  nav: "Nav",
  info: "Info",
};
const KIND_HINT: Record<NodeKind, string> = {
  form: "Requires input to proceed",
  nav: "Links or buttons lead onward",
  info: "Nothing onward — journeys end here",
};

/**
 * What a state asks of a visitor: fill a field, click through, or just read.
 * `hasOut` covers crawls that captured no controls on a state but still show
 * journeys leaving it — that is navigational, never a dead end.
 */
function kindOf(actions: ActionNode[], hasOut: boolean): NodeKind {
  const enabled = actions.filter((a) => a.enabled);
  if (enabled.some((a) => a.type === "fill" || a.type === "select")) return "form";
  if (enabled.some((a) => a.type === "click" || a.type === "navigate") || hasOut) return "nav";
  return "info";
}

function KindGlyph({ kind }: { kind: NodeKind }) {
  if (kind === "form") return <FormIcon size={11} />;
  if (kind === "nav") return <ArrowIcon size={11} />;
  return <DocIcon size={11} />;
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

type FlowEdgeData = { dot: boolean; dotDur: number; curvature: number };
type FlowEdge = Edge<FlowEdgeData, "flow">;

function FlowEdgeComponent(props: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: props.data?.curvature ?? 0.16,
  });
  const pathId = `ep-${props.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return (
    <>
      <BaseEdge
        id={pathId}
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={props.label}
        labelStyle={props.labelStyle}
        labelShowBg={props.labelShowBg}
        labelBgStyle={props.labelBgStyle}
        labelBgPadding={props.labelBgPadding}
        labelBgBorderRadius={props.labelBgBorderRadius}
        style={props.style}
        markerEnd={props.markerEnd}
        interactionWidth={props.interactionWidth}
      />
      {props.data?.dot && (
        <circle className="edge-dot" r={2.2} aria-hidden>
          <animateMotion dur={`${props.data.dotDur}s`} repeatCount="indefinite">
            <mpath href={`#${pathId}`} xlinkHref={`#${pathId}`} />
          </animateMotion>
        </circle>
      )}
    </>
  );
}
const FlowEdgeRenderer = memo(FlowEdgeComponent);
const edgeTypes = { flow: FlowEdgeRenderer };

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
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const rf = useRef<ReactFlowInstance | null>(null);
  // Layout cells and node objects persist across polls: React Flow keys its
  // measurements by node-object identity, so pooled nodes never re-measure
  // (they'd flash hidden otherwise) and existing states never move. They live
  // in state, not refs, so renders may read them; they are never set, so they
  // stay referentially stable.
  const [cells] = useState(() => new Map<string, { col: number; row: number }>());
  const [pool] = useState(() => new Map<string, Node>());
  const seen = useRef<string | null>(null);

  const states = useMemo(
    () => graph.states.filter((s) => s.viewport.name === viewport),
    [graph, viewport],
  );
  const structureSig = `${viewport}:${states.map((s) => s.stateId).join(",")}`;

  const { nodes, edgeData } = useMemo(() => {
    const visits = visitCounts(simulations);
    const transitions = transitionCounts(simulations);
    const ids = new Set(states.map((s) => s.stateId));
    const pairs = new Map<string, [string, string]>();
    const outCount = new Map<string, number>();
    for (const e of graph.edges) {
      if (e.fromStateId === e.toStateId || !ids.has(e.fromStateId) || !ids.has(e.toStateId)) continue;
      pairs.set(`${e.fromStateId}>${e.toStateId}`, [e.fromStateId, e.toStateId]);
      outCount.set(e.fromStateId, (outCount.get(e.fromStateId) ?? 0) + 1);
    }
    const maxFlow = Math.max(0, ...[...pairs.keys()].map((k) => transitions.get(k) ?? 0));
    const perRow = viewport === "mobile" ? 3 : 5;
    const width = viewport === "mobile" ? 200 : 220;
    const suggested = layout(states.map((s) => s.stateId), [...pairs.values()], visits, perRow);
    const rootId = states[0]?.stateId;

    const cellFor = new Map<string, { col: number; row: number }>();
    const occupied = new Set<string>();
    const mark = (c: { col: number; row: number }) => occupied.add(`${c.row}:${c.col}`);
    for (const s of states) {
      const cell = cells.get(`${viewport}:${s.stateId}`);
      if (cell) {
        cellFor.set(s.stateId, cell);
        mark(cell);
      }
    }
    for (const s of states) {
      if (cellFor.has(s.stateId)) continue;
      let cell = suggested.get(s.stateId) ?? { col: 0, row: 0 };
      while (occupied.has(`${cell.row}:${cell.col}`)) {
        cell = cell.col + 1 < perRow ? { col: cell.col + 1, row: cell.row } : { col: 0, row: cell.row + 1 };
      }
      cells.set(`${viewport}:${s.stateId}`, cell);
      cellFor.set(s.stateId, cell);
      mark(cell);
    }

    const nextPool = new Map<string, Node>();
    const nodes = states.map((s) => {
      const cell = cellFor.get(s.stateId)!;
      const kind = kindOf(s.actions, (outCount.get(s.stateId) ?? 0) > 0);
      const key = `${viewport}|${s.stateId}|${s.url}|${s.pageTitle}|${kind}|${s.stateId === rootId}|${cell.col}:${cell.row}`;
      const kept = pool.get(key);
      if (kept) {
        nextPool.set(key, kept);
        return kept;
      }
      const node = {
        id: s.stateId,
        position: { x: cell.col * (width + 40), y: cell.row * 110 },
        initialWidth: width,
        initialHeight: NODE_HEIGHT,
        // Stable nodes keep their measurements; a baked-in visit count would
        // go stale on the next poll, so the label stays static.
        ariaLabel: `${shortPath(s.url)}, ${s.pageTitle} — ${KIND_HINT[kind]}`,
        data: {
          label: (
            <div className="node">
              <div className="node-path">{shortPath(s.url)}</div>
              <div className="node-title">{s.pageTitle}</div>
              <div className="node-foot">
                <span className="node-visits" />
                <span className="node-side">
                  <span className={`node-kind ${kind}`} title={KIND_HINT[kind]}>
                    <KindGlyph kind={kind} />
                    {KIND_LABEL[kind]}
                  </span>
                  {s.stateId === rootId && <span className="node-start">Start</span>}
                </span>
              </div>
            </div>
          ),
        },
        style: {
          width,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          color: "var(--text)",
          textAlign: "left" as const,
          boxShadow: "none",
        },
      } satisfies Node;
      nextPool.set(key, node);
      return node;
    });
    pool.clear();
    for (const [k, v] of nextPool) pool.set(k, v);

    const actionById = new Map<string, ActionNode>();
    for (const s of states) for (const a of s.actions) actionById.set(a.actionId, a);
    // One rendered edge per state pair: several controls can share a route, so
    // the pair gathers every actionId and leads with the first one's label.
    const actionsByPair = new Map<string, ActionNode[]>();
    for (const e of graph.edges) {
      const key = `${e.fromStateId}>${e.toStateId}`;
      const a = actionById.get(e.actionId);
      if (a) actionsByPair.set(key, [...(actionsByPair.get(key) ?? []), a]);
    }
    const raw = [...pairs.keys()].map((key) => {
      const [source, target] = pairs.get(key)!;
      const flow = transitions.get(key) ?? 0;
      const w = maxFlow > 0 && flow > 0 ? Math.log1p(flow) / Math.log1p(maxFlow) : 0;
      const acts = actionsByPair.get(key) ?? [];
      const labels = [...new Set(acts.map((a) => a.label.replace(/\s+/g, " ").trim()))];
      return {
        id: key,
        source,
        target,
        flow,
        w,
        needsInput: acts.some((a) => a.type === "fill" || a.type === "select"),
        actionLabel: labels.join(" · "),
      };
    });
    // Both directions travelled: bow each curve to its own side of the line.
    const keySet = new Set(raw.map((e) => e.id));
    const edgeData = raw.map((e) => ({
      ...e,
      bidirectional: keySet.has(`${e.target}>${e.source}`),
    }));

    return { nodes, edgeData };
  }, [graph, simulations, viewport, states, cells, pool]);

  // Reframe only when the visible topology changes. Node measurements land
  // asynchronously after the swap, so the fit waits for the first dimensions
  // change — fitting here would compute bounds from stale boxes and clip.
  // The prop `fitView` already frames the mount.
  const pendingFit = useRef(false);
  useEffect(() => {
    const changed = seen.current !== null && seen.current !== structureSig;
    seen.current = structureSig;
    if (changed) pendingFit.current = true;
  }, [structureSig]);

  // Fullscreen: hold the page still, let Esc leave, and reframe once the
  // wrapper has resized — two frames is enough for the ResizeObserver pass.
  useEffect(() => {
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    if (expanded) {
      root.style.overflow = "hidden";
      document.addEventListener("keydown", onKey);
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => void rf.current?.fitView({ padding: 0.1, duration: 200 }));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      root.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const { edges, liveCss } = useMemo(() => {
    const neighbors = new Set<string>();
    if (hovered) {
      neighbors.add(hovered);
      for (const e of edgeData) {
        if (e.source === hovered) neighbors.add(e.target);
        if (e.target === hovered) neighbors.add(e.source);
      }
    }
    const edges: Edge[] = edgeData.map((e) => {
      const incident =
        e.id === hoveredEdge || (hovered !== null && (e.source === hovered || e.target === hovered));
      const taken = e.flow > 0;
      // Taken edges run blue — deeper where crossing one requires input — and
      // untaken ones stay a dashed grey, so "where can I go" vs "where do
      // journeys actually go" stays legible at a glance.
      const stroke = incident
        ? "var(--flow-800)"
        : taken
          ? e.needsInput
            ? "var(--flow-700)"
            : "var(--flow-500)"
          : "var(--border-strong)";
      const opacity = hovered ? (incident ? 1 : 0.05) : taken ? 0.32 + e.w * 0.6 : 0.5;
      const via = e.actionLabel ? `${e.actionLabel.slice(0, 28)} · ` : "";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "flow" as const,
        zIndex: incident ? 1 : 0,
        label: incident
          ? `${via}${e.flow.toLocaleString()} ${e.flow === 1 ? "journey" : "journeys"}`
          : undefined,
        labelStyle: { fontSize: 11, fontWeight: 500, fill: "var(--flow-800)" },
        labelShowBg: true,
        labelBgStyle: { fill: "var(--panel)", stroke: "var(--border-strong)", strokeWidth: 0.5 },
        labelBgPadding: [5, 2] as [number, number],
        labelBgBorderRadius: 4,
        ariaLabel: `${e.actionLabel ?? "link"} from ${e.source} to ${e.target}, ${e.flow} journeys`,
        interactionWidth: 16,
        markerEnd: { type: MarkerType.Arrow, width: 10, height: 10, color: stroke },
        data: {
          dot: incident && taken,
          dotDur: Math.max(1.4, 3.4 - e.w * 2),
          curvature: e.bidirectional ? 0.34 : 0.16,
        },
        style: {
          stroke,
          strokeWidth: incident ? 1.4 + e.w * 2.6 : taken ? 1 + e.w * 2.4 : 1,
          strokeOpacity: opacity,
          strokeDasharray: taken ? undefined : "3 4",
        },
      } satisfies Edge;
    });
    // Heat and visit counts ride on a stylesheet so polling never hands
    // React Flow new node objects; dim on hover works the same way.
    const visits = visitCounts(simulations);
    const maxVisits = Math.max(0, ...states.map((s) => visits.get(s.stateId) ?? 0));
    const rules: string[] = [];
    for (const s of states) {
      const v = visits.get(s.stateId) ?? 0;
      const t = heat(v, maxVisits);
      const sel = `.graph-wrap .react-flow__node[data-id=${JSON.stringify(s.stateId)}]`;
      rules.push(
        `${sel} { background: ${heatFill(t)}; border-color: ${heatBorder(t)}; }`,
        `${sel} .node-visits::before { content: ${JSON.stringify(`${v.toLocaleString()} visits`)}; }`,
        `${sel} .node-visits { color: ${v === 0 ? "var(--muted)" : "var(--flow-800)"}; font-weight: ${v === 0 ? 400 : 500}; }`,
      );
    }
    if (hovered) {
      const keep = [...neighbors].map((id) => `[data-id=${JSON.stringify(id)}]`).join(", ");
      rules.push(`.graph-wrap .react-flow__node:not(${keep}) { opacity: 0.3; }`);
    }
    return { edges, liveCss: rules.join("\n") };
  }, [edgeData, hovered, hoveredEdge, simulations, states]);

  return (
    <div className={`graph-wrap ${viewport} ${expanded ? "expanded" : ""}`}>
      <style>{liveCss}</style>
      <button
        type="button"
        className="graph-expand"
        aria-label={expanded ? "Exit fullscreen graph" : "Expand graph to fullscreen"}
        aria-pressed={expanded}
        title={expanded ? "Exit fullscreen (Esc)" : "Fullscreen"}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <CompressIcon size={14} /> : <ExpandIcon size={14} />}
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        zoomOnPinch
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        onlyRenderVisibleElements={states.length > VIRTUALIZE_AT}
        nodesConnectable={false}
        nodesDraggable={false}
        onInit={(instance) => {
          rf.current = instance;
        }}
        onNodesChange={(changes) => {
          if (pendingFit.current && changes.some((c) => c.type === "dimensions")) {
            pendingFit.current = false;
            void rf.current?.fitView({ padding: 0.12, duration: 220 });
          }
        }}
        onNodeMouseEnter={(_, n) => setHovered(n.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeClick={(_, n) => setHovered((h) => (h === n.id ? null : n.id))}
        onEdgeMouseEnter={(_, e) => setHoveredEdge(e.id)}
        onEdgeMouseLeave={() => setHoveredEdge(null)}
        onPaneClick={() => setHovered(null)}
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <p className="graph-keys" aria-hidden>
        Scroll pans · pinch or ± to zoom{expanded ? " · Esc exits" : ""}
      </p>
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
        <span className="legend-line deep" aria-hidden />
        Via form input
      </span>
      <span className="sep" aria-hidden>·</span>
      <span className="legend-edge">
        <span className="legend-line" style={{ borderTopStyle: "dashed" }} aria-hidden />
        Never taken
      </span>
      <span className="sep" aria-hidden>·</span>
      <span className="legend-edge">
        <span className="node-kind form"><KindGlyph kind="form" />Form</span>
        <span className="node-kind nav"><KindGlyph kind="nav" />Nav</span>
        <span className="node-kind info"><KindGlyph kind="info" />Info</span>
      </span>
    </div>
  );
}
