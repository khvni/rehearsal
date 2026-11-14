import type { Finding, StateGraph, VisitorQuestion } from "../contracts";
import { isHomepageQuestion } from "../intents/questions";

const severityFor = (importance: number): Finding["severity"] =>
  importance >= 0.85 ? "high" : importance >= 0.6 ? "medium" : "low";

/**
 * `unanswered-question` findings (one per question with no answer path) plus one
 * summary. Homepage questions cite the homepage principle; the rest cite wayfinding.
 */
export function questionFindings(questions: VisitorQuestion[], graph?: StateGraph): Finding[] {
  const start = graph?.states[0];
  const evidencePaths = start?.screenshotPath ? [start.screenshotPath] : [];
  const statesSearched = graph?.states.length ?? 0;
  const unanswered = questions.filter((q) => !q.answered);
  const findings: Finding[] = unanswered.map((q) => {
    const homepage = isHomepageQuestion(q);
    const classes = q.expectedEndpointClasses.length ? q.expectedEndpointClasses.join("/") : "matching copy";
    return {
      findingId: `f_unanswered-question_${q.questionId}`,
      title: `Visitors can't find an answer to "${q.question}"`,
      category: homepage ? "clarity" : "navigation",
      severity: severityFor(q.importance),
      evidenceType: homepage ? "reproducible-concern" : "hypothesis",
      description: `Visitors are likely to ask "${q.question}" (${q.intent}, importance ${q.importance}${q.source === "context" ? ", raised by the site's own copy" : ""}). ${homepage ? "The start page doesn't answer it" : `None of the ${statesSearched} pages found or their links answer it`} (looked for ${classes}).`,
      affectedStates: start ? [start.stateId] : [],
      affectedActions: [],
      evidencePaths,
      recommendation: homepage
        ? `Answer "${q.question}" above the fold — the tagline and welcome blurb are the first things visitors read.`
        : `Decide whether visitors should get an answer to "${q.question}"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.`,
      verificationStatus: homepage ? "reproduced" : "unverified",
      principle: homepage ? "homepage-explains-itself" : "where-you-are",
    };
  });
  if (unanswered.length === 0) return findings;

  const ratio = unanswered.length / Math.max(1, questions.length);
  const top = [...unanswered].sort((a, b) => b.importance - a.importance).slice(0, 3);
  findings.push({
    findingId: "f_unanswered-questions-summary",
    title: `${unanswered.length} of ${questions.length} expected visitor questions go unanswered`,
    category: "goal-completion",
    severity: ratio >= 0.5 ? "high" : ratio >= 0.25 ? "medium" : "low",
    evidenceType: "hypothesis",
    description: `${questions.length - unanswered.length}/${questions.length} likely visitor questions are answered by the ${statesSearched} pages found or their endpoints. Unanswered: ${unanswered.map((q) => `"${q.question}"`).join(", ")}.`,
    affectedStates: start ? [start.stateId] : [],
    affectedActions: [],
    evidencePaths,
    recommendation: `Pick which questions the site should answer and which action each answer should lead to; start with ${top.map((q) => `"${q.question}"`).join(", ")}.`,
    verificationStatus: "unverified",
    principle: unanswered.some(isHomepageQuestion) ? "homepage-explains-itself" : "where-you-are",
  });
  return findings;
}
