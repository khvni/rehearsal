import type { Finding } from "../contracts";

const SEVERITY_RANK: Record<Finding["severity"], number> = { critical: 4, high: 3, medium: 2, low: 1 };
const EVIDENCE_RANK: Record<Finding["evidenceType"], number> = {
  "verified-failure": 3,
  "reproducible-concern": 2,
  hypothesis: 1,
};
const STATUS_RANK: Record<Finding["verificationStatus"], number> = { verified: 3, reproduced: 2, unverified: 1 };

const groupKey = (f: Finding) => `${f.krugPrinciple}|${f.title.trim().replace(/\s+/g, " ").toLowerCase()}`;
const union = (lists: string[][]) => [...new Set(lists.flat())];
const strongest = <T extends string>(values: T[], rank: Record<T, number>): T =>
  values.reduce((best, v) => (rank[v] > rank[best] ? v : best));

/**
 * Rules fire once per discovered state (or browser run), so the same finding repeats per page.
 * Collapse findings sharing (Krug principle + title) into one: first id, max severity, strongest
 * evidence, and the union of affected states/actions/evidence; the title gains an "N of M" count.
 */
export function collapseFindings(
  list: Finding[],
  totals: { states: number; runs: number },
): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const f of list) {
    const key = groupKey(f);
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }
  return [...groups.values()].map((group) => (group.length === 1 ? group[0] : merge(group, totals)));
}

function merge(group: Finding[], totals: { states: number; runs: number }): Finding {
  const [first] = group;
  const affectedStates = union(group.map((f) => f.affectedStates));
  const descriptions = [...new Set(group.map((f) => f.description))];
  const extra = descriptions.slice(1);
  return {
    ...first,
    title: `${first.title}${scope(group, affectedStates, totals)}`,
    severity: strongest(group.map((f) => f.severity), SEVERITY_RANK),
    evidenceType: strongest(group.map((f) => f.evidenceType), EVIDENCE_RANK),
    verificationStatus: strongest(group.map((f) => f.verificationStatus), STATUS_RANK),
    description: extra.length ? `${descriptions[0]} Also: ${extra.join(" ")}` : descriptions[0],
    affectedStates,
    affectedActions: union(group.map((f) => f.affectedActions)),
    evidencePaths: union(group.map((f) => f.evidencePaths)),
  };
}

function scope(group: Finding[], affectedStates: string[], totals: { states: number; runs: number }): string {
  if (affectedStates.length > 1) {
    return ` (${affectedStates.length} of ${Math.max(totals.states, affectedStates.length)} pages)`;
  }
  if (affectedStates.length === 0 && totals.runs > 0) {
    return ` (${group.length} of ${Math.max(totals.runs, group.length)} runs)`;
  }
  return "";
}
