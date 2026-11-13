import { describe, expect, it } from "vitest";
import { Experiment, VIEWPORTS, VisitorQuestion, type Endpoint, type StateGraph } from "@/lib/contracts";
import { makeState } from "@/lib/graph";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { questionFindings } from "@/lib/analysis/question-findings";
import {
  HOMEPAGE_QUESTION_IDS,
  QUESTION_BANK,
  answerQuestions,
  generateQuestions,
  isHomepageQuestion,
  refineQuestionsWithLlm,
  visitorQuestions,
} from "@/lib/intents";

const link = (label: string, href: string) =>
  ({ type: "click" as const, label, role: "link", href, enabled: true, safeToExecute: true });
const state = (url: string, title: string, text: string, actions: ReturnType<typeof link>[] = [], screenshotPath?: string) =>
  makeState({ url, viewport: VIEWPORTS.desktop, title, visibleText: text, actions, screenshotPath });
const graphOf = (...states: ReturnType<typeof state>[]): StateGraph => ({ states, edges: [] });
const ep = (cls: Endpoint["class"], label: string, sourceStateId?: string, url = "https://acme.com/x"): Endpoint => ({
  endpointId: `ep_${cls}_${label}`, class: cls, url, label, weight: 0.8, sourceStateId, intent: ["information"],
});
const byId = (qs: VisitorQuestion[]) => new Map(qs.map((q) => [q.questionId, q]));

describe("question bank", () => {
  it("has questions for every site type, unique ids + texts per type, importance in [0,1]", () => {
    for (const [type, bank] of Object.entries(QUESTION_BANK)) {
      expect(bank.length, type).toBeGreaterThanOrEqual(6);
      expect(new Set(bank.map((t) => t.id)).size).toBe(bank.length);
      expect(new Set(bank.map((t) => t.question)).size).toBe(bank.length);
      expect(bank.every((t) => t.importance >= 0 && t.importance <= 1)).toBe(true);
    }
    expect(QUESTION_BANK.saas.map((t) => t.question)).toEqual(
      expect.arrayContaining(["How much does it cost?", "Is there a free tier or trial?", "Where are the docs?", "How do I talk to a human?"]),
    );
    expect(QUESTION_BANK.event.map((t) => t.question)).toEqual(
      expect.arrayContaining(["When and where is it?", "How do I attend or apply?", "Who is speaking?", "Is it in person or online?"]),
    );
  });

  it("generateQuestions puts Krug's 4 homepage questions first and parses as VisitorQuestion", () => {
    const g = graphOf(state("https://acme.com/", "Acme", "Acme helps teams ship faster."));
    const qs = generateQuestions(g, [], "saas");
    expect(qs.slice(0, 4).map((q) => q.questionId).sort()).toEqual([...HOMEPAGE_QUESTION_IDS].sort());
    expect(qs[0].question).toBe("What does it do?");
    expect(qs.every((q) => VisitorQuestion.safeParse(q).success && !q.answered)).toBe(true);
    expect(generateQuestions(g, [], "saas")).toEqual(qs);
  });

  it("derives questions from the site's own copy", () => {
    const g = graphOf(state("https://acme.com/", "Acme", "Enterprise-grade platform. See pricing. Launch event June 5, 2026."));
    const qs = byId(generateQuestions(g, [], "saas"));
    expect(qs.get("ctx-sales")).toMatchObject({ question: "How do I contact sales?", source: "context", expectedEndpointClasses: ["contact-form"] });
    expect(qs.get("ctx-date")?.question).toContain("June 5, 2026");
    // cost is already in the saas bank: mentioning pricing boosts it instead of duplicating
    expect(qs.get("cost")).toMatchObject({ source: "bank", importance: 1 });
    // site-type scoped rule: travel only applies to events
    expect(byId(generateQuestions(graphOf(state("https://a.com/", "A", "Visit our venue")), [], "saas")).has("ctx-travel")).toBe(false);
  });
});

describe("answer detection", () => {
  const home = state("https://acme.com/", "Acme", "Acme is a platform that helps engineering teams ship reliable software faster.", [
    link("Pricing", "https://acme.com/pricing"),
  ]);
  const docs = state("https://acme.com/docs", "Docs", "API reference and guides. SOC 2 Type II certified.");
  const g = graphOf(home, docs);

  it("answers by endpoint class, URL, and text — citing state + snippet", () => {
    const qs = byId(answerQuestions(generateQuestions(g, [], "saas"), g, [ep("pricing", "Pricing", home.stateId, "https://acme.com/pricing")]));
    expect(qs.get("cost")).toMatchObject({ answered: true, answeredBy: { stateId: home.stateId, evidence: 'pricing endpoint "Pricing"' } });
    expect(qs.get("docs")).toMatchObject({ answered: true, answeredBy: { stateId: docs.stateId, url: "https://acme.com/docs" } });
    expect(qs.get("security")?.answeredBy?.evidence).toMatch(/SOC 2/);
    expect(qs.get("hp-what")?.answeredBy?.evidence).toMatch(/^Acme is a platform/);
    expect(qs.get("contact")).toMatchObject({ answered: false });
    expect(qs.get("contact")?.answeredBy).toBeUndefined();
  });

  it("homepage questions only look at the start page", () => {
    const g2 = graphOf(
      state("https://acme.com/", "Acme", "Welcome"),
      state("https://acme.com/about", "About", "Get started today. Acme is a platform that helps engineering teams ship software."),
    );
    const qs = byId(answerQuestions(generateQuestions(g2, [], "saas"), g2, [ep("signup", "Get started", g2.states[1].stateId)]));
    expect(qs.get("hp-start")?.answered).toBe(false);
    expect(qs.get("hp-what")?.answered).toBe(false);
    expect(qs.get("get-started")?.answered).toBe(true);
  });

  it("endpoint label filters: a sponsorship form doesn't answer 'how do I talk to a human?'", () => {
    const qs = byId(answerQuestions(generateQuestions(g, [], "event"), g, [ep("contact-form", "BECOME A SPONSOR", home.stateId)]));
    expect(qs.get("contact")?.answered).toBe(false);
    expect(qs.get("sponsor")?.answered).toBe(true);
  });

  it("re-answers stored questions without regenerating (detectors keyed by questionId)", () => {
    const stored = JSON.parse(JSON.stringify(generateQuestions(g, [], "saas"))) as VisitorQuestion[];
    expect(byId(answerQuestions(stored, g, [])).get("docs")?.answered).toBe(true);
  });
});

describe("LLM refinement", () => {
  const g = graphOf(state("https://acme.com/", "Acme", "Acme ships rockets. Launch window opens in March."));

  it("is skipped for the fixture client and on bad output", async () => {
    const base = generateQuestions(g, [], "saas");
    expect(await refineQuestionsWithLlm(base, g, new FixtureLlmClient())).toBe(base);
    expect(await refineQuestionsWithLlm(base, g, { name: "gemini", complete: async () => "nope" })).toBe(base);
    expect(await visitorQuestions(g, [], "saas", new FixtureLlmClient())).toEqual(await visitorQuestions(g, [], "saas"));
  });

  it("adds keyword-detected questions from a real client", async () => {
    const llm = {
      name: "gemini",
      complete: async () =>
        JSON.stringify({
          questions: [
            { question: "When is the next launch?", intent: "information", keywords: ["launch window"], importance: 0.9 },
            { question: "Can I ride along?", intent: "proposal", keywords: ["passenger"], importance: 0.4 },
            { question: "No keywords", intent: "information", keywords: [] },
          ],
        }),
    };
    const qs = await visitorQuestions(g, [], "saas", llm);
    const llmQs = qs.filter((q) => q.source === "llm");
    expect(llmQs.map((q) => q.question)).toEqual(["When is the next launch?", "Can I ride along?"]);
    expect(llmQs[0]).toMatchObject({ answered: true, keywords: ["launch window"] });
    expect(llmQs[1].answered).toBe(false);
  });
});

describe("question findings", () => {
  const home = state("https://acme.com/", "Acme", "Welcome", [], "/shots/home.png");
  const g = graphOf(home);
  const qs = answerQuestions(generateQuestions(g, [], "saas"), g, []);
  const findings = questionFindings(qs, g);

  it("one unanswered-question finding per unanswered question + a summary", () => {
    const unanswered = qs.filter((q) => !q.answered);
    expect(findings).toHaveLength(unanswered.length + 1);
    const summary = findings.at(-1)!;
    expect(summary.title).toBe(`${unanswered.length} of ${qs.length} expected visitor questions have no answer path`);
    expect(summary.krugPrinciple).toBe("homepage");
    expect(findings.every((f) => f.evidencePaths.includes("/shots/home.png"))).toBe(true);
  });

  it("homepage questions cite `homepage`, the rest `navigation`; severity follows importance", () => {
    for (const q of qs.filter((x) => !x.answered)) {
      const f = findings.find((x) => x.findingId === `f_unanswered-question_${q.questionId}`)!;
      expect(f.krugPrinciple).toBe(isHomepageQuestion(q) ? "homepage" : "navigation");
      expect(f.severity).toBe(q.importance >= 0.85 ? "high" : q.importance >= 0.6 ? "medium" : "low");
      expect(f.description).toContain("unanswered-question");
    }
  });

  it("no findings when everything is answered; questions stay an optional Experiment field", () => {
    expect(questionFindings(qs.map((q) => ({ ...q, answered: true })), g)).toEqual([]);
    const exp = { id: "e", targetUrl: "https://acme.com/", goal: "g", status: "created", createdAt: "x", configuration: {} };
    expect(Experiment.parse(exp).questions).toBeUndefined();
    expect(Experiment.parse({ ...exp, questions: qs }).questions).toHaveLength(qs.length);
  });
});
