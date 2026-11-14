import { randomUUID } from "node:crypto";
import {
  Experiment,
  ExperimentConfig,
  VIEWPORTS,
  type Assertion,
  type BrowserRunner,
  type Comparison,
  type ExperimentStore,
  type JevClient,
  type LlmClient,
  type PageFetcher,
  type SimWeights,
  type Variant,
} from "./contracts";
import { selectFetcher } from "./fetch";
import { assertPublicUrl, robotsDisallowed } from "./fetch/guards";
import { extractPage, selectRunner } from "./browser/runner";
import { GraphBuilder, makeState, adjacency } from "./graph";
import { selectJev, scoreActions } from "./decisions/jev";
import { simulateTrajectories, selectTrajectories } from "./simulation";
import { selectLlm } from "./analysis/gemini";
import { endpointFindings, llmFindings, ruleFindings } from "./analysis/findings";
import { collapseFindings } from "./analysis/dedupe";
import { questionFindings } from "./analysis/question-findings";
import {
  EXPECTED_CLASSES,
  classifyGoalWithLlm,
  defaultIntentsForSite,
  detectSiteType,
  discoverEndpoints,
  endpointJourneys,
  intentForGoal,
  endpointGoalAssertions,
  visitorQuestions,
} from "./intents";
import { metricFindings } from "./analysis/metric-findings";
import { metricsFromHtml } from "./browser/metrics";
import { generateSpec, specToMarkdown } from "./analysis/spec";
import { selectStore } from "./storage";
import { captureError, logEvent, traceTags, withTrace } from "./telemetry";
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

interface OrchestratorDeps {
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
    this.llm.resetBudget?.();
    await this.update(experiment, "discovering");
    return withTrace("discover", { experimentId: id, targetUrl: experiment.targetUrl }, async () => {
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
        const frontier: { url: string; depth: number; from?: { stateId: string; actionId: string } }[] = [
          { url: experiment.targetUrl, depth: 0 },
        ];
        const visited = new Map<string, string>(); // url -> canonical stateId
        const attempted = new Set<string>();
        while (frontier.length > 0) {
          const { url, depth, from } = frontier.shift()!;
          if (visited.has(url)) {
            if (from) builder.link(from.stateId, from.actionId, visited.get(url)!);
            continue;
          }
          if (attempted.has(url) || depth > config.maxDepth || builder.full) continue;
          attempted.add(url);
          try {
            const { html, screenshotPath, metrics } = await this.runner.openPage(url, viewport, {
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
            state.metrics = metrics ?? metricsFromHtml(html, url, viewport);
            const { state: canonical, isNew } = builder.add(state);
            if (!isNew && !builder.has(canonical.stateId)) continue;
            visited.set(url, canonical.stateId);
            if (from) builder.link(from.stateId, from.actionId, canonical.stateId);
            if (!isNew) continue;
            if (depth < config.maxDepth) {
              const origin = new URL(experiment.targetUrl).origin;
              const goalWords = experiment.goal.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
              const relevant = (label: string, href: string) =>
                goalWords.some((w) => `${label} ${href}`.toLowerCase().includes(w)) ? 1 : 0;
              const links = canonical.actions
                .filter((a) => a.type === "click" && a.href && a.href.startsWith(origin))
                .sort((a, b) => relevant(b.label, b.href!) - relevant(a.label, a.href!));
              for (const a of links) {
                frontier.push({ url: a.href!, depth: depth + 1, from: { stateId: canonical.stateId, actionId: a.actionId } });
              }
            }
          } catch (e) {
            logEvent({ experimentId: id, stage: "discover", kind: "page-fail", data: { url, error: String(e).slice(0, 160) } });
            await captureError(e, { url, depth, viewport: vpName }, {
              tags: traceTags("discover", { experimentId: id, targetUrl: experiment.targetUrl }),
              level: "warning",
            });
          }
        }
      }
      experiment.graph = builder.build();
      await this.mapIntents(experiment);
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
    return withTrace("simulate", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      const config = exp.configuration;
      const graph = exp.graph!;
      const start = graph.states[0];
      if (!start) throw new Error("Discovery captured no states (every page load failed)");

      // Assertions: from LLM objective compile (fixture fallback = keyword text check).
      exp.assertions = await this.compileAssertions(exp.goal);
      if (!exp.endpoints) await this.mapIntents(exp);

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
        assertions: [...exp.assertions, ...endpointGoalAssertions(exp.graph, exp.intents?.[0], exp.endpoints)],
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
    return withTrace("verify", { experimentId: id, targetUrl: e.targetUrl }, async () => {
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
    return withTrace("analyze", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      const states = exp.graph?.states ?? [];
      const rules = ruleFindings({ states, runs: exp.browserTests, assertions: exp.assertions });
      const llm = await llmFindings({ llm: this.llm, states, runs: exp.browserTests, goal: exp.goal });
      const endpoints = await this.endpointAnalysis(exp);
      const graph = exp.graph?.states.length ? exp.graph : undefined;
      if (graph) exp.questions = await visitorQuestions(graph, exp.endpoints ?? [], detectSiteType(graph), this.llm);
      exp.findings = collapseFindings([
        ...rules,
        ...endpoints,
        ...metricFindings(states, { homepageUrl: exp.targetUrl }),
        ...questionFindings(exp.questions ?? [], graph),
        ...llm,
      ], { states, runs: exp.browserTests.length });
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
    return withTrace("compare", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      const finding = exp.findings.find((f) => /post-event|stale/i.test(f.title)) ?? exp.findings[0];
      if (!finding) {
        await this.update(exp, "created");
        return exp;
      }
      const variant = await this.proposeVariant(exp, finding.findingId);
      exp.variants.push(variant);

      const actionById = new Map((exp.graph?.states ?? []).flatMap((st) => st.actions.map((a) => [a.actionId, a] as const)));
      const baselineActions =
        exp.browserTests[0]?.steps.map((s) => {
          const a = s.actionId ? actionById.get(s.actionId) : undefined;
          return { actionId: s.actionId, label: s.label, href: a?.href, role: a?.role };
        }) ?? [];
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
    return withTrace("spec", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      exp.spec = await generateSpec(exp, this.llm);
      // Evidence/spec files are best-effort; edge runtimes have a read-only fs.
      try {
        const dir = path.join(process.cwd(), "data", "experiments", exp.id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "spec.md"), specToMarkdown(exp.spec));
      } catch {
        /* spec.md lives on the experiment payload regardless */
      }
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
            value: "This event has concluded. Recordings and future dates coming soon.",
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

  /** Classify the goal (RFX intent), add one default goal per category, discover + weight endpoints. */
  private async mapIntents(exp: Experiment): Promise<void> {
    const graph = exp.graph;
    if (!graph || graph.states.length === 0) return;
    const goalIntent = intentForGoal(exp.goal, await classifyGoalWithLlm(exp.goal, this.llm));
    exp.intents = [goalIntent, ...defaultIntentsForSite(graph)];
    exp.endpoints = discoverEndpoints(graph, { intents: [goalIntent] });
    logEvent({
      experimentId: exp.id,
      stage: "discover",
      kind: "endpoints",
      data: { intent: goalIntent.category, endpoints: exp.endpoints.length, siteType: detectSiteType(graph) },
    });
  }

  /** Seeded endpoint journeys + reachability findings (unreachable / deep / missing class). */
  private async endpointAnalysis(exp: Experiment): Promise<Experiment["findings"]> {
    const graph = exp.graph;
    if (!graph || graph.states.length === 0) return [];
    if (!exp.endpoints) await this.mapIntents(exp);
    const endpoints = exp.endpoints ?? [];
    exp.journeys = endpointJourneys(graph, endpoints, {
      seed: exp.configuration.seed,
      maxDepth: exp.configuration.maxDepth,
    });
    const siteType = detectSiteType(graph);
    return endpointFindings({
      endpoints,
      journeys: exp.journeys,
      expectedClasses: EXPECTED_CLASSES[siteType],
      siteType,
      statesDiscovered: graph.states.length,
    });
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

