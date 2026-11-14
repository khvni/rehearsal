"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Experiment, Finding, KrugPrinciple, PanelState, Viewport } from "@/lib/contracts";
import { KrugChip, SEVERITY_ORDER, SeverityChip } from "../../_components/chips";
import { KRUG_PRINCIPLES } from "../../_components/krug";
import { Markdown } from "../../_components/markdown";
import { CheckIcon, CrossIcon, ArrowIcon, DownloadIcon } from "../../_components/icons";
import { Panel } from "../../_components/panel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardGroup } from "@/components/ui/card";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { ThinkingStep, ThinkingSteps, ThinkingStepsContent, ThinkingStepsHeader } from "@/components/ui/thinking-steps";
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
    "Nothing mapped yet.",
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
  const live = pending !== null || RUNNING_STATUSES.includes(exp.status);
  const statusColor = exp.status === "failed" ? "red" : exp.status === "complete" ? "green" : RUNNING_STATUSES.includes(exp.status) ? "blue" : "gray";
  const specState: PanelState = (() => {
    const err = stageErrors.spec ?? (specDoc?.key === specKey ? specDoc?.error : undefined);
    if (err && !specDoc?.md) return { kind: "error", message: err, onRetry: specKey ? () => void loadSpec() : () => void runStage("spec") };
    if (specDoc?.md) return { kind: "ready" };
    if (busy("spec") || (specKey && specDoc?.key !== specKey)) return { kind: "loading", label: "Writing spec.md…" };
    return { kind: "empty", message: "No spec yet." };
  })();

  const runButton = (stage: (typeof STAGES)[number]) => (
    <Button variant="secondary" size="compact" disabled={pending !== null} onClick={() => void runStage(stage)}>
      Run {stage}
    </Button>
  );
  const passed = runs.filter((r) => r.success).length;

  return (
    <div className="page">
      <TopBar />
      <header className="exp-head">
        <h1>{exp.goal}</h1>
        <div className="exp-meta">
          <Badge variant="dot" color={statusColor}>{exp.status}</Badge>
          <a className="mono" href={exp.targetUrl} target="_blank" rel="noreferrer">{exp.targetUrl}</a>
          <span className="tabular">{exp.simulations.length.toLocaleString()} journeys</span>
          <span className="sep" aria-hidden>·</span>
          <span className="tabular">{shortDate(exp.createdAt)}</span>
        </div>
      </header>

      <div className="pipeline">
        <ol className="steps-bar" role="toolbar" aria-label="Pipeline stages">
          {STAGES.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                className={`step ${stageDone[s] && !stageErrors[s] ? "done" : ""} ${stageActive(s) ? "active" : ""} ${stageErrors[s] ? "error" : ""}`}
                disabled={pending !== null}
                onClick={() => void runStage(s)}
                aria-current={stageActive(s) ? "step" : undefined}
                aria-label={`${STAGE_LABEL[s]}: ${stageActive(s) ? "running" : stageErrors[s] ? "failed" : stageDone[s] ? "done" : "not run"}. Run this step.`}
              >
                <span className="step-mark" aria-hidden>{stageErrors[s] ? <CrossIcon size={12} /> : stageDone[s] ? <CheckIcon size={12} /> : i + 1}</span>
                <span className="step-name">{STAGE_LABEL[s]}</span>
              </button>
            </li>
          ))}
        </ol>
        <Button className="pipeline-run" loading={pending === "run"} disabled={pending !== null} onClick={() => void runStage("run")}>
          {pending === "run" ? "Running…" : doneCount === STAGES.length ? "Run again" : "Run all steps"}
        </Button>
        {!live && (
          <p className="pipeline-status tabular">
            {doneCount === STAGES.length ? "All steps complete" : `${doneCount} of ${STAGES.length} steps complete`}
          </p>
        )}
      </div>

      {live && (
        <ThinkingSteps className="live">
          <ThinkingStepsHeader>{`Rehearsing, step ${Math.min(doneCount + 1, STAGES.length)} of ${STAGES.length}`}</ThinkingStepsHeader>
          <ThinkingStepsContent>
            {STAGES.map((s, i) => (
              <ThinkingStep
                key={s}
                label={STAGE_LABEL[s]}
                description={STAGE_LINE[s]}
                status={stageActive(s) ? "active" : stageDone[s] ? "complete" : "pending"}
                isLast={i === STAGES.length - 1}
              />
            ))}
          </ThinkingStepsContent>
        </ThinkingSteps>
      )}

      {(stageErrors.run || exp.errors.length > 0) && (
        <Banner status="error" className="run-banner">
          <BannerTitle>{stageErrors.run ? `The run stopped: ${stageErrors.run}` : "A step reported an error"}</BannerTitle>
          {exp.errors.length > 0 && (
            <BannerDescription>
              {exp.errors.map((e, i) => (
                <span key={i} className="block">{e}</span>
              ))}
            </BannerDescription>
          )}
        </Banner>
      )}

      <div className="grid">
        <Panel
          title="Decision graph"
          className="span-2"
          meta={<span className="tabular">{viewportStates.length} states · {viewportEdges.length} links</span>}
          busy={busy("graph")}
          loadingPreview={<div className="skel-canvas" />}
          state={graphState}
          emptyAction={!graph ? runButton("discover") : undefined}
          actions={
            <Tabs
              idPrefix="viewport"
              aria-label="Viewport"
              size="compact"
              selectedIndex={VIEWPORTS.indexOf(viewport)}
              onSelect={(i) => setViewport(VIEWPORTS[i])}
            >
              {VIEWPORTS.map((v, i) => (
                <TabsItem key={v} index={i} label={`${VIEWPORT_LABEL[v]} ${byViewport[v]}`} />
              ))}
            </Tabs>
          }
        >
          {graph && <StateGraph graph={graph} simulations={exp.simulations} viewport={viewport} />}
          <div className="graph-foot">
            {exp.simulations.length > 0 ? <HeatLegend max={maxVisits} /> : <span>Run simulate to shade the busy states.</span>}
          </div>
        </Panel>

        <Panel
          title="Browser runs"
          meta={runs.length > 0 && <span className="tabular">{passed} of {runs.length} passed</span>}
          busy={busy("evidence")}
          enter="none"
          loadingPreview={<SkeletonRows />}
          emptyAction={runButton("verify")}
          state={panelState("evidence", runs.length > 0, "Replaying journeys…", "Nobody has tried it yet.")}
        >
          <CardGroup className="list stagger" fluidHover={false}>
            {runs.map((r, idx) => (
              <Card key={r.runId} index={idx} className="run-card">
                <CardContent className="card">
                <div className="card-title">
                  <Badge variant="dot" color={r.success ? "green" : "red"}>
                    {r.success ? "Passed" : "Failed"}
                  </Badge>
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
                        {!s.ok && <span className="sr-only">Failed: </span>}
                        <span>{s.label}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {r.assertions.map((a, i) => (
                  <div key={i} className={`assert ${a.passed ? "ok" : "fail"}`}>
                    {a.passed ? <CheckIcon size={12} /> : <CrossIcon size={12} />}
                    <span className="sr-only">{a.passed ? "Passed: " : "Failed: "}</span>
                    <span><span className="mono">{a.assertion.kind}</span> {a.assertion.value}</span>
                  </div>
                ))}
                </CardContent>
              </Card>
            ))}
          </CardGroup>
        </Panel>

        <Panel
          title="Findings"
          meta={<SeverityCounts findings={findings} />}
          busy={busy("findings")}
          enter="none"
          loadingPreview={<SkeletonRows />}
          emptyAction={runs.length > 0 ? runButton("analyze") : undefined}
          state={panelState("findings", findings.length > 0, "Grading…", runs.length > 0 ? "Nothing graded yet." : "Nothing to grade until verify runs.")}
        >
          <Accordion type="multiple" className="list w-full" defaultValue={findingGroups.slice(0, 1).map(([p]) => p)}>
            {findingGroups.map(([principle, group], gi) => (
              <AccordionItem key={principle} value={principle} index={gi} className="finding-group">
                <AccordionTrigger>
                  <span className="group-trigger">
                    {KRUG_PRINCIPLES[principle].name}
                    <span className="group-count tabular">{group.length}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                <section className="finding-list stagger" aria-label={`${group.length} findings`}>
                {group.map((f) => (
                  <article key={f.findingId} className="finding">
                    <div className="chips">
                      <SeverityChip severity={f.severity} />
                      <KrugChip principle={principle} />
                      <Badge variant="dot" color={f.evidenceType === "verified-failure" ? "red" : f.evidenceType === "hypothesis" ? "gray" : "blue"}>{EVIDENCE_LABEL[f.evidenceType] ?? f.evidenceType}</Badge>
                      <span className="card-meta">{f.category} · {f.verificationStatus}</span>
                    </div>
                    <h3 className="card-heading">{f.title}</h3>
                    <p className="card-body">{f.description}</p>
                    <p className="card-rec"><b>Fix:</b> {f.recommendation}</p>
                  </article>
                ))}
                </section>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Panel>

        <Panel
          title="Baseline vs variant"
          className="span-2"
          meta={exp.variants.length + exp.comparisons.length > 0 && <span className="tabular">{exp.variants.length} variants · {exp.comparisons.length} comparisons</span>}
          busy={busy("comparisons")}
          loadingPreview={<SkeletonRows />}
          emptyAction={findings.length > 0 ? runButton("compare") : undefined}
          state={panelState(
            "comparisons",
            exp.variants.length + exp.comparisons.length > 0,
            "Rehearsing the fix…",
            "No second take yet.",
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
                    <Badge variant="dot" className="capitalize" color={v.status === "rejected" ? "red" : v.status === "proposed" ? "gray" : "green"}>{v.status}</Badge>
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
        meta={exp.spec && <span className="tabular">{shortDate(exp.spec.generatedAt)}</span>}
        busy={busy("spec")}
        loadingPreview={<SkeletonRows />}
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

const STAGE_LINE: Record<(typeof STAGES)[number], string> = {
  discover: "Walks the page and maps every state",
  simulate: "Sends a thousand pretend visitors",
  verify: "Replays the risky paths in real browsers",
  analyze: "Grades what went wrong",
  compare: "Patches the page and tries again",
  spec: "Writes up what to fix",
};

const VIEWPORTS = ["desktop", "mobile"] as const;
const VIEWPORT_LABEL: Record<(typeof VIEWPORTS)[number], string> = { desktop: "Desktop", mobile: "Mobile" };

const EVIDENCE_LABEL: Record<string, string> = {
  "verified-failure": "Verified failure",
  "reproducible-concern": "Reproducible concern",
  hypothesis: "Hypothesis",
};

function SkeletonRows() {
  return (
    <div className="skel-rows">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skel-row">
          <span className="skeleton" />
          <span className="skeleton short" />
        </div>
      ))}
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Lower is better for every numeric delta shown; goal reached is passed as (variant, baseline). */
function delta(baseline: number, variant: number): string | undefined {
  if (variant < baseline) return "better";
  if (variant > baseline) return "worse";
  return undefined;
}

function TopBar() {
  return (
    <nav className="topbar">
      <Link href="/" className="brand wordmark">
        Rehearsal
      </Link>
      <Link href="/" className="new-link">New experiment</Link>
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
