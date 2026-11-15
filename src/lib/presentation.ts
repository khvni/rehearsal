import type { Experiment, Finding, SpecReport } from "./contracts";
import { contextQuestionIds } from "./intents/question-context";

/** Question-bank prompts are suggestions, not evidence that this page needs that content. */
export function displayFindings(exp: Experiment): Finding[] {
  const contextual = new Set([
    ...(exp.questions ?? []).filter((q) => q.source === "context").map((q) => q.questionId),
    ...(exp.graph ? contextQuestionIds(exp.graph) : []),
  ].map((id) => `f_unanswered-question_${id}`));
  return exp.findings.filter((f) => !f.findingId.startsWith("f_unanswered-question") || contextual.has(f.findingId));
}

export function hasBrowserEvidence(finding: Finding, exp: Experiment): boolean {
  return exp.browserTests.some((run) =>
    finding.evidencePaths.some((path) => run.screenshotPaths.includes(path)) ||
    run.steps.some((step) => step.actionId && finding.affectedActions.includes(step.actionId)),
  );
}

export function hasUsablePreview(exp: Experiment): boolean {
  const page = exp.mockup?.pages[0];
  if (!page || page.source !== "gemini") return false;
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(page.html)?.[1].replace(/<[^>]*>/g, "").trim();
  return Boolean(heading && !/^https?:\/\//i.test(heading) && heading !== exp.targetUrl);
}

/** Render crawl-backed recommendations without ungrounded LLM brand names or question-bank advice. */
export function displaySpec(exp: Experiment): SpecReport | undefined {
  if (!exp.spec) return undefined;
  const findings = displayFindings(exp);
  if (exp.browserTests.length > 0 && findings.length === exp.findings.length) return exp.spec;
  const severity = ["critical", "high", "medium", "low"];
  const sorted = [...findings].sort((a, b) => severity.indexOf(a.severity) - severity.indexOf(b.severity));
  return {
    ...exp.spec,
    summary: `${findings.length} recommendations based on captured page content. ${exp.browserTests.length ? `${exp.browserTests.length} browser runs recorded; review each finding’s evidence before making changes.` : "No browser verification was completed; these are concerns to investigate, not confirmed user failures."}`,
    changes: sorted.map((f, i) => ({
      rank: i + 1, title: f.title, findingId: f.findingId, principle: f.principle,
      change: f.recommendation, steps: [f.recommendation], rationale: f.description,
      effort: exp.spec?.changes.find((c) => c.findingId === f.findingId)?.effort ?? "M",
      evidencePaths: f.evidencePaths,
    })),
    rebuildPhases: [{ name: "Verify the recommendations", goal: "Check each concern on the original page before implementing it.", items: ["Reproduce the issue in a browser.", "Apply the relevant fix on staging and test the same goal again."] }],
  };
}

export function failureMessage(raw: string): string {
  if (/PROVIDER_QUOTA|\b402\b|\b429\b|quota|out of capacity/i.test(raw)) return "Our browser or AI provider is out of capacity. Try again later.";
  if (/BROWSER_UNAVAILABLE|BROWSER_REMOTE_FAILED|Browserbase|browserType/i.test(raw)) return "We couldn’t start the browser checks. Try again later.";
  if (/STAGE_TIMEOUT|NAV_TIMEOUT|timed out|timeout|step budget/i.test(raw)) return "A check took too long to finish. Try running it again.";
  if (/EGRESS_BLOCKED|ROBOTS_DISALLOWED|BOT_CHALLENGE|captcha/i.test(raw)) return "This site blocked our checks. Try another public page or allow access to this one.";
  if (/NAV_FAILED|HTTP_STATUS|fetch failed|not found|404/i.test(raw)) return "We couldn’t load the requested page. Check the URL and try again.";
  return "We couldn’t finish this check. Try again; if it keeps failing, try another public page.";
}
