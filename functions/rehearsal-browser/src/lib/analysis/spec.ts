import { SpecChange, SpecReport, USABILITY_PRINCIPLES, type Experiment, type Finding, type LlmClient } from "../contracts";
import { stripFences } from "./findings";
import { RUBRIC } from "./rubric";

/**
 * SpecReport — the deliverable: ordered change list traced to evidence +
 * a phased rebuild plan for a better version of the target site.
 * Every finding produces at least one change, and every change carries an
 * ordered `steps` list of concrete edits (the control or page it lands on).
 */
export async function generateSpec(experiment: Experiment, llm: LlmClient): Promise<SpecReport> {
  const base: SpecReport = {
    targetUrl: experiment.targetUrl,
    goal: experiment.goal,
    generatedAt: new Date().toISOString(),
    baselineRunIds: experiment.browserTests.filter((r) => !r.variantId).map((r) => r.runId),
    summary: "",
    changes: [],
    rebuildPhases: [],
  };

  // Deterministic change list from findings (always available, covers every finding).
  const sorted = [...experiment.findings].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
  const changes: SpecChange[] = sorted.map((f, i) => ({
    rank: i + 1,
    title: f.title,
    findingId: f.findingId,
    principle: f.principle,
    change: f.recommendation,
    steps: stepsForFinding(experiment, f),
    rationale: `${f.description} [${f.evidenceType}; ${RUBRIC[f.category].question}]`,
    effort: f.severity === "critical" || f.severity === "high" ? "M" : "S",
    evidencePaths: f.evidencePaths,
  }));

  const llmSpec: unknown = await llm
    .complete(specPrompt(experiment, changes), { deep: true, json: true })
    .then((raw) => JSON.parse(stripFences(raw)))
    .catch(() => null);
  // LLM output is untrusted: keep only the parts that parse against the contract.
  const fields = llmSpec && typeof llmSpec === "object" ? (llmSpec as Record<string, unknown>) : {};
  const summary = SpecReport.shape.summary.safeParse(fields.summary);
  const llmChanges = Array.isArray(fields.changes)
    ? fields.changes.flatMap((c, i) => {
        const r = SpecChange.safeParse(c && typeof c === "object" ? { ...c, rank: i + 1 } : c);
        return r.success ? [r.data] : [];
      })
    : [];
  const phases = SpecReport.shape.rebuildPhases.safeParse(fields.rebuildPhases);

  // Prefer the LLM rewrite when it is at least as complete, but never let a finding
  // drop out: append any uncovered finding's deterministic change, then re-rank.
  const merged = llmChanges.length >= changes.length ? [...llmChanges] : [...changes];
  const covered = new Set(merged.flatMap((c) => (c.findingId ? [c.findingId] : [])));
  for (const d of changes) {
    if (d.findingId && !covered.has(d.findingId)) merged.push(d);
  }
  // Any change without steps inherits the deterministic list for its finding,
  // or its own `change` line — a spec entry never ships as narrative only.
  const stepsByFinding = new Map(changes.flatMap((c) => (c.findingId ? [[c.findingId, c.steps]] : [])));
  for (const [i, c] of merged.entries()) {
    c.rank = i + 1;
    if (c.steps.length === 0) c.steps = stepsByFinding.get(c.findingId ?? "") ?? [c.change];
  }

  return {
    ...base,
    summary: summary.success && summary.data.trim() ? summary.data : fallbackSummary(experiment, changes.length),
    changes: merged,
    rebuildPhases: phases.success && phases.data.length > 0 ? phases.data : fallbackPhases(changes),
  };
}

// Steps are a checklist: generous bounds, and anything past them is still counted aloud.
const MAX_ACTION_STEPS = 12;
const MAX_URL_STEPS = 8;

function severityRank(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n).replace(/[\s,;:–—-]+$/, "")}…`;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return url;
  }
}

/**
 * The concrete edit list for one finding: the recommendation itself, then one
 * line per affected control and per affected page so nothing is left implicit.
 */
function stepsForFinding(experiment: Experiment, f: Finding): string[] {
  const states = experiment.graph?.states ?? [];
  const stateById = new Map(states.map((s) => [s.stateId, s]));
  const steps: string[] = [f.recommendation];

  const labels = new Set<string>();
  for (const id of f.affectedActions) {
    for (const s of states) {
      const a = s.actions.find((x) => x.actionId === id);
      if (a?.label) labels.add(`Update the "${clip(a.label, 60)}" ${a.role ?? "control"}`);
      if (a?.label) break;
    }
  }
  const actionSteps = [...labels];
  steps.push(...actionSteps.slice(0, MAX_ACTION_STEPS));

  const urls = new Set<string>();
  for (const sid of f.affectedStates) {
    const url = stateById.get(sid)?.url;
    if (url) urls.add(`Apply on ${shortUrl(url)}`);
  }
  const urlSteps = [...urls];
  steps.push(...urlSteps.slice(0, MAX_URL_STEPS));

  const dropped = Math.max(0, actionSteps.length - MAX_ACTION_STEPS) + Math.max(0, urlSteps.length - MAX_URL_STEPS);
  if (dropped > 0) steps.push(`…and ${dropped} more affected location${dropped === 1 ? "" : "s"}`);
  return steps;
}

function specPrompt(experiment: Experiment, changes: SpecChange[]): string {
  return `You are writing a rebuild spec for ${experiment.targetUrl}.
GOAL: ${experiment.goal}
FINDINGS-DERIVED CHANGES:\n${JSON.stringify(changes)}
Verified run failures:\n${JSON.stringify(
    experiment.browserTests.flatMap((r) =>
      r.assertions.filter((a) => !a.passed).map((a) => a.assertion.value),
    ),
  )}
Return JSON: {"summary": "<=2 short, plain sentences", "changes": [{"title","change","steps":["ordered concrete edits naming the element and page"],"rationale","effort":"S|M|L","principle"?,"findingId"?}], "rebuildPhases": [{"name","goal","items":[]}]}. Write summary and change text in plain language a site owner can act on.
Order changes by impact. One change per finding minimum — carry findingId through. Rebuild plan = 3-4 phases for a cleaner version of the site, each phase listing concrete items.`;
}

function fallbackSummary(experiment: Experiment, changes: number): string {
  const verified = experiment.findings.filter((f) => f.evidenceType === "verified-failure").length;
  const concerns = experiment.findings.filter((f) => f.evidenceType === "reproducible-concern").length;
  return `Rehearsal ran ${count(experiment.browserTests.length, "browser run")} on ${experiment.targetUrl}. It found ${count(verified, "verified failure")} and ${count(concerns, "reproducible concern")}. ${count(experiment.findings.length, "finding")} became ${count(changes, "change")}.`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function fallbackPhases(changes: SpecChange[]): SpecReport["rebuildPhases"] {
  const high = changes.filter((c) => c.effort !== "S").map((c) => c.title);
  const small = changes.filter((c) => c.effort === "S").map((c) => c.title);
  return [
    {
      name: "Truth pass",
      goal: "Fix anything stale or wrong. The page should say what is true today.",
      items: high.length > 0 ? high : ["Check every date and button for stale claims"],
    },
    {
      name: "Hierarchy pass",
      goal: "Make one action obvious and the page easy to scan.",
      items: ["Cut the main nav to about 7 items", "Put one main call to action above the fold", ...small.slice(0, 3)],
    },
    {
      name: "Verification loop",
      goal: "Run the same checks on the rebuild before it ships.",
      items: ["Rerun the experiment on staging", "Compare the baseline with the rebuild"],
    },
  ];
}

/** Render SpecReport as markdown — the file the demo hands over. */
export function specToMarkdown(spec: SpecReport): string {
  const lines: string[] = [
    `# Rehearsal spec — ${spec.targetUrl}`,
    "",
    `Goal: ${spec.goal}`,
    `Generated: ${spec.generatedAt}`,
    "",
    `## Summary`,
    spec.summary,
    "",
    `## Changes (by impact)`,
    "",
  ];
  for (const c of spec.changes) {
    lines.push(`### ${c.rank}. ${c.title} [${c.effort}]`);
    lines.push(`- Change: ${c.change}`);
    if (c.steps.length > 0) {
      lines.push("- Steps:");
      for (const s of c.steps) lines.push(`  - ${s}`);
    }
    lines.push(`- Rationale: ${c.rationale}`);
    if (c.principle) lines.push(`- Principle: ${USABILITY_PRINCIPLES[c.principle]?.title ?? c.principle}`);
    if (c.findingId) lines.push(`- Evidence: finding ${c.findingId}${c.evidencePaths.length ? ` (${c.evidencePaths.join(", ")})` : ""}`);
    lines.push("");
  }
  lines.push("## Rebuild plan", "");
  for (const p of spec.rebuildPhases) {
    lines.push(`### ${p.name}`);
    lines.push(`Goal: ${p.goal}`);
    for (const item of p.items) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n");
}
