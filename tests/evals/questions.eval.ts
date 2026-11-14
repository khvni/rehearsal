import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Experiment,
  VIEWPORTS,
  type BrowserRun,
  type BrowserRunner,
  type ExperimentStore,
  type StateGraph,
} from "@/lib/contracts";
import { FixtureJevClient } from "@/lib/decisions/jev";
import { Orchestrator } from "@/lib/orchestrator";
import { extractPage } from "@/lib/browser/extract";
import { GraphBuilder, makeState } from "@/lib/graph";
import { FixtureLlmClient } from "@/lib/analysis/gemini";
import { questionFindings } from "@/lib/analysis/question-findings";
import { HOMEPAGE_QUESTION_IDS, QUESTION_BANK, detectSiteType, discoverEndpoints, visitorQuestions } from "@/lib/intents";

const T = (
  JSON.parse(readFileSync(path.join(__dirname, "evals.config.json"), "utf8")) as {
    thresholds: {
      minQuestionBankSize: number;
      minAieQuestions: number;
      requiredAnsweredQuestions: string[];
      requiredUnansweredQuestions: string[];
      maxAieUnansweredRatio: number;
    };
  }
).thresholds;

const AIE_URL = "https://ai.engineer/code/2026";
const aieHtml = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const aie = extractPage(aieHtml, AIE_URL);

function aieGraph(): StateGraph {
  const b = new GraphBuilder(30, 3);
  b.add(makeState({ url: AIE_URL, viewport: VIEWPORTS.desktop, title: aie.title, visibleText: aie.visibleText, actions: aie.actions, screenshotPath: "data/shots/aie.png" }));
  return b.build();
}

describe("eval: unanswered visitor questions on the AIE fixture", async () => {
  const graph = aieGraph();
  const endpoints = discoverEndpoints(graph);
  const questions = await visitorQuestions(graph, endpoints, detectSiteType(graph), new FixtureLlmClient());
  const byId = new Map(questions.map((q) => [q.questionId, q]));

  it("bank covers every site type", () => {
    const size = Object.values(QUESTION_BANK).flat().length + HOMEPAGE_QUESTION_IDS.length;
    expect(size).toBeGreaterThanOrEqual(T.minQuestionBankSize);
    expect(questions.length).toBeGreaterThanOrEqual(T.minAieQuestions);
  });

  it("answers when/where, how to attend, agenda, speakers, recordings — with cited evidence", () => {
    for (const id of T.requiredAnsweredQuestions) {
      const q = byId.get(id);
      expect(q?.answered, id).toBe(true);
      expect(q?.answeredBy?.stateId, id).toBe(graph.states[0].stateId);
      expect(q?.answeredBy?.evidence.length, id).toBeGreaterThan(0);
    }
    expect(byId.get("when-where")?.answeredBy?.evidence).toMatch(/nov 10-12/i);
    expect(byId.get("attend")?.answeredBy?.evidence).toMatch(/apply/i);
  });

  it("flags what the page never answers: cost (application-only, no price), acceptance criteria, contacting organizers", () => {
    for (const id of T.requiredUnansweredQuestions) expect(byId.get(id)?.answered, id).toBe(false);
    expect(byId.get("ctx-apply-criteria")?.source).toBe("context");
    // a sponsorship CTA answers "sponsor", not "contact the organizers"
    expect(byId.get("sponsor")?.answered).toBe(true);
    const unanswered = questions.filter((q) => !q.answered);
    expect(unanswered.length / questions.length).toBeLessThanOrEqual(T.maxAieUnansweredRatio);
  });

  it("findings: one per unanswered question + summary, homepage questions all answered", () => {
    const findings = questionFindings(questions, graph);
    const unanswered = questions.filter((q) => !q.answered);
    expect(findings).toHaveLength(unanswered.length + 1);
    expect(findings.filter((f) => f.krugPrinciple === "homepage")).toHaveLength(0);
    expect(findings.at(-1)?.title).toBe(`${unanswered.length} of ${questions.length} expected visitor questions have no answer path`);
    expect(findings.every((f) => f.evidencePaths.includes("data/shots/aie.png"))).toBe(true);
  });

  it("is deterministic", async () => {
    const again = aieGraph();
    const qs = await visitorQuestions(again, discoverEndpoints(again), detectSiteType(again));
    expect(qs.map((q) => [q.questionId, q.answered, q.importance])).toEqual(questions.map((q) => [q.questionId, q.answered, q.importance]));
  });
});

describe("eval: orchestrator stores visitor questions in analyze (fixture adapters)", () => {
  const runner: BrowserRunner = {
    name: "fixture-runner",
    async openPage(url) {
      if (url !== AIE_URL) throw new Error(`no fixture for ${url}`);
      return { html: aieHtml, screenshotPath: "" };
    },
    async runTrajectory(args): Promise<BrowserRun> {
      return {
        runId: args.runId, viewport: args.viewport, success: true,
        steps: args.actions.map((a) => ({ actionId: a.actionId, label: a.label, ok: true })),
        assertions: args.assertions.map((assertion) => ({ assertion, passed: true })),
        errors: [], consoleErrorCount: 0, screenshotPaths: [], durationMs: 0,
      };
    },
    async close() {},
  };
  const mem = new Map<string, Experiment>();
  const store: ExperimentStore = {
    name: "memory",
    async save(e) { mem.set(e.id, Experiment.parse(JSON.parse(JSON.stringify(e)))); },
    async get(id) { return mem.get(id) ?? null; },
    async list() { return [...mem.values()]; },
    async appendActivity() {},
    async activity() { return []; },
  };

  it("analyze → questions + unanswered-question findings", async () => {
    process.env.REHEARSAL_ALLOW_PRIVATE = "1";
    const orch = new Orchestrator({
      runner, store, jev: new FixtureJevClient(), llm: new FixtureLlmClient(),
      fetcher: { name: "fixture-fetch", fetchHtml: async () => "" },
    });
    const exp = await orch.createExperiment(AIE_URL, "find ticket prices", {
      viewports: ["desktop"], trajectories: 200, verifyCount: 1, maxStates: 3,
    });
    await orch.analyze(exp.id);
    const analyzed = (await orch.get(exp.id))!;
    const qs = new Map((analyzed.questions ?? []).map((q) => [q.questionId, q]));
    expect(qs.get("when-where")?.answered).toBe(true);
    expect(qs.get("cost")?.answered).toBe(false);
    expect(analyzed.findings.some((f) => f.findingId === "f_unanswered-question_cost")).toBe(true);
    expect(analyzed.findings.some((f) => f.findingId === "f_unanswered-questions-summary")).toBe(true);
    expect(() => Experiment.parse(JSON.parse(JSON.stringify(analyzed)))).not.toThrow();
    delete process.env.REHEARSAL_ALLOW_PRIVATE;
  });
});
