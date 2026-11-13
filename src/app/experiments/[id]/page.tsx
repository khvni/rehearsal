"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Experiment } from "@/lib/contracts";

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>();
  const [exp, setExp] = useState<Experiment | null>(null);
  const [error, setError] = useState<string>("");
  const [specMd, setSpecMd] = useState<string>("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/experiments/${id}`);
    const data = await res.json();
    if (res.ok) setExp(data as Experiment);
    else setError(data.error ?? "load failed");
  }, [id]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (exp && ["discovering", "simulating", "verifying", "analyzing", "comparing"].includes(exp.status)) {
        void refresh();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [refresh, exp]);

  async function stage(stage: string) {
    await fetch(`/api/experiments/${id}/${stage}`, { method: "POST" });
    await refresh();
  }

  async function loadSpec() {
    const res = await fetch(`/api/experiments/${id}/spec`);
    setSpecMd(await res.text());
  }

  if (error) return <div className="page">Error: {error}</div>;
  if (!exp) return <div className="page">Loading…</div>;

  const nodes = (exp.graph?.states ?? []).map((s, i) => ({
    id: s.stateId,
    position: { x: (i % 5) * 260, y: Math.floor(i / 5) * 140 },
    data: { label: `${s.pageTitle.slice(0, 42)}\n${s.url.slice(0, 48)}` },
    style: { fontSize: 10, background: "#12151a", color: "#e6e9ee", border: "1px solid #23272e", width: 240 },
  }));
  const edges = (exp.graph?.edges ?? []).map((e, i) => ({
    id: `e${i}`,
    source: e.fromStateId,
    target: e.toStateId,
    animated: false,
    style: { stroke: "#4f9cf9" },
  }));

  const severityOrder = ["critical", "high", "medium", "low"];
  const findings = [...exp.findings].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );

  return (
    <div className="page">
      <div className="header">
        <h1>Experiment {exp.id}</h1>
        <span className="meta mono">{exp.targetUrl}</span>
        <span className="badge ok">{exp.status}</span>
      </div>
      <p className="meta">Goal: {exp.goal}</p>
      <div className="form">
        {["discover", "simulate", "verify", "analyze", "compare", "spec", "run"].map((s) => (
          <button key={s} onClick={() => void stage(s === "run" ? "run" : s)}>{s}</button>
        ))}
        <button onClick={() => void loadSpec()}>view spec.md</button>
      </div>
      <div className="grid">
        <div className="panel">
          <h3>Decision graph — {exp.graph?.states.length ?? 0} states / {exp.graph?.edges.length ?? 0} edges</h3>
          <div className="graph-wrap">
            <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
              <Background color="#23272e" />
              <Controls />
            </ReactFlow>
          </div>
        </div>
        <div className="panel">
          <h3>Browser evidence — {exp.browserTests.length} runs</h3>
          {exp.browserTests.map((r) => (
            <div key={r.runId} className="finding">
              <div className={`step ${r.success ? "ok" : "fail"}`}>
                {r.runId} — {r.viewport.name} — {r.success ? "passed" : "failed"} ({r.durationMs}ms)
              </div>
              <div className="detail">
                {r.steps.map((s, i) => (
                  <span key={i} className={`step ${s.ok ? "ok" : "fail"}`}>{s.ok ? "✓" : "✗"} {s.label.slice(0, 30)} </span>
                ))}
              </div>
              {r.assertions.map((a, i) => (
                <div key={i} className={`step ${a.passed ? "ok" : "fail"}`}>
                  {a.passed ? "✓" : "✗"} {a.assertion.kind}: {a.assertion.value}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Findings — {findings.length}</h3>
          {findings.map((f) => (
            <div key={f.findingId} className={`finding ${f.severity}`}>
              <div className="title"><span className={`badge ${f.severity}`}>{f.severity}</span> {f.title}</div>
              <div className="detail">{f.description}</div>
              <div className="detail mono">[{f.evidenceType}] [{f.category}] krug:{f.krugPrinciple}</div>
              <div className="detail">→ {f.recommendation}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Baseline vs variant — {exp.comparisons.length} comparisons</h3>
          {exp.comparisons.map((c, i) => (
            <div key={i} className="finding">
              <div className="detail mono">
                goal: {String(c.deltas.goalCompleted.baseline)} → {String(c.deltas.goalCompleted.variant)} |
                interactions: {c.deltas.interactionCount.baseline} → {c.deltas.interactionCount.variant} |
                errors: {c.deltas.runtimeErrors.baseline} → {c.deltas.runtimeErrors.variant} |
                findingReproduces: {String(c.deltas.findingReproduces)}
              </div>
            </div>
          ))}
          {exp.variants.map((v) => (
            <div key={v.variantId} className="finding">
              <div className="title">{v.variantId} <span className="badge ok">{v.status}</span></div>
              <div className="detail">{v.description}</div>
              <div className="detail mono">{v.patches.map((p) => `${p.op} ${p.selector}`).join("; ")}</div>
            </div>
          ))}
        </div>
      </div>
      {specMd && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>spec.md</h3>
          <pre className="spec">{specMd}</pre>
        </div>
      )}
    </div>
  );
}
