"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Experiment, Finding, KrugPrinciple, Viewport } from "@/lib/contracts";
import { KrugChip, SEVERITY_ORDER, SeverityChip } from "../../_components/chips";
import { Markdown } from "../../_components/markdown";
import { Panel, type PanelState } from "../../_components/panel";
import { HeatLegend, StateGraph, visitCounts } from "./state-graph";

const STAGES = ["discover", "simulate", "verify", "analyze", "compare", "spec"] as const;
type Stage = (typeof STAGES)[number] | "run";
type Section = "graph" | "evidence" | "findings" | "comparisons" | "spec";

const RUNNING_STATUSES = ["discovering", "simulating", "verifying", "analyzing", "comparing"];

const SECTION_STAGES: Record<Section, { stages: Stage[]; statuses: string[] }> = {
  graph: { stages: ["discover", "simulate"], statuses: ["discovering", "simulating"] },
  evidence: { stages: ["verify"], statuses: ["verifying"] },
  findings: { stages: ["analyze"], statuses: ["analyzing"] },
  comparisons: { stages: ["compare"], statuses: ["comparing"] },
  spec: { stages: ["spec"], statuses: [] },
};

type SpecDoc = { key: string; md?: string; error?: string };

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>();
  const [exp, setExp] = useState<Experiment | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Stage | null>(null);
  const [stageErrors, setStageErrors] = useState<Partial<Record<Stage, string>>>({});
  const [specDoc, setSpecDoc] = useState<SpecDoc | null>(null);
  const [viewport, setViewport] = useState<Viewport["name"]>("desktop");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/experiments/${id}`, { cache: "no-store" });
      if (!res.ok) return setLoadError(await readError(res));
      setExp((await res.json()) as Experiment);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const polling = pending !== null || (exp !== null && RUNNING_STATUSES.includes(exp.status));
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [polling, refresh]);

  const specKey = exp?.spec?.generatedAt ?? "";
  const loadSpec = useCallback(async () => {
    try {
      const res = await fetch(`/api/experiments/${id}/spec`, { cache: "no-store" });
      if (!res.ok) return setSpecDoc({ key: specKey, error: await readError(res) });
      setSpecDoc({ key: specKey, md: await res.text() });
    } catch (e) {
      setSpecDoc({ key: specKey, error: e instanceof Error ? e.message : String(e) });
    }
  }, [id, specKey]);

  useEffect(() => {
    if (specKey) void loadSpec();
  }, [specKey, loadSpec]);

  async function runStage(stage: Stage) {
    setPending(stage);
    setStageErrors((prev) => ({ ...prev, [stage]: undefined }));
    try {
      const res = await fetch(`/api/experiments/${id}/${stage}`, { method: "POST" });
      if (!res.ok) {
        const message = await readError(res);
        setStageErrors((prev) => ({ ...prev, [stage]: message }));
      }
    } catch (e) {
      setStageErrors((prev) => ({ ...prev, [stage]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPending(null);
      await refresh();
    }
  }

  const visits = useMemo(() => visitCounts(exp?.simulations ?? []), [exp?.simulations]);
  const findings = useMemo(
    () =>
      [...(exp?.findings ?? [])].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
      ),
    [exp?.findings],
  );
  const findingGroups = useMemo(() => {
    const groups = new Map<KrugPrinciple, Finding[]>();
    for (const f of findings) groups.set(f.krugPrinciple, [...(groups.get(f.krugPrinciple) ?? []), f]);
    return [...groups];
  }, [findings]);

  if (loadError && !exp) {
    return (
      <div className="page">
        <TopBar />
        <div className="state error page-state" role="alert">
          <p className="state-text">Couldn&apos;t load experiment {id}: {loadError}</p>
          <div className="row">
            <button type="button" onClick={() => void refresh()}>Retry</button>
            <Link href="/" className="button-link">New experiment</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!exp) {
    return (
      <div className="page">
        <TopBar />
        <div className="state page-state" aria-busy>
          <div className="skeleton" />
          <div className="skeleton short" />
          <p className="state-text">Loading experiment…</p>
        </div>
      </div>
    );
  }

  const busy = (section: Section) =>
    SECTION_STAGES[section].statuses.includes(exp.status) ||
    (pending !== null && SECTION_STAGES[section].stages.includes(pending)) ||
    (section === "spec" && pending === "run");

  const stageError = (section: Section) =>
    SECTION_STAGES[section].stages.map((s) => stageErrors[s]).find(Boolean);

  function panelState(section: Section, hasData: boolean, loading: string, empty: string): PanelState {
    const err = stageError(section);
    if (err && !hasData) return { kind: "error", message: err, onRetry: () => void runStage(SECTION_STAGES[section].stages[0]) };
    if (hasData) return { kind: "ready" };
    if (busy(section)) return { kind: "loading", label: loading };
    return { kind: "empty", message: empty };
  }

  const graph = exp.graph;
  const byViewport = {
    desktop: graph?.states.filter((s) => s.viewport.name === "desktop").length ?? 0,
    mobile: graph?.states.filter((s) => s.viewport.name === "mobile").length ?? 0,
  };
  const viewportStates = graph?.states.filter((s) => s.viewport.name === viewport) ?? [];
  const viewportIds = new Set(viewportStates.map((s) => s.stateId));
  const viewportEdges = graph?.edges.filter((e) => viewportIds.has(e.fromStateId) && viewportIds.has(e.toStateId)) ?? [];
  const maxVisits = Math.max(0, ...viewportStates.map((s) => visits.get(s.stateId) ?? 0));

  let graphState = panelState(
    "graph",
    (graph?.states.length ?? 0) > 0,
    "Discovering states…",
    "No states yet. Run discover to crawl the target and build the graph.",
  );
  if (graphState.kind === "ready" && viewportStates.length === 0) {
    graphState = {
      kind: "empty",
      message: !exp.configuration.viewports.includes(viewport)
        ? `${viewport} isn't in this experiment's viewports (${exp.configuration.viewports.join(", ")}).`
        : (graph?.states.length ?? 0) >= exp.configuration.maxStates
          ? `No ${viewport} states captured: the crawl hit maxStates (${exp.configuration.maxStates}) before reaching ${viewport}.`
          : `No ${viewport} states captured. Re-run discover.`,
    };
  }

  const runs = exp.browserTests;
  const statusClass = exp.status === "failed" ? "failed" : exp.status === "complete" ? "ok" : RUNNING_STATUSES.includes(exp.status) ? "running" : "";
  const specState: PanelState = (() => {
    const err = stageErrors.spec ?? (specDoc?.key === specKey ? specDoc?.error : undefined);
    if (err && !specDoc?.md) return { kind: "error", message: err, onRetry: specKey ? () => void loadSpec() : () => void runStage("spec") };
    if (specDoc?.md) return { kind: "ready" };
    if (busy("spec") || (specKey && specDoc?.key !== specKey)) return { kind: "loading", label: "Writing spec.md…" };
    return { kind: "empty", message: "No spec yet. Run spec after analyze to generate the rebuild plan." };
  })();

  return (
    <div className="page">
      <TopBar />
      <div className="header">
        <h1>Experiment <span className="mono">{exp.id}</span></h1>
        <span className={`pill ${statusClass}`}>{exp.status}</span>
      </div>
      <dl className="facts">
        <dt>URL</dt>
        <dd className="mono"><a href={exp.targetUrl} target="_blank" rel="noreferrer">{exp.targetUrl}</a></dd>
        <dt>Goal</dt>
        <dd>{exp.goal}</dd>
      </dl>

      <div className="toolbar" role="toolbar" aria-label="Pipeline stages">
        <button type="button" className="primary" disabled={pending !== null} onClick={() => void runStage("run")}>
          {pending === "run" ? "Running pipeline…" : "Run all"}
        </button>
        <span className="divider" aria-hidden />
        {STAGES.map((s, i) => (
          <button key={s} type="button" disabled={pending !== null} onClick={() => void runStage(s)}>
            <span className="step-num tabular">{i + 1}</span>
            {pending === s ? `${s}…` : s}
          </button>
        ))}
      </div>

      {(stageErrors.run || exp.errors.length > 0) && (
        <div className="banner" role="alert">
          {stageErrors.run && <div>Pipeline failed: {stageErrors.run}</div>}
          {exp.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="grid">
        <Panel
          title="Decision graph"
          meta={<span className="tabular">{viewportStates.length} states · {viewportEdges.length} edges</span>}
          busy={busy("graph")}
          state={graphState}
          actions={
            <div className="segmented" role="group" aria-label="Viewport">
              {(["desktop", "mobile"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={viewport === v} onClick={() => setViewport(v)}>
                  {v} <span className="tabular count">{byViewport[v]}</span>
                </button>
              ))}
            </div>
          }
        >
          {graph && <StateGraph graph={graph} visits={visits} viewport={viewport} />}
          <div className="graph-foot">
            <span className="mono">
              {viewport} · {viewportStates[0]?.viewport.width ?? (viewport === "mobile" ? 390 : 1440)}×
              {viewportStates[0]?.viewport.height ?? (viewport === "mobile" ? 844 : 900)}
            </span>
            {exp.simulations.length > 0 ? <HeatLegend max={maxVisits} /> : <span className="muted">Run simulate to color nodes by visits</span>}
          </div>
        </Panel>

        <Panel
          title="Browser evidence"
          meta={<span className="tabular">{runs.filter((r) => r.success).length}/{runs.length} passed</span>}
          busy={busy("evidence")}
          state={panelState("evidence", runs.length > 0, "Verifying in real browsers…", "No browser runs yet. Run verify to replay the riskiest journeys.")}
        >
          <div className="list">
            {runs.map((r) => (
              <div key={r.runId} className={`card ${r.success ? "pass" : "fail"}`}>
                <div className="card-title">
                  <span className={`chip ${r.success ? "pass" : "fail"}`}>{r.success ? "passed" : "failed"}</span>
                  <span className="mono">{r.runId}</span>
                  <span className="muted">{r.viewport.name}</span>
                  <span className="muted tabular right">{r.durationMs.toLocaleString()} ms</span>
                </div>
                {r.steps.length > 0 && (
                  <ol className="steps">
                    {r.steps.map((s, i) => (
                      <li key={i} className={s.ok ? "ok" : "fail"} title={s.error}>
                        {s.ok ? "✓" : "✗"} {s.label}
                      </li>
                    ))}
                  </ol>
                )}
                {r.assertions.map((a, i) => (
                  <div key={i} className={`assert ${a.passed ? "ok" : "fail"}`}>
                    {a.passed ? "✓" : "✗"} <span className="mono">{a.assertion.kind}</span> {a.assertion.value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Findings"
          meta={<SeverityCounts findings={findings} />}
          busy={busy("findings")}
          state={panelState("findings", findings.length > 0, "Grading against Krug's rubric…", "No findings yet. Run analyze after verify.")}
        >
          <div className="list">
            {findingGroups.map(([principle, group]) => (
              <section key={principle} className="finding-group" aria-label={`${group.length} findings`}>
                <div className="group-head">
                  <KrugChip principle={principle} />
                  <span className="muted tabular">{group.length}</span>
                </div>
                {group.map((f) => (
                  <article key={f.findingId} className="card">
                    <div className="chips">
                      <SeverityChip severity={f.severity} />
                      <span className="chip evidence">{f.evidenceType}</span>
                      <span className="card-meta mono">{f.category} · {f.verificationStatus}</span>
                    </div>
                    <h3 className="card-heading">{f.title}</h3>
                    <p className="card-body">{f.description}</p>
                    <p className="card-rec">{f.recommendation}</p>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </Panel>

        <Panel
          title="Baseline vs variant"
          meta={<span className="tabular">{exp.variants.length} variants · {exp.comparisons.length} comparisons</span>}
          busy={busy("comparisons")}
          state={panelState(
            "comparisons",
            exp.variants.length + exp.comparisons.length > 0,
            "Re-verifying variants…",
            "No variants yet. Run compare to patch the top finding and re-verify.",
          )}
        >
          <div className="list">
            {exp.comparisons.map((c, i) => (
              <table key={i} className="delta tabular">
                <thead>
                  <tr><th>Metric</th><th>Baseline</th><th>Variant</th></tr>
                </thead>
                <tbody>
                  <tr><td>Goal completed</td><td>{c.deltas.goalCompleted.baseline ? "yes" : "no"}</td><td>{c.deltas.goalCompleted.variant ? "yes" : "no"}</td></tr>
                  <tr><td>Interactions</td><td>{c.deltas.interactionCount.baseline}</td><td>{c.deltas.interactionCount.variant}</td></tr>
                  <tr><td>Failed interactions</td><td>{c.deltas.failedInteractions.baseline}</td><td>{c.deltas.failedInteractions.variant}</td></tr>
                  <tr><td>Runtime errors</td><td>{c.deltas.runtimeErrors.baseline}</td><td>{c.deltas.runtimeErrors.variant}</td></tr>
                  <tr><td>Finding reproduces</td><td colSpan={2}>{c.deltas.findingReproduces ? "yes" : "no"}</td></tr>
                </tbody>
              </table>
            ))}
            {exp.variants.map((v) => (
              <div key={v.variantId} className="card">
                <div className="card-title">
                  <span className="mono">{v.variantId}</span>
                  <span className={`chip variant-${v.status}`}>{v.status}</span>
                </div>
                <p className="card-body">{v.description}</p>
                <div className="card-meta mono">{v.patches.map((p) => `${p.op} ${p.selector}`).join(" · ")}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="spec.md"
        className="spec-panel"
        busy={busy("spec")}
        state={specState}
        actions={
          specDoc?.md ? (
            <a className="button-link" href={`/api/experiments/${id}/spec`} download={`${exp.id}-spec.md`}>
              Download
            </a>
          ) : undefined
        }
      >
        {specDoc?.md && <Markdown source={specDoc.md} />}
      </Panel>
    </div>
  );
}

function TopBar() {
  return (
    <nav className="topbar">
      <Link href="/" className="brand">Rehearsal</Link>
      <Link href="/">New experiment</Link>
    </nav>
  );
}

function SeverityCounts({ findings }: { findings: Experiment["findings"] }) {
  const counts = SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length] as const).filter(([, n]) => n > 0);
  if (counts.length === 0) return <span className="tabular">0</span>;
  return (
    <span className="sev-counts tabular">
      {counts.map(([s, n]) => (
        <span key={s} className={`dot-count sev-${s}`}>{n} {s}</span>
      ))}
    </span>
  );
}
