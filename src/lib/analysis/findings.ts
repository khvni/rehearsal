import { randomUUID } from "node:crypto";
import type {
  Assertion,
  BrowserRun,
  Endpoint,
  EndpointClass,
  EndpointJourney,
  LlmClient,
  SiteState,
} from "../contracts";
import { isVagueLabel } from "../browser/extract";
import { failedGoalAssertions, isRunError } from "../browser/types";
import { uniqueStatesByUrl } from "../graph";
import { EvidenceType, Finding, RubricDimension, UsabilityPrinciple, Severity, LEGACY_PRINCIPLES } from "../contracts";
import { logEvent } from "../telemetry";
import { rubricPromptSection } from "./rubric";

let counter = 0;
const fid = () => `f_${randomUUID().slice(0, 8)}_${counter++}`;

/** Plain reading of an assertion kind for finding titles/descriptions. */
const ASSERTION_LABEL: Record<Assertion["kind"], string> = {
  "url-matches": "the URL",
  "text-present": "expected text",
  "text-absent": "text that should be gone",
  "element-visible": "a visible element",
  "element-present": "expected markup",
  "title-matches": "the page title",
};

/**
 * Deterministic rule-based findings — always run, require no LLM.
 * These are the "reproducible concern / verified failure" floor.
 */
export function ruleFindings(args: {
  states: SiteState[];
  runs: BrowserRun[];
  assertions: Assertion[];
  referenceNowIso?: string;
}): Finding[] {
  const { states, runs, assertions } = args;
  const findings: Finding[] = [];
  const now = args.referenceNowIso ? new Date(args.referenceNowIso) : new Date();

  // 1. Verified failures: any assertion that failed in a browser run.
  for (const run of runs) {
    for (const { assertion } of failedGoalAssertions(run)) {
      findings.push({
        findingId: fid(),
        title: `Browser check failed: ${ASSERTION_LABEL[assertion.kind]} "${assertion.value}"`,
        category: "goal-completion",
        severity: "high",
        evidenceType: "verified-failure",
        description: `In the ${run.viewport.name} browser run, ${ASSERTION_LABEL[assertion.kind]} didn't match "${assertion.value}" — what the check expected isn't what a visitor gets.`,
        affectedStates: [],
        affectedActions: [],
        evidencePaths: run.screenshotPaths,
        recommendation: "Open the live page and fix the mismatch so the check passes for a real visitor.",
        verificationStatus: "verified",
        principle: "test-dont-argue",
      });
    }
  }

  for (const state of states) {
    const text = state.visibleText.toLowerCase();

    // 2. Stale-content heuristic: past-dated event copy still invites action.
    const pastDates = [...new Set(extractPastDates(state.visibleText, now).map((d) => d.toUpperCase()))];
    const hasApplyCta = /\b(apply|register|sign up|get tickets|buy tickets|submit application)\b/i.test(
      state.visibleText,
    );
    if (pastDates.length > 0 && hasApplyCta) {
      findings.push({
        findingId: fid(),
        title: "The page still invites registration for an event that already happened",
        category: "copy-economy",
        severity: "high",
        evidenceType: "reproducible-concern",
        description: `"${state.pageTitle}" shows dates in the past (${pastDates.join(", ")}) next to apply/register language — visitors are invited to act on something that's over.`,
        affectedStates: [state.stateId],
        affectedActions: state.actions
          .filter((a) => /\b(apply|register)\b/i.test(a.label))
          .map((a) => a.actionId),
        evidencePaths: state.screenshotPath ? [state.screenshotPath] : [],
        recommendation:
          "Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.",
        verificationStatus: "reproduced",
        principle: "cut-needless-words",
      });
    }

    // 3. Vague labels — "learn more", "click here" (dont-make-users-think / obvious-choices).
    const vague = state.actions.filter((a) => isVagueLabel(a.label));
    if (vague.length > 0) {
      findings.push({
        findingId: fid(),
        title: `${vague.length} link label${vague.length === 1 ? " doesn't" : "s don't"} say where they go`,
        category: "cognitive-effort",
        severity: "medium",
        evidenceType: "reproducible-concern",
        description: `Labels like ${vague.map((v) => `"${v.label}"`).join(", ")} make visitors guess — they have to click to find out where the link leads.`,
        affectedStates: [state.stateId],
        affectedActions: vague.map((v) => v.actionId),
        evidencePaths: state.screenshotPath ? [state.screenshotPath] : [],
        recommendation: `Rename each label so it names its destination ("View pricing", not "Learn more").`,
        verificationStatus: "reproduced",
        principle: "dont-make-users-think",
      });
    }

    // 4. Nav overload — too many links for a visitor to sort at a glance.
    const links = state.actions.filter((a) => a.role === "link");
    if (links.length > 24) {
      findings.push({
        findingId: fid(),
        title: "Too many links compete for attention",
        category: "hierarchy",
        severity: "medium",
        evidenceType: "reproducible-concern",
        description: `"${state.pageTitle}" offers ${links.length} different links — too many choices to sort through at a glance.`,
        affectedStates: [state.stateId],
        affectedActions: [],
        evidencePaths: [],
        recommendation: "Group the secondary links under a few sections so the main action stands out.",
        verificationStatus: "reproduced",
        principle: "people-scan-they-dont-read",
      });
    }

    // 5. Missing H1-ish identity — nothing names the page.
    const isDocument = !/\.(txt|ics|xml|json|pdf)$/i.test(new URL(state.url).pathname);
    if (isDocument && (!state.pageTitle || state.pageTitle === state.url)) {
      findings.push({
        findingId: fid(),
        title: "Nothing names this page",
        category: "navigation",
        severity: "medium",
        evidenceType: "reproducible-concern",
        description: "No title text was found, so a visitor who lands here gets no \"you are here\" signal.",
        affectedStates: [state.stateId],
        affectedActions: [],
        evidencePaths: [],
        recommendation: "Give the page a descriptive title and a matching h1.",
        verificationStatus: "reproduced",
        principle: "where-you-are",
      });
    }

    void text;
  }

  // 6. Console/page errors during browser runs — data, not a goal failure.
  findings.push(...consoleErrorFindings(runs, states));

  void assertions;
  return findings;
}

/**
 * console-errors: one low-severity finding per viewport whose runs logged page/console errors.
 * Attributed to the first discovered state in that viewport — every run begins at the target URL.
 */
function consoleErrorFindings(runs: BrowserRun[], states: SiteState[]): Finding[] {
  const byViewport = new Map<string, BrowserRun[]>();
  for (const run of runs) {
    if (run.consoleErrorCount === 0) continue;
    byViewport.set(run.viewport.name, [...(byViewport.get(run.viewport.name) ?? []), run]);
  }
  return [...byViewport].map(([viewport, noisy]) => {
    const start = states.find((s) => s.viewport.name === viewport);
    const total = noisy.reduce((n, r) => n + r.consoleErrorCount, 0);
    const samples = [...new Set(noisy.flatMap((r) => r.errors.filter((e) => !isRunError(e))))].slice(0, 3);
    return {
      findingId: `f_console-errors_${viewport}`,
      title: `The page threw ${total} script error${total === 1 ? "" : "s"} during ${viewport} runs`,
      category: "consistency",
      severity: "low",
      evidenceType: "reproducible-concern",
      description: `${total} page/console errors across ${noisy.length} of ${runs.filter((r) => r.viewport.name === viewport).length} ${viewport} runs, e.g. ${samples.map((s) => `"${s.slice(0, 120)}"`).join(", ")}. They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably.`,
      affectedStates: start ? [start.stateId] : [],
      affectedActions: [],
      evidencePaths: noisy.flatMap((r) => r.screenshotPaths).slice(0, 3),
      recommendation: "Fix or silence the failing scripts so the page behaves the same for every visitor.",
      verificationStatus: "reproduced",
      principle: "test-dont-argue",
    } satisfies Finding;
  });
}

/**
 * Endpoint reachability findings (deterministic, from seeded endpoint journeys):
 * - unreachable: high-weight endpoint with zero goal-reached journeys
 * - deep: median journey > 3 steps
 * - missing-endpoint-class: site type expects a class (pricing/signup/…) that wasn't found
 */
export function endpointFindings(args: {
  endpoints: Endpoint[];
  journeys: EndpointJourney[];
  expectedClasses: EndpointClass[];
  siteType: string;
  statesDiscovered: number;
  highWeight?: number;
  deepSteps?: number;
}): Finding[] {
  const { endpoints, journeys, expectedClasses, siteType, statesDiscovered } = args;
  const highWeight = args.highWeight ?? 0.6;
  const deepSteps = args.deepSteps ?? 3;
  const byId = new Map(journeys.map((j) => [j.endpointId, j]));
  const findings: Finding[] = [];
  const affected = (e: Endpoint) => [...new Set([e.sourceStateId, e.stateId].filter(Boolean) as string[])];

  for (const e of endpoints) {
    const j = byId.get(e.endpointId);
    if (!j) continue;
    if (e.weight >= highWeight && j.goalReached === 0) {
      findings.push({
        findingId: `f_endpoint-unreachable_${e.endpointId}`,
        title: `Visitors can't reach "${e.label.slice(0, 60)}" (${e.class.replace("-", " ")})`,
        category: "navigation",
        severity: e.weight >= 0.85 ? "high" : "medium",
        evidenceType: "reproducible-concern",
        description: `"${e.label}" (${e.class}, importance ${e.weight}) at ${e.url} was reached in 0 of ${j.trajectories} sampled journeys from the start page — a visitor who wants it can't find the way.`,
        affectedStates: affected(e),
        affectedActions: e.actionId ? [e.actionId] : [],
        evidencePaths: [],
        recommendation: `Link "${e.label}" from persistent navigation or the start page with a label that names the ${e.class.replace("-", " ")} destination.`,
        verificationStatus: "reproduced",
        principle: "where-you-are",
      });
    } else if (j.medianSteps !== undefined && j.medianSteps > deepSteps) {
      findings.push({
        findingId: `f_endpoint-deep_${e.endpointId}`,
        title: `"${e.label.slice(0, 60)}" takes too many clicks to reach`,
        category: "navigation",
        severity: e.weight >= highWeight ? "medium" : "low",
        evidenceType: "reproducible-concern",
        description: `"${e.label}" (${e.class}, importance ${e.weight}) sits a median of ${j.medianSteps} steps from the start (${j.goalReached}/${j.trajectories} journeys reach it; shortest path: ${j.samplePath.join(" → ") || "n/a"}). Past ${deepSteps} steps the path stops being obvious.`,
        affectedStates: affected(e),
        affectedActions: e.actionId ? [e.actionId] : [],
        evidencePaths: [],
        recommendation: `Surface "${e.label}" within ${deepSteps} clicks of the start page, or make each intermediate link unambiguous about leading there.`,
        verificationStatus: "reproduced",
        principle: "obvious-choices",
      });
    }
  }

  const found = new Set(endpoints.map((e) => e.class));
  for (const cls of expectedClasses) {
    if (found.has(cls)) continue;
    findings.push({
      findingId: `f_missing-endpoint-class_${cls}`,
      title: `No ${cls.replace("-", " ")} page or link found`,
      category: "goal-completion",
      severity: cls === "pricing" || cls === "signup" ? "high" : "medium",
      evidenceType: "reproducible-concern",
      description: `A ${siteType} site should offer a ${cls.replace("-", " ")} destination, but nothing in the ${statesDiscovered} pages found leads to one.`,
      affectedStates: [],
      affectedActions: [],
      evidencePaths: [],
      recommendation: `Add a clearly labeled ${cls.replace("-", " ")} destination and link it from the primary navigation.`,
      verificationStatus: "reproduced",
      principle: "where-you-are",
    });
  }
  return findings;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, sept: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Find "Month D(-D), YYYY" dates fully in the past (full or abbreviated month names). */
export function extractPastDates(text: string, now: Date): string[] {
  const out: string[] = [];
  const monthNames = Object.keys(MONTHS).join("|");
  const re = new RegExp(
    `\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:\\s*[–—-]\\s*(\\d{1,2}))?,?\\s+(\\d{4})`,
    "gi",
  );
  for (const m of text.matchAll(re)) {
    const month = MONTHS[m[1].toLowerCase().replace(".", "")];
    const endDay = Number(m[3] ?? m[2]);
    const year = Number(m[4]);
    const end = new Date(Date.UTC(year, month, endDay, 23, 59, 59));
    if (end.getTime() < now.getTime()) out.push(m[0]);
  }
  return out;
}

/**
 * LLM-augmented findings (gemini-4-argon): sends compact evidence + rubric,
 * expects FINDINGS_JSON. Failures degrade to rule findings only.
 */
export async function llmFindings(args: {
  llm: LlmClient;
  states: SiteState[];
  runs: BrowserRun[];
  goal: string;
  /** Hard wall-clock bound so the call lands before a run-step slice ends; expiry degrades to rule findings. */
  timeoutMs?: number;
}): Promise<Finding[]> {
  const { llm, states, runs, goal, timeoutMs } = args;
  const evidence = {
    goal,
    // One state per URL: viewport twins of a page carry near-identical evidence text.
    states: uniqueStatesByUrl(states).slice(0, 15).map((s) => ({
      url: s.url,
      title: s.pageTitle,
      text: s.visibleText.slice(0, 900),
      actions: s.actions.slice(0, 20).map((a) => ({ label: a.label, role: a.role, href: a.href })),
    })),
    runs: runs.map((r) => ({
      viewport: r.viewport.name,
      success: r.success,
      failedAssertions: failedGoalAssertions(r).map((a) => a.assertion),
      consoleErrorCount: r.consoleErrorCount,
      errors: r.errors.slice(0, 10),
    })),
  };
  const prompt = `You are a UX auditor. Grade the evidence against these usability dimensions:
${rubricPromptSection()}

GOAL: ${goal}
EVIDENCE:\n${JSON.stringify(evidence)}\n
Return FINDINGS_JSON: {"findings": [{"title","category"(rubric key),"severity","evidenceType","description","recommendation","principle"}]} — only issues supported by the evidence; label unverified ones "hypothesis". Write titles and descriptions in plain language a site owner can act on.`;
  try {
    const raw = await llm.complete(prompt, { deep: true, json: true, timeoutMs });
    const parsed = JSON.parse(stripFences(raw)) as {
      findings?: Partial<Finding>[];
    };
    return (parsed.findings ?? [])
      .filter((f) => typeof f.title === "string" && f.title && typeof f.description === "string" && f.description)
      .map((f) => ({
        findingId: fid(),
        title: String(f.title),
        category: pick(RubricDimension, f.category, "clarity"),
        severity: pick(Severity, f.severity, "medium"),
        evidenceType: f.evidenceType === "verified-failure"
          ? "reproducible-concern"
          : pick(EvidenceType, f.evidenceType, "hypothesis"),
        description: String(f.description),
        affectedStates: states.slice(0, 3).map((s) => s.stateId),
        affectedActions: [],
        evidencePaths: [],
        recommendation: typeof f.recommendation === "string" ? f.recommendation : "",
        verificationStatus: "unverified",
        principle: pick(
          UsabilityPrinciple,
          typeof f.principle === "string" ? (LEGACY_PRINCIPLES[f.principle] ?? f.principle) : f.principle,
          "dont-make-users-think",
        ),
      }))
      .flatMap((f) => {
        const r = Finding.safeParse(f);
        return r.success ? [r.data] : [];
      });
  } catch (err) {
    logEvent({ stage: "analyze", kind: "llm-findings-failed", data: { llm: llm.name, error: String(err).slice(0, 160) } });
    return [];
  }
}

export function stripFences(s: string): string {
  return s.replace(/```json|```/g, "").trim();
}

/** LLM output is untrusted: coerce to a contract enum member or the given default. */
function pick<T extends string>(schema: { safeParse(v: unknown): { success: boolean } }, value: unknown, fallback: T): T {
  return schema.safeParse(value).success ? (value as T) : fallback;
}
