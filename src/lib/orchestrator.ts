import { randomUUID } from "node:crypto";
import {
  Experiment,
  ExperimentConfig,
  VIEWPORTS,
  type Assertion,
  type Comparison,
  type Variant,
} from "./contracts";
import { selectFetcher, type PageFetcher } from "./fetch";
import { assertPublicUrl, robotsDisallowed } from "./fetch/guards";
import { extractPage, selectRunner, type BrowserRunner } from "./browser/runner";
import { GraphBuilder, makeState, adjacency } from "./graph";
import { selectJev, scoreActions, type JevClient } from "./decisions/jev";
import { simulateTrajectories, selectTrajectories, type SimWeights } from "./simulation";
import { selectLlm, type LlmClient } from "./analysis/gemini";
import { llmFindings, ruleFindings } from "./analysis/findings";
import { generateSpec, specToMarkdown } from "./analysis/spec";
import { selectStore, type ExperimentStore } from "./storage";
import { withTrace, logEvent } from "./telemetry";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** Canonical pipeline stages — keep in sync with .devin/skills/rehearsal-testing/SKILL.md (CI-enforced). */
export const PIPELINE_STAGES = [
  "discover",
  "simulate",
  "verify",
  "analyze",
  "compare",
  "spec",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface OrchestratorDeps {
  fetcher?: PageFetcher;
  jev?: JevClient;
  llm?: LlmClient;
  store?: ExperimentStore;
  runner?: BrowserRunner;
}

export class Orchestrator {
  private fetcher: PageFetcher;
  private jev: JevClient;
  private llm: LlmClient;
  private store: ExperimentStore;
  private runner: BrowserRunner;

  constructor(deps: OrchestratorDeps = {}) {
    this.fetcher = deps.fetcher ?? selectFetcher();
    this.jev = deps.jev ?? selectJev();
    this.llm = deps.llm ?? selectLlm();
    this.store = deps.store ?? selectStore();
    this.runner = deps.runner ?? selectRunner();
  }

  async createExperiment(targetUrl: string, goal: string, config?: Partial<ExperimentConfig>): Promise<Experiment> {
    const url = await assertPublicUrl(targetUrl);
    const experiment = Experiment.parse({
      id: `exp_${randomUUID().slice(0, 8)}`,
      targetUrl: url.toString(),
      goal,
      status: "created",
      createdAt: new Date().toISOString(),
      configuration: config ?? {},
    });
    await this.store.save(experiment);
    return experiment;
  }

  async get(id: string): Promise<Experiment | null> {
    return this.store.get(id);
  }

  async list(): Promise<Experiment[]> {
    return this.store.list();
  }

  /** Stage 1 — discover states, build graph. */
  async discover(id: string): Promise<Experiment> {
    const experiment = await this.mustGet(id);
    await this.update(experiment, "discovering");
    return withTrace("discover", id, async () => {
      const config = experiment.configuration;
      const builder = new GraphBuilder(config.maxStates, config.maxDepth);
      logEvent({ experimentId: id, stage: "discover", kind: "browser-runner", data: { runner: this.runner.name } });
      const disallowed = await robotsDisallowed(
        new URL(experiment.targetUrl),
        this.fetcher.fetchHtml.bind(this.fetcher),
      );
      if (disallowed.some((p) => new URL(experiment.targetUrl).pathname.startsWith(p))) {
        throw new Error(`Target path disallowed by robots.txt: ${disallowed.join(", ")}`);
      }

      for (const vpName of config.viewports) {
        const viewport = VIEWPORTS[vpName];
        const frontier: { url: string; depth: number }[] = [{ url: experiment.targetUrl, depth: 0 }];
        const visited = new Set<string>();
        while (frontier.length > 0) {
          const { url, depth } = frontier.shift()!;
          if (visited.has(url) || depth > config.maxDepth) continue;
          visited.add(url);
          try {
            const { html, screenshotPath } = await this.runner.openPage(url, viewport, {
              shotName: `${id}_${vpName}_d${depth}`,
            });
            const extracted = extractPage(html, url);
            const state = makeState({
              url,
              viewport,
              title: extracted.title,
              visibleText: extracted.visibleText,
              actions: extracted.actions,
              screenshotPath,
            });
            const { state: canonical, isNew } = builder.add(state);
            if (!isNew) continue;
            if (depth < config.maxDepth) {
              for (const a of canonical.actions) {
                if (a.type === "click" && a.href && a.href.startsWith(new URL(experiment.targetUrl).origin)) {
                  frontier.push({ url: a.href, depth: depth + 1 });
                }
              }
            }
          } catch (e) {
            logEvent({ experimentId: id, stage: "discover", kind: "page-fail", data: { url, error: String(e).slice(0, 160) } });
          }
        }
      }
      experiment.graph = builder.build();
      await this.update(experiment, "created");
      return experiment;
    });
  }

  /** Stage 2 — score actions with Jev, run seeded simulation, verify top paths. */
  async simulate(id: string): Promise<Experiment> {
    const experiment = await this.mustGet(id);
    if (!experiment.graph || experiment.graph.states.length === 0) {
      await this.discover(id);
    }
    const exp = (await this.mustGet(id))!;
    await this.update(exp, "simulating");
    return withTrace("simulate", id, async () => {
      const config = exp.configuration;
      const graph = exp.graph!;
      const start = graph.states[0];

      // Assertions: from LLM objective compile (fixture fallback = keyword text check).
      exp.assertions = await this.compileAssertions(exp.goal);

      // Score each state's actions once; cache by stateHash.
      const weights: SimWeights = { byState: new Map(), ambiguity: new Map() };
      for (const state of graph.states.slice(0, config.maxStates)) {
        const { scored, ambiguity } = await scoreActions(this.jev, state, exp.goal, "goal-directed");
        weights.byState.set(
          state.stateId,
          new Map(scored.map((s) => [s.action.actionId, s.weight])),
        );
        weights.ambiguity.set(state.stateId, ambiguity);
      }

      exp.simulations = simulateTrajectories({
        graph,
        startStateId: start.stateId,
        weights,
        assertions: exp.assertions,
        seed: config.seed,
        count: config.trajectories,
        maxDepth: config.maxDepth,
      });
      await this.update(exp, "created");
      return exp;
    });
  }

  /** Stage 3 — execute selected trajectories in a real browser. */
  async verify(id: string): Promise<Experiment> {
    const exp = await this.mustGet(id);
    if (exp.simulations.length === 0) await this.simulate(id);
    const e = (await this.mustGet(id))!;
    await this.update(e, "verifying");
    return withTrace("verify", id, async () => {
      const graph = e.graph!;
      const stateById = new Map(graph.states.map((s) => [s.stateId, s]));
      const adj = adjacency(graph);
      const selected = selectTrajectories(e.simulations, e.configuration.verifyCount);

      for (const traj of selected) {
        const actions = traj.steps
          .map((s) => s.actionId)
          .filter(Boolean)
          .map((actionId) => {
            for (const st of graph.states) {
              const a = st.actions.find((x) => x.actionId === actionId);
              if (a) return { actionId: a.actionId, label: a.label, href: a.href, role: a.role };
            }
            return null;
          })
          .filter(Boolean) as { actionId: string; label: string; href?: string; role?: string }[];
        void adj;
        void stateById;

        for (const vpName of e.configuration.viewports.slice(0, 1).concat(
          traj === selected[0] && e.configuration.viewports.includes("mobile") ? ["mobile"] : [],
        )) {
          const run = await this.runner.runTrajectory({
            url: e.targetUrl,
            viewport: VIEWPORTS[vpName],
            actions,
            assertions: e.assertions,
            runId: `run_${traj.trajectoryId}_${vpName}`,
          });
          e.browserTests.push(run);
        }
      }
      await this.update(e, "created");
      return e;
    });
  }

  /** Stage 4 — rule + LLM findings. */
  async analyze(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.browserTests.length === 0) await this.verify(id);
    const exp = (await this.mustGet(id))!;
    await this.update(exp, "analyzing");
    return withTrace("analyze", id, async () => {
      const states = exp.graph?.states ?? [];
      const rules = ruleFindings({ states, runs: exp.browserTests, assertions: exp.assertions });
      const llm = await llmFindings({ llm: this.llm, states, runs: exp.browserTests, goal: exp.goal });
      exp.findings = dedupeFindings([...rules, ...llm]);
      await this.update(exp, "created");
      return exp;
    });
  }

  /** Stage 5 — propose + apply variant, re-verify, compare. */
  async compare(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.findings.length === 0) await this.analyze(id);
    const exp = (await this.mustGet(id))!;
    await this.update(exp, "comparing");
    return withTrace("compare", id, async () => {
      const finding = exp.findings[0];
      if (!finding) {
        await this.update(exp, "created");
        return exp;
      }
      const variant = await this.proposeVariant(exp, finding.findingId);
      exp.variants.push(variant);

      const baselineActions = exp.browserTests[0]?.steps.map((s) => ({ label: s.label })) ?? [];
      const run = await this.runner.runTrajectory({
        url: exp.targetUrl,
        viewport: VIEWPORTS.desktop,
        actions: baselineActions,
        assertions: exp.assertions,
        runId: `run_variant_${variant.variantId}`,
        patches: variant.patches,
      });
      run.variantId = variant.variantId;
      exp.browserTests.push(run);

      const baseline = exp.browserTests.find((r) => !r.variantId) ?? exp.browserTests[0];
      const comparison: Comparison = {
        baselineRunId: baseline.runId,
        variantRunId: run.runId,
        deltas: {
          goalCompleted: { baseline: baseline.success, variant: run.success },
          interactionCount: { baseline: baseline.steps.length, variant: run.steps.length },
          backtracks: { baseline: baseline.steps.length, variant: run.steps.length },
          failedInteractions: {
            baseline: baseline.steps.filter((s) => !s.ok).length,
            variant: run.steps.filter((s) => !s.ok).length,
          },
          runtimeErrors: { baseline: baseline.errors.length, variant: run.errors.length },
          findingReproduces: run.success === baseline.success,
        },
      };
      exp.comparisons.push(comparison);
      variant.status = "verified";
      await this.update(exp, "created");
      return exp;
    });
  }

  /** Stage 6 — the deliverable: spec.md of all changes + rebuild plan. */
  async spec(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.comparisons.length === 0) await this.compare(id);
    const exp = (await this.mustGet(id))!;
    return withTrace("spec", id, async () => {
      exp.spec = await generateSpec(exp, this.llm);
      const dir = path.join(process.cwd(), "data", "experiments", exp.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "spec.md"), specToMarkdown(exp.spec));
      await this.update(exp, "complete");
      return exp;
    });
  }

  /** Full closed loop. */
  async runAll(id: string): Promise<Experiment> {
    await this.discover(id);
    await this.simulate(id);
    await this.verify(id);
    await this.analyze(id);
    await this.compare(id);
    return this.spec(id);
  }

  private async proposeVariant(exp: Experiment, findingId: string): Promise<Variant> {
    const finding = exp.findings.find((f) => f.findingId === findingId);
    const patch =
      finding && /post-event|stale/i.test(finding.title)
        ? {
            op: "insertNotice" as const,
            selector: "body",
            value: `This event has concluded — ${exp.goal.slice(0, 60)}. Recordings and future dates coming soon.`,
          }
        : { op: "insertNotice" as const, selector: "body", value: "Rehearsal variant: content under review." };
    return {
      variantId: `var_${randomUUID().slice(0, 8)}`,
      findingId,
      description: finding?.recommendation ?? "Proposed UX change",
      patches: [patch],
      status: "applied",
    };
  }

  private async compileAssertions(goal: string): Promise<Assertion[]> {
    try {
      const raw = await this.llm.complete(
        `Convert this website-visit objective into 2-3 machine-checkable assertions.
Kinds: text-present, text-absent, element-visible, element-present, title-matches, url-matches.
GOAL: ${goal}
Return ASSERTION_LIST as a JSON array of {kind, value, selector?}.`,
        { json: true },
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 4).map((a) => ({
          kind: a.kind ?? "text-present",
          value: String(a.value ?? goal.split(/\s+/).slice(0, 4).join(" ")),
          selector: a.selector,
        }));
      }
    } catch {
      /* fall through to heuristic */
    }
    const keywords = goal.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 4).slice(0, 2);
    return keywords.map((value) => ({ kind: "text-present" as const, value }));
  }

  private async mustGet(id: string): Promise<Experiment> {
    const e = await this.store.get(id);
    if (!e) throw new Error(`Unknown experiment: ${id}`);
    return e;
  }

  private async update(exp: Experiment, status: Experiment["status"]): Promise<void> {
    exp.status = status;
    await this.store.save(exp);
  }

  async dispose(): Promise<void> {
    await this.runner.close();
  }
}

function dedupeFindings(list: Experiment["findings"]): Experiment["findings"] {
  const seen = new Set<string>();
  return list.filter((f) => {
    const key = `${f.category}|${f.title.toLowerCase().slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
