import { describe, expect, it } from "vitest";
import { Experiment, ExperimentConfig, type Finding } from "../../src/lib/contracts";
import { displayFindings, displaySpec, failureMessage, hasBrowserEvidence, hasUsablePreview } from "../../src/lib/presentation";

const finding: Finding = {
  findingId: "f_heading", title: "Missing page heading", category: "hierarchy", severity: "high",
  evidenceType: "reproducible-concern", description: "The captured page has no H1.",
  affectedStates: ["s1"], affectedActions: [], evidencePaths: ["page.png"],
  recommendation: "Add a heading that describes the form.", verificationStatus: "reproduced",
  principle: "people-scan-they-dont-read",
};

function experiment() {
  return Experiment.parse({
    id: "exp_1234abcd", targetUrl: "https://example.com/form", goal: "Complete the form", status: "complete",
    createdAt: "2026-01-01T00:00:00Z", configuration: ExperimentConfig.parse({}), findings: [finding],
    spec: { targetUrl: "https://example.com/form", goal: "Complete the form", generatedAt: "2026-01-01T00:00:00Z", summary: "Invented Pizza Shop", changes: [], rebuildPhases: [] },
  });
}

describe("honest result presentation", () => {
  it("omits generic question-bank findings and their aggregate while retaining contextual questions", () => {
    const exp = experiment();
    exp.questions = [{ questionId: "contact", question: "How do I contact support?", source: "context", intent: "information", answered: false, importance: 0.5, expectedEndpointClasses: [] }];
    exp.findings.push(
      { ...finding, findingId: "f_unanswered-question_latest" },
      { ...finding, findingId: "f_unanswered-question_contact" },
      { ...finding, findingId: "f_unanswered-questions-summary" },
    );
    expect(displayFindings(exp).map((f) => f.findingId)).toEqual(["f_heading", "f_unanswered-question_contact"]);
    expect(exp.findings).toHaveLength(4);
  });

  it("does not infer browser evidence from a reproduced flag or unrelated browser runs", () => {
    const exp = experiment();
    expect(hasBrowserEvidence(finding, exp)).toBe(false);
    exp.browserTests = [{ runId: "b1", viewport: { name: "desktop", width: 1440, height: 900 }, success: true, steps: [], assertions: [], errors: [], screenshotPaths: ["other.png"], durationMs: 1, consoleErrorCount: 0 }];
    expect(hasBrowserEvidence(finding, exp)).toBe(false);
    exp.browserTests[0].screenshotPaths.push("page.png");
    expect(hasBrowserEvidence(finding, exp)).toBe(true);
  });

  it("uses source-backed recommendations in crawl-only plans without mutating stored reports", () => {
    const exp = experiment();
    const spec = displaySpec(exp)!;
    expect(spec.summary).toContain("No browser verification");
    expect(spec.changes[0].change).toBe(finding.recommendation);
    expect(JSON.stringify(spec)).not.toContain("Pizza Shop");
    expect(exp.spec?.summary).toBe("Invented Pizza Shop");
    delete exp.spec;
    expect(displaySpec(exp)).toBeUndefined();
  });

  it("withholds missing, template and URL-heading previews", () => {
    const exp = experiment();
    expect(hasUsablePreview(exp)).toBe(false);
    exp.mockup = { generatedAt: exp.createdAt, brand: { name: "Example", colors: { ink: "#111", surface: "#fff", muted: "#666", line: "#eee" }, fonts: { sans: "system-ui" }, cssVars: {}, navItems: [], ctaLabels: [], tone: "minimal", voiceNotes: [] }, llm: "gemini", pages: [{ slug: "form", sourceUrl: exp.targetUrl, title: "Example form", summary: "Form preview", html: "<h1>Example form</h1><p>Fill in your details</p>", source: "template", bytes: 70 }] };
    expect(hasUsablePreview(exp)).toBe(false);
    exp.mockup.pages[0].source = "gemini";
    expect(hasUsablePreview(exp)).toBe(true);
    exp.mockup.pages[0].html = `<h1>${exp.targetUrl}</h1><button>Continue</button>`;
    expect(hasUsablePreview(exp)).toBe(false);
  });

  it.each([
    ["[PROVIDER_QUOTA] Browserbase 402 {statusCode:402}", "out of capacity"],
    ["[BROWSER_UNAVAILABLE] no remote browser", "browser checks"],
    ["[STAGE_TIMEOUT] Step budget reached", "too long"],
    ["[BOT_CHALLENGE] captcha", "blocked our checks"],
    ["[NAV_FAILED] fetch failed", "Check the URL"],
    ["Unexpected vendor internals", "couldn’t finish"],
  ])("turns %s into an actionable message", (raw, expected) => {
    expect(failureMessage(raw)).toContain(expected);
    expect(failureMessage(raw)).not.toContain("statusCode");
  });
});
