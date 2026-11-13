import type { Experiment, SpecChange, SpecReport } from "../contracts";
import type { LlmClient } from "./gemini";
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

  return {
    ...base,
    summary: llmSpec?.summary ?? fallbackSummary(experiment),
    changes:
      llmSpec?.changes && llmSpec.changes.length >= changes.length
        ? llmSpec.changes.map((c, i) => ({ ...c, rank: i + 1 }) as SpecChange)
        : changes,
    rebuildPhases:
      llmSpec?.rebuildPhases && llmSpec.rebuildPhases.length > 0
        ? llmSpec.rebuildPhases
        : fallbackPhases(changes),
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
Return JSON: {"summary": "<=2 sentences", "changes": [{"title","change","rationale","effort":"S|M|L","krugPrinciple"?}], "rebuildPhases": [{"name","goal","items":[]}]}.
Order changes by impact. Rebuild plan = 3-4 phases for a cleaner version of the site, each phase listing concrete items.`;
}

function fallbackSummary(experiment: Experiment): string {
  const verified = experiment.findings.filter((f) => f.evidenceType === "verified-failure").length;
  const concerns = experiment.findings.filter((f) => f.evidenceType === "reproducible-concern").length;
  return `Rehearsal verified ${experiment.browserTests.length} browser runs against ${experiment.targetUrl}: ${verified} verified failure(s), ${concerns} reproducible concern(s). ${experiment.findings.length} total findings mapped to ${experiment.spec?.changes.length ?? experiment.findings.length} proposed changes.`;
}

function fallbackPhases(changes: SpecChange[]): SpecReport["rebuildPhases"] {
  const high = changes.filter((c) => c.effort !== "S").map((c) => c.title);
  const small = changes.filter((c) => c.effort === "S").map((c) => c.title);
  return [
    {
      name: "Truth pass",
      goal: "Remove anything stale or misleading — copy must match reality.",
      items: high.length > 0 ? high : ["Audit all dates and CTAs for stale claims"],
    },
    {
      name: "Hierarchy pass",
      goal: "One obvious primary action; scanning-friendly structure.",
      items: ["Rebuild nav to ~7 items max", "Single dominant CTA above the fold", ...small.slice(0, 3)],
    },
    {
      name: "Verification loop",
      goal: "Rehearse the rebuild against the same assertions before shipping.",
      items: ["Re-run experiment on staging", "Compare baseline vs. rebuild deltas"],
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
