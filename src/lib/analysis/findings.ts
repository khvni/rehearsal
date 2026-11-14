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
import { isRunError } from "../browser/types";
import { EvidenceType, Finding, KrugDimension, KrugPrinciple, Severity } from "../contracts";
import { logEvent } from "../telemetry";
import { rubricPromptSection } from "./rubric";

let counter = 0;
const fid = () => `f_${randomUUID().slice(0, 8)}_${counter++}`;

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
    for (const { assertion, passed } of run.assertions) {
      if (!passed) {
        findings.push({
          findingId: fid(),
          title: `Assertion failed in browser: ${assertion.kind} "${assertion.value}"`,
          category: "goal-completion",
          severity: "high",
          evidenceType: "verified-failure",
          description: `Browser run ${run.runId} (${run.viewport.name}) failed assertion ${assertion.kind} on value "${assertion.value}".`,
          affectedStates: [],
          affectedActions: [],
          evidencePaths: run.screenshotPaths,
          recommendation: "Inspect the failed assertion against the live page and correct the mismatch.",
          verificationStatus: "verified",
          krugPrinciple: "testing-beats-arguing",
        });
      }
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
        title: "Post-event page still invites registration",
        category: "copy-economy",
        severity: "high",
        evidenceType: "reproducible-concern",
        description: `Page "${state.pageTitle}" shows dates in the past (${pastDates.join(", ")}) alongside active registration/apply language — a stale-content inconsistency.`,
        affectedStates: [state.stateId],
        affectedActions: state.actions
          .filter((a) => /\b(apply|register)\b/i.test(a.label))
          .map((a) => a.actionId),
        evidencePaths: state.screenshotPath ? [state.screenshotPath] : [],
        recommendation:
          "Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.",
        verificationStatus: "reproduced",
        krugPrinciple: "omit-words",
      });
    }

    // 3. Vague labels — K1/K4.
    const vague = state.actions.filter((a) => isVagueLabel(a.label));
    if (vague.length > 0) {
      findings.push({
        findingId: fid(),
        title: `Ambiguous link labels (${vague.length})`,
        category: "cognitive-effort",
        severity: "medium",
        evidenceType: "reproducible-concern",
        description: `Actions like ${vague.map((v) => `"${v.label}"`).join(", ")} force users to guess where they lead.`,
        affectedStates: [state.stateId],
        affectedActions: vague.map((v) => v.actionId),
        evidencePaths: state.screenshotPath ? [state.screenshotPath] : [],
        recommendation: "Rename vague labels to describe their destination explicitly.",
        verificationStatus: "reproduced",
        krugPrinciple: "dont-make-me-think",
      });
    }

    // 4. Nav overload — >9 distinct top-level links raises scan cost (K2).
    const links = state.actions.filter((a) => a.role === "link");
    if (links.length > 24) {
      findings.push({
        findingId: fid(),
        title: "Dense link surface increases scan cost",
        category: "hierarchy",
        severity: "medium",
        evidenceType: "reproducible-concern",
        description: `${links.length} distinct links compete for attention on "${state.pageTitle}".`,
        affectedStates: [state.stateId],
        affectedActions: [],
        evidencePaths: [],
        recommendation: "Group secondary links; keep the primary path visually dominant.",
        verificationStatus: "reproduced",
        krugPrinciple: "scanning-not-reading",
      });
    }

    // 5. Missing H1-ish identity (trunk test, K6).
    const isDocument = !/\.(txt|ics|xml|json|pdf)$/i.test(new URL(state.url).pathname);
    if (isDocument && (!state.pageTitle || state.pageTitle === state.url)) {
      findings.push({
        findingId: fid(),
        title: "Page lacks a readable title",
        category: "navigation",
        severity: "medium",
        evidenceType: "reproducible-concern",
        description: "No <title> text extracted — 'you are here' signal missing.",
        affectedStates: [state.stateId],
        affectedActions: [],
        evidencePaths: [],
        recommendation: "Give the page a descriptive title and matching H1.",
        verificationStatus: "reproduced",
        krugPrinciple: "navigation",
      });
    }

    void text;
  }

  // 6. Console/page errors during browser runs — data, not a goal failure (K9: observed in testing).
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
      title: `Console errors during browser runs (${total})`,
      category: "consistency",
      severity: "low",
      evidenceType: "reproducible-concern",
      description: `console-errors: ${total} page/console errors across ${noisy.length} of ${runs.filter((r) => r.viewport.name === viewport).length} ${viewport} runs, e.g. ${samples.map((s) => `"${s.slice(0, 120)}"`).join(", ")}. The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts.`,
      affectedStates: start ? [start.stateId] : [],
      affectedActions: [],
      evidencePaths: noisy.flatMap((r) => r.screenshotPaths).slice(0, 3),
      recommendation: "Fix or silence the failing scripts so the page behaves the same for every visitor.",
      verificationStatus: "reproduced",
      krugPrinciple: "testing-beats-arguing",
    } satisfies Finding;
  });
}

/**
 * Endpoint reachability findings (deterministic, from seeded endpoint journeys):
 * - endpoint-unreachable: high-weight endpoint with zero goal-reached journeys
 * - endpoint-deep: median journey > 3 steps
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
        title: `Endpoint unreachable: ${e.class} "${e.label.slice(0, 60)}"`,
        category: "navigation",
        severity: e.weight >= 0.85 ? "high" : "medium",
        evidenceType: "reproducible-concern",
        description: `endpoint-unreachable: "${e.label}" (${e.class}, weight ${e.weight}) at ${e.url} was reached in 0 of ${j.trajectories} seeded journeys from the start page. Krug's trunk test fails here — a visitor can't find their way to it.`,
        affectedStates: affected(e),
        affectedActions: e.actionId ? [e.actionId] : [],
        evidencePaths: [],
        recommendation: `Link "${e.label}" from persistent navigation or the start page with a label that names the ${e.class.replace("-", " ")} destination.`,
        verificationStatus: "reproduced",
        krugPrinciple: "navigation",
      });
    } else if (j.medianSteps !== undefined && j.medianSteps > deepSteps) {
      findings.push({
        findingId: `f_endpoint-deep_${e.endpointId}`,
        title: `Endpoint buried: ${e.class} "${e.label.slice(0, 60)}"`,
        category: "navigation",
        severity: e.weight >= highWeight ? "medium" : "low",
        evidenceType: "reproducible-concern",
        description: `endpoint-deep: "${e.label}" (${e.class}, weight ${e.weight}) takes a median of ${j.medianSteps} steps across ${j.goalReached}/${j.trajectories} reaching journeys (shortest: ${j.samplePath.join(" → ") || "n/a"}). Each extra choice must be mindless; past ${deepSteps} the path stops being obvious.`,
        affectedStates: affected(e),
        affectedActions: e.actionId ? [e.actionId] : [],
        evidencePaths: [],
        recommendation: `Surface "${e.label}" within ${deepSteps} clicks of the start page, or make each intermediate link unambiguous about leading there.`,
        verificationStatus: "reproduced",
        krugPrinciple: "mindless-choices",
      });
    }
  }

  const found = new Set(endpoints.map((e) => e.class));
  for (const cls of expectedClasses) {
    if (found.has(cls)) continue;
    findings.push({
      findingId: `f_missing-endpoint-class_${cls}`,
      title: `No ${cls} endpoint found`,
      category: "goal-completion",
      severity: cls === "pricing" || cls === "signup" ? "high" : "medium",
      evidenceType: "reproducible-concern",
      description: `missing-endpoint-class: a ${siteType} site is expected to expose a ${cls} endpoint, but none of the ${statesDiscovered} discovered states or their links/CTAs classify as ${cls}.`,
      affectedStates: [],
      affectedActions: [],
      evidencePaths: [],
      recommendation: `Add a clearly labeled ${cls.replace("-", " ")} destination and link it from the primary navigation.`,
      verificationStatus: "reproduced",
      krugPrinciple: "navigation",
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
}): Promise<Finding[]> {
  const { llm, states, runs, goal } = args;
  const evidence = {
    goal,
    states: states.slice(0, 15).map((s) => ({
      url: s.url,
      title: s.pageTitle,
      text: s.visibleText.slice(0, 900),
      actions: s.actions.slice(0, 20).map((a) => ({ label: a.label, role: a.role, href: a.href })),
    })),
    runs: runs.map((r) => ({
      viewport: r.viewport.name,
      success: r.success,
      failedAssertions: r.assertions.filter((a) => !a.passed).map((a) => a.assertion),
      consoleErrorCount: r.consoleErrorCount,
      errors: r.errors.slice(0, 10),
    })),
  };
  const prompt = `You are a UX auditor applying Steve Krug's "Don't Make Me Think, Revisited".
Rubric dimensions:\n${rubricPromptSection()}\n
GOAL: ${goal}
EVIDENCE:\n${JSON.stringify(evidence)}\n
Return FINDINGS_JSON: {"findings": [{"title","category"(rubric key),"severity","evidenceType","description","recommendation","krugPrinciple"}]} — only issues supported by the evidence; label unverified ones "hypothesis".`;
  try {
    const raw = await llm.complete(prompt, { deep: true, json: true });
    const parsed = JSON.parse(stripFences(raw)) as {
      findings?: Partial<Finding>[];
    };
    return (parsed.findings ?? [])
      .filter((f) => typeof f.title === "string" && f.title && typeof f.description === "string" && f.description)
      .map((f) => ({
        findingId: fid(),
        title: String(f.title),
        category: pick(KrugDimension, f.category, "clarity"),
        severity: pick(Severity, f.severity, "medium"),
        evidenceType: pick(EvidenceType, f.evidenceType, "hypothesis"),
        description: String(f.description),
        affectedStates: states.slice(0, 3).map((s) => s.stateId),
        affectedActions: [],
        evidencePaths: [],
        recommendation: typeof f.recommendation === "string" ? f.recommendation : "",
        verificationStatus: f.evidenceType === "verified-failure" ? "verified" : "unverified",
        krugPrinciple: pick(KrugPrinciple, f.krugPrinciple, "dont-make-me-think"),
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
