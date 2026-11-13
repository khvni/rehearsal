import { SpecChange, SpecReport, type Experiment, type LlmClient } from "../contracts";
import { stripFences } from "./findings";
import { RUBRIC } from "./rubric";

/**
 * SpecReport — the deliverable: ordered change list traced to evidence +
 * a phased rebuild plan for a better version of the target site.
 */
export async function generateSpec(experiment: Experiment, llm: LlmClient): Promise<SpecReport> {
  const base: SpecReport = {
    targetUrl: experiment.targetUrl,
    goal: experiment.goal,
    generatedAt: new Date().toISOString(),
    baselineRunIds: experiment.browserTests.map((r) => r.runId),
    summary: "",
    changes: [],
    rebuildPhases: [],
  };

  // Deterministic change list from findings (always available).
  const sorted = [...experiment.findings].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
  const changes: SpecChange[] = sorted.map((f, i) => ({
    rank: i + 1,
    title: f.title,
    findingId: f.findingId,
    krugPrinciple: f.krugPrinciple,
    change: f.recommendation,
    rationale: `${f.description} [${f.evidenceType}; ${RUBRIC[f.category].question}]`,
    effort: f.severity === "critical" || f.severity === "high" ? "M" : "S",
    evidencePaths: f.evidencePaths,
  }));

  const llmSpec = await llm
    .complete(specPrompt(experiment, changes), { deep: true, json: true })
    .then((raw) => JSON.parse(stripFences(raw)) as Partial<SpecReport>)
    .catch(() => null);

  // LLM output is untrusted: keep it only when it parses against the contract.
  const llmChanges = SpecChange.array().safeParse(
    Array.isArray(llmSpec?.changes) ? llmSpec.changes.map((c, i) => ({ ...c, rank: i + 1 })) : undefined,
  );
  const llmPhases = SpecReport.shape.rebuildPhases.safeParse(llmSpec?.rebuildPhases);
  return {
    ...base,
    summary: typeof llmSpec?.summary === "string" && llmSpec.summary.trim() ? llmSpec.summary : fallbackSummary(experiment, changes.length),
    changes: llmChanges.success && llmChanges.data.length >= changes.length ? llmChanges.data : changes,
    rebuildPhases: llmPhases.success && llmPhases.data.length > 0 ? llmPhases.data : fallbackPhases(changes),
  };
}

function severityRank(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
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
Return JSON: {"summary": "<=2 short, plain sentences", "changes": [{"title","change","rationale","effort":"S|M|L","krugPrinciple"?}], "rebuildPhases": [{"name","goal","items":[]}]}.
Order changes by impact. Rebuild plan = 3-4 phases for a cleaner version of the site, each phase listing concrete items.`;
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
    lines.push(`- Rationale: ${c.rationale}`);
    if (c.krugPrinciple) lines.push(`- Krug principle: ${c.krugPrinciple}`);
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
