"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Experiment, Finding, KrugPrinciple, PanelState, Viewport } from "@/lib/contracts";
import { KrugChip, SEVERITY_ORDER, SeverityChip } from "../../_components/chips";
import { Markdown } from "../../_components/markdown";
import { CheckIcon, CrossIcon, ArrowIcon, DownloadIcon } from "../../_components/icons";
import { Panel } from "../../_components/panel";
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
          <p className="state-title">Couldn&apos;t load this experiment</p>
          <p className="state-text">{loadError}</p>
          <div className="row">
            <button type="button" onClick={() => void refresh()}>Try again</button>
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
        <div className="state page-state" role="status" aria-busy>
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
    "Mapping the site’s states…",
    "Nothing mapped yet. Discover visits the page and records every state a visitor can reach.",
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
  const stageDone: Record<(typeof STAGES)[number], boolean> = {
    discover: (graph?.states.length ?? 0) > 0,
    simulate: exp.simulations.length > 0,
    verify: runs.length > 0,
    analyze: findings.length > 0,
    compare: exp.variants.length + exp.comparisons.length > 0,
    spec: Boolean(exp.spec),
  };
  // Stages run in order and analyze/compare may legitimately produce nothing, so a later stage implies earlier ones ran.
  for (let i = STAGES.length - 2; i >= 0; i--) stageDone[STAGES[i]] ||= stageDone[STAGES[i + 1]];
  const nextStage = STAGES.find((s) => !stageDone[s]);
  const stageActive = (s: (typeof STAGES)[number]) =>
    pending === s || ((pending === "run" || RUNNING_STATUSES.includes(exp.status)) && s === nextStage);
  const doneCount = STAGES.filter((s) => stageDone[s]).length;
  const statusClass = exp.status === "failed" ? "failed" : exp.status === "complete" ? "ok" : RUNNING_STATUSES.includes(exp.status) ? "running" : "";
  const specState: PanelState = (() => {
    const err = stageErrors.spec ?? (specDoc?.key === specKey ? specDoc?.error : undefined);
    if (err && !specDoc?.md) return { kind: "error", message: err, onRetry: specKey ? () => void loadSpec() : () => void runStage("spec") };
    if (specDoc?.md) return { kind: "ready" };
    if (busy("spec") || (specKey && specDoc?.key !== specKey)) return { kind: "loading", label: "Writing spec.md…" };
    return { kind: "empty", message: "No spec yet. It lists every fix, ranked, once the earlier steps have run." };
  })();

  const runButton = (stage: (typeof STAGES)[number]) => (
    <button type="button" disabled={pending !== null} onClick={() => void runStage(stage)}>
      Run {stage}
    </button>
  );
  const passed = runs.filter((r) => r.success).length;

  return (
    <div className="page">
      <TopBar />
      <header className="exp-head">
        <h1>{exp.goal}</h1>
        <div className="exp-meta">
          <span className={`pill ${statusClass}`}>{exp.status}</span>
          <a className="mono" href={exp.targetUrl} target="_blank" rel="noreferrer">{exp.targetUrl}</a>
          <span className="tabular">{exp.configuration.viewports.join(" + ")}</span>
          <span className="tabular">{exp.simulations.length.toLocaleString()} journeys</span>
          <span className="mono">{exp.id}</span>
        </div>
      </header>

      <div className="pipeline">
        <ol className="steps-bar" role="toolbar" aria-label="Pipeline stages">
          {STAGES.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                className={`step ${stageDone[s] ? "done" : ""} ${stageActive(s) ? "active" : ""}`}
                disabled={pending !== null}
                onClick={() => void runStage(s)}
                aria-label={`${STAGE_LABEL[s]}: ${stageActive(s) ? "running" : stageDone[s] ? "done" : "not run"}. Run this step.`}
              >
                <span className="step-mark" aria-hidden>{stageDone[s] ? <CheckIcon size={12} /> : i + 1}</span>
                <span className="step-name">{STAGE_LABEL[s]}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="primary pipeline-run" disabled={pending !== null} onClick={() => void runStage("run")}>
          {pending === "run" ? "Running…" : doneCount === STAGES.length ? "Run again" : "Run all steps"}
        </button>
      </div>

      {(stageErrors.run || exp.errors.length > 0) && (
        <div className="banner" role="alert">
          {stageErrors.run && <div>The run stopped: {stageErrors.run}</div>}
          {exp.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      <div className="grid">
        <Panel
          title="Decision graph"
          className="span-2"
          meta={<span className="tabular">{viewportStates.length} states · {viewportEdges.length} links</span>}
          busy={busy("graph")}
          state={graphState}
          emptyAction={!graph ? runButton("discover") : undefined}
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
          {graph && <StateGraph graph={graph} simulations={exp.simulations} viewport={viewport} />}
          <div className="graph-foot">
            {exp.simulations.length > 0 ? <HeatLegend max={maxVisits} /> : <span>Run simulate to shade states by how often journeys reach them.</span>}
            <span className="graph-hint">
              <span>Hover a state to trace its links</span>
              <span className="mono tabular">
                {viewportStates[0]?.viewport.width ?? (viewport === "mobile" ? 390 : 1440)}×{viewportStates[0]?.viewport.height ?? (viewport === "mobile" ? 844 : 900)}
              </span>
            </span>
          </div>
        </Panel>

        <Panel
          title="Browser runs"
          meta={runs.length > 0 && <span className="tabular">{passed} of {runs.length} passed</span>}
          busy={busy("evidence")}
          enter="none"
          emptyAction={runButton("verify")}
          state={panelState("evidence", runs.length > 0, "Replaying journeys in real browsers…", "No browser runs yet. Verify replays the riskiest journeys on desktop and mobile.")}
        >
          <div className="list stagger">
            {runs.map((r) => (
              <div key={r.runId} className="card">
                <div className="card-title">
                  <span className={`chip ${r.success ? "pass" : "fail"}`}>
                    {r.success ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
                    {r.success ? "Passed" : "Failed"}
                  </span>
                  <span className="mono">{r.runId}</span>
                  <span className="muted">{r.viewport.name}</span>
                  <span className="muted tabular right">{r.durationMs.toLocaleString()} ms</span>
                </div>
                {r.steps.length > 0 && (
                  <ol className="run-path" aria-label="Steps">
                    {r.steps.map((s, i) => (
                      <li key={i} className={s.ok ? "ok" : "fail"} title={s.error ?? s.label}>
                        {i > 0 && <ArrowIcon size={12} className="arrow" />}
                        {!s.ok && <CrossIcon size={12} />}
                        <span>{s.label}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {r.assertions.map((a, i) => (
                  <div key={i} className={`assert ${a.passed ? "ok" : "fail"}`}>
                    {a.passed ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
                    <span><span className="mono">{a.assertion.kind}</span> {a.assertion.value}</span>
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
          enter="none"
          emptyAction={runs.length > 0 ? runButton("analyze") : undefined}
          state={panelState("findings", findings.length > 0, "Grading against Krug’s rubric…", runs.length > 0 ? "No findings yet. Analyze grades what the browser runs found." : "No findings yet. They come from the browser runs, so run verify first.")}
        >
          <div className="list stagger">
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
                      <span className="chip">{EVIDENCE_LABEL[f.evidenceType] ?? f.evidenceType}</span>
                      <span className="card-meta">{f.category} · {f.verificationStatus}</span>
                    </div>
                    <h3 className="card-heading">{f.title}</h3>
                    <p className="card-body">{f.description}</p>
                    <p className="card-rec"><b>Fix:</b> {f.recommendation}</p>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </Panel>

        <Panel
          title="Baseline vs variant"
          className="span-2"
          meta={exp.variants.length + exp.comparisons.length > 0 && <span className="tabular">{exp.variants.length} variants · {exp.comparisons.length} comparisons</span>}
          busy={busy("comparisons")}
          emptyAction={findings.length > 0 ? runButton("compare") : undefined}
          state={panelState(
            "comparisons",
            exp.variants.length + exp.comparisons.length > 0,
            "Patching the page and running it again…",
            "No variant yet. Compare patches the top finding and runs the same journey again.",
          )}
        >
          <div className="compare">
            <div>
              {exp.comparisons.map((c, i) => (
                <table key={i} className="delta">
                  <thead>
                    <tr><th>Metric</th><th>Baseline</th><th>Variant</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Goal reached</td><td>{c.deltas.goalCompleted.baseline ? "Yes" : "No"}</td><td className={delta(Number(c.deltas.goalCompleted.variant), Number(c.deltas.goalCompleted.baseline))}>{c.deltas.goalCompleted.variant ? "Yes" : "No"}</td></tr>
                    <tr><td>Interactions</td><td>{c.deltas.interactionCount.baseline}</td><td className={delta(c.deltas.interactionCount.baseline, c.deltas.interactionCount.variant)}>{c.deltas.interactionCount.variant}</td></tr>
                    <tr><td>Failed interactions</td><td>{c.deltas.failedInteractions.baseline}</td><td className={delta(c.deltas.failedInteractions.baseline, c.deltas.failedInteractions.variant)}>{c.deltas.failedInteractions.variant}</td></tr>
                    <tr><td>Runtime errors</td><td>{c.deltas.runtimeErrors.baseline}</td><td className={delta(c.deltas.runtimeErrors.baseline, c.deltas.runtimeErrors.variant)}>{c.deltas.runtimeErrors.variant}</td></tr>
                    <tr><td>Finding still happens</td><td colSpan={2} className={c.deltas.findingReproduces ? "worse" : "better"}>{c.deltas.findingReproduces ? "Yes" : "No"}</td></tr>
                  </tbody>
                </table>
              ))}
            </div>
            <div>
              {exp.variants.map((v) => (
                <div key={v.variantId} className="card">
                  <div className="card-title">
                    <span className={`chip variant-${v.status}`}>{v.status}</span>
                    <span className="mono">{v.variantId}</span>
                  </div>
                  <p className="card-body">{v.description}</p>
                  <div className="card-meta mono">{v.patches.map((p) => `${p.op} ${p.selector}`).join(" · ")}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="spec.md"
        className="spec-panel"
        busy={busy("spec")}
        state={specState}
        emptyAction={findings.length > 0 ? runButton("spec") : undefined}
        actions={
          specDoc?.md ? (
            <a className="button-link" href={`/api/experiments/${id}/spec`} download={`${exp.id}-spec.md`}>
              <DownloadIcon size={14} />
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

const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  discover: "Discover",
  simulate: "Simulate",
  verify: "Verify",
  analyze: "Analyze",
  compare: "Compare",
  spec: "Spec",
};

const EVIDENCE_LABEL: Record<string, string> = {
  "verified-failure": "Verified failure",
  "reproducible-concern": "Reproducible concern",
  hypothesis: "Hypothesis",
};

/** Lower is better for every numeric delta shown; goal reached is passed as (variant, baseline). */
function delta(baseline: number, variant: number): string | undefined {
  if (variant < baseline) return "better";
  if (variant > baseline) return "worse";
  return undefined;
}

function TopBar() {
  return (
    <nav className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden />
        Rehearsal
      </Link>
      <Link href="/">New experiment</Link>
    </nav>
  );
}

function SeverityCounts({ findings }: { findings: Experiment["findings"] }) {
  const counts = SEVERITY_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length] as const).filter(([, n]) => n > 0);
  if (counts.length === 0) return null;
  return (
    <span className="sev-counts tabular">
      {counts.map(([s, n]) => (
        <span key={s} className={`sev-count sev-${s}`}>{n} {s}</span>
      ))}
    </span>
  );
}
