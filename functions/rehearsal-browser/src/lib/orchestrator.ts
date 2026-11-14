import { randomUUID } from "node:crypto";
import {
  Experiment,
  ExperimentConfig,
  VIEWPORTS,
  type ActivityKind,
  Assertion,
  type BrowserRunner,
  type Comparison,
  type ExperimentStore,
  type JevClient,
  type JevScoreCache,
  type LlmClient,
  type PageFetcher,
  type RunFailure,
  type SimWeights,
  type Variant,
  type VisitorPersona,
} from "./contracts";
import { selectFetcher } from "./fetch";
import { assertPublicUrl, robotsAllows } from "./fetch/guards";
import { agentVerifyEnabled, extractPage, selectRunner } from "./browser/runner";
import { RehearsalError, dominantCode, formatFailure, toFailure } from "./errors";
import { GraphBuilder, makeState } from "./graph";
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
  inferGoalAndPersonas,
  visitorQuestions,
} from "./intents";
import { metricFindings } from "./analysis/metric-findings";
import { metricsFromHtml } from "./browser/metrics";
import { isSameOrigin } from "./browser/extract";
import { errorText } from "./browser/types";
import { generateSpec, specToMarkdown } from "./analysis/spec";
import { generateMockup } from "./mockup";
import { brandSignalsFromHtml, generateRebuild, mergeSignals } from "./rebuild";
import { selectStore } from "./storage";
import { captureError, logEvent, traceTags, withTrace } from "./telemetry";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ActivityEvent } from "./contracts";

/** Canonical pipeline stages — keep in sync with .devin/skills/rehearsal-testing/SKILL.md (CI-enforced). */
export const PIPELINE_STAGES = [
  "discover",
  "simulate",
  "verify",
  "analyze",
  "compare",
  "spec",
  "rebuild",
] as const;

/** Hard cap on the probe's page fetch so a hanging request can't stall experiment creation (robots prefetch + host politeness delay may add up to ~12s on top). */
const PROBE_TIMEOUT_MS = 15_000;

interface OrchestratorDeps {
  fetcher?: PageFetcher;
  jev?: JevClient;
  llm?: LlmClient;
  store?: ExperimentStore;
  runner?: BrowserRunner;
}

/** Thrown when a stage is requested while another run of the same experiment is in progress. */
export class StageInProgressError extends Error {
  constructor(
    readonly experimentId: string,
    readonly runningStage: string,
  ) {
    super(`Experiment ${experimentId} already has a ${runningStage} run in progress`);
    this.name = "StageInProgressError";
  }
}

export class Orchestrator {
  /** Experiment id -> stage currently running. One run per experiment at a time. */
  private running = new Map<string, string>();
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

  /**
   * Create an experiment. `goal` is optional: when omitted, a cheap first-page
   * probe (one HTML fetch through the keyless fetcher) derives the goal and a
   * small set of visitor personas from the site's own CTAs, nav and endpoints.
   * The probe never blocks creation — on failure the goal falls back to a
   * generic "Learn what {host} offers" and discovery still runs.
   */
  async createExperiment(targetUrl: string, goal?: string, config?: Partial<ExperimentConfig>): Promise<Experiment> {
    const url = await assertPublicUrl(targetUrl);
    const explicit = goal?.trim() || undefined;
    const probed = explicit ? undefined : await this.probe(url.toString());
    const experiment = Experiment.parse({
      id: `exp_${randomUUID().slice(0, 8)}`,
      targetUrl: url.toString(),
      goal: explicit ?? probed!.goal,
      goalSource: explicit ? "user" : probed!.source,
      personas: probed?.personas ?? [],
      status: "created",
      createdAt: new Date().toISOString(),
      configuration: ExperimentConfig.parse(config ?? {}),
    });
    await this.store.save(experiment);
    if (probed) {
      await this.emit(
        experiment.id,
        "create",
        "info",
        probed.source === "inferred"
          ? `Inferred the goal from the site's own CTAs: "${experiment.goal}" · personas: ${experiment.personas.map((p) => p.name).join(", ")}`
          : `First-page probe failed — goal defaulted to "${experiment.goal}"`,
      );
    }
    return experiment;
  }

  /**
   * One bounded fetch of the target URL, then deterministic goal + persona
   * inference on the extracted page. Never throws: returns `source: "default"`
   * with a hostname-derived goal when the page can't be fetched or parsed.
   */
  private async probe(url: string): Promise<{ goal: string; personas: VisitorPersona[]; source: "inferred" | "default" }> {
    const fallback = `Learn what ${new URL(url).hostname} offers`;
    try {
      if (!(await robotsAllows(new URL(url)))) {
        logEvent({ stage: "create", kind: "probe-fail", data: { url, error: "disallowed by robots.txt" } });
        return { goal: fallback, personas: [], source: "default" };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error(`probe fetch timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
      let html: string;
      try {
        html = await Promise.race([
          this.fetcher.fetchHtml(url, { signal: ctrl.signal }),
          new Promise<never>((_, reject) =>
            ctrl.signal.addEventListener("abort", () => reject(ctrl.signal.reason), { once: true }),
          ),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const page = extractPage(html, url);
      const state = makeState({
        url,
        viewport: VIEWPORTS.desktop,
        title: page.title,
        visibleText: page.visibleText,
        actions: page.actions,
      });
      state.brand = brandSignalsFromHtml(html, url);
      const inferred = inferGoalAndPersonas(state);
      logEvent({
        stage: "create",
        kind: "probe",
        data: { url, fetcher: this.fetcher.name, goal: inferred.goal, personas: inferred.personas.map((p) => p.intent) },
      });
      return { ...inferred, source: "inferred" };
    } catch (e) {
      logEvent({ stage: "create", kind: "probe-fail", data: { url, error: errorText(e, 160) } });
      return { goal: fallback, personas: [], source: "default" };
    }
  }

  async get(id: string): Promise<Experiment | null> {
    return this.store.get(id);
  }

  async list(): Promise<Experiment[]> {
    return this.store.list();
  }

  /** The experiment's live activity feed (bounded, chronological). */
  async activity(id: string): Promise<ActivityEvent[]> {
    return this.store.activity(id);
  }

  /** Append one line to the feed. Best-effort: a store failure must never break a stage. */
  private async emit(id: string, stage: string, kind: ActivityKind, message: string, url?: string): Promise<void> {
    try {
      await this.store.appendActivity(id, {
        ts: new Date().toISOString(),
        stage,
        kind,
        message,
        url,
      });
    } catch {
      /* activity is a transparency surface, not pipeline state */
    }
  }

  /**
   * Public stage entry points. Each holds the experiment's run lock for the whole call, including
   * the earlier stages it starts on demand, so a concurrent request fails fast instead of
   * duplicating browser/LLM work and overwriting the stored experiment.
   */
  async discover(id: string): Promise<Experiment> {
    return this.exclusive(id, "discover", () => this.runDiscover(id));
  }

  async simulate(id: string): Promise<Experiment> {
    return this.exclusive(id, "simulate", () => this.runSimulate(id));
  }

  async verify(id: string): Promise<Experiment> {
    return this.exclusive(id, "verify", () => this.runVerify(id));
  }

  async analyze(id: string): Promise<Experiment> {
    return this.exclusive(id, "analyze", () => this.runAnalyze(id));
  }

  async compare(id: string): Promise<Experiment> {
    return this.exclusive(id, "compare", () => this.runCompare(id));
  }

  async spec(id: string): Promise<Experiment> {
    return this.exclusive(id, "spec", () => this.runSpec(id));
  }

  async rebuild(id: string): Promise<Experiment> {
    return this.exclusive(id, "rebuild", () => this.runRebuild(id));
  }

  /** Stage 1 — discover states, build graph. */
  private async runDiscover(id: string): Promise<Experiment> {
    const experiment = await this.mustGet(id);
    this.llm.resetBudget?.({ experimentId: id });
    this.jev.resetBudget?.({ experimentId: id });
    await this.update(experiment, "discovering");
    return withTrace("discover", { experimentId: id, targetUrl: experiment.targetUrl }, async () => {
      const config = experiment.configuration;
      const builder = new GraphBuilder(config.maxStates, config.maxDepth);
      const pageFailures: RunFailure[] = [];
      logEvent({ experimentId: id, stage: "discover", kind: "browser-runner", data: { runner: this.runner.name } });
      await this.emit(id, "discover", "info", `Mapping ${experiment.targetUrl} with ${this.runner.name}`);
      if (!(await robotsAllows(new URL(experiment.targetUrl)))) {
        await this.emit(id, "discover", "error", "Blocked by robots.txt", experiment.targetUrl);
        throw new RehearsalError("ROBOTS_DISALLOWED", `Target path disallowed by robots.txt: ${experiment.targetUrl}`, experiment.targetUrl);
      }

      try {
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
            await this.emit(id, "discover", "fetch", `Fetching ${url}`, url);
            try {
              const { html, screenshotPath, metrics, brand } = await this.runner.openPage(url, viewport, {
                shotName: `${id}_${vpName}_d${depth}`,
                scope: id,
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
              state.brand = mergeSignals(brandSignalsFromHtml(html, url), brand);
              state.metrics = metrics ?? metricsFromHtml(html, url, viewport);
              const { state: canonical, isNew } = builder.add(state);
              if (!isNew && !builder.has(canonical.stateId)) continue;
              visited.set(url, canonical.stateId);
              if (from) builder.link(from.stateId, from.actionId, canonical.stateId);
              if (!isNew) continue;
              await this.emit(
                id, "discover", "map",
                `Mapped ${pagePath(url)} → ${canonical.actions.length} actions`,
                url,
              );
              if (depth < config.maxDepth) {
                const origin = new URL(experiment.targetUrl).origin;
                const goalWords = experiment.goal.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
                const relevant = (label: string, href: string) =>
                  goalWords.some((w) => `${label} ${href}`.toLowerCase().includes(w)) ? 1 : 0;
                const links = canonical.actions
                  .filter((a) => a.type === "click" && isSameOrigin(a.href, origin))
                  .sort((a, b) => relevant(b.label, b.href!) - relevant(a.label, a.href!));
                for (const a of links) {
                  frontier.push({ url: a.href!, depth: depth + 1, from: { stateId: canonical.stateId, actionId: a.actionId } });
                }
              }
            } catch (e) {
              const failure = toFailure(e, "discover", url);
              pageFailures.push(failure);
              logEvent({ experimentId: id, stage: "discover", kind: "page-fail", data: { url, code: failure.code, error: errorText(e, 160) } });
              await this.emit(id, "discover", "error", `Couldn't load ${pagePath(url)}: [${failure.code}] ${errorText(e, 160)}`, url);
              await captureError(e, { url, depth, viewport: vpName }, {
                tags: traceTags("discover", { experimentId: id, targetUrl: experiment.targetUrl }),
                level: "warning",
              });
            }
          }
        }
      } finally {
        await this.runner.releaseCaptures?.(id);
      }
      experiment.graph = builder.build();
      experiment.failures = [...experiment.failures.filter((f) => f.stage !== "discover"), ...pageFailures];
      if (experiment.graph.states.length === 0) {
        // Keep the per-page failures before markFailed reloads the stored experiment.
        await this.update(experiment, "discovering");
        const code = dominantCode(pageFailures);
        const sample = pageFailures.find((f) => f.code === code);
        const cause = sample ? ` Most common cause: ${formatFailure(sample)}` : "";
        throw new RehearsalError(
          "DISCOVERY_EMPTY",
          `Discovery captured no states: ${pageFailures.length} of ${pageFailures.length} page loads failed with ${this.runner.name}.${cause}`,
          experiment.targetUrl,
        );
      }
      await this.emit(
        id, "discover", "info",
        `Map complete: ${experiment.graph.states.length} states · ${experiment.graph.edges.length} links`,
      );
      await this.mapIntents(experiment);
      await this.update(experiment, "created");
      return experiment;
    });
  }

  /** Stage 2 — score actions with Jev, run seeded simulation, verify top paths. */
  private async runSimulate(id: string): Promise<Experiment> {
    const experiment = await this.mustGet(id);
    if (!experiment.graph || experiment.graph.states.length === 0) {
      await this.runDiscover(id);
    }
    const exp = (await this.mustGet(id))!;
    await this.update(exp, "simulating");
    return withTrace("simulate", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      const config = exp.configuration;
      const graph = exp.graph!;
      const start = graph.states[0];
      if (!start) throw new RehearsalError("DISCOVERY_EMPTY", "Discovery captured no states; rerun discover before simulate");

      // Assertions: from LLM objective compile (fixture fallback = keyword text check).
      exp.assertions = await this.compileAssertions(exp.goal);
      await this.emit(id, "simulate", "info", `Compiled ${exp.assertions.length} assertions for the goal`);
      if (!exp.endpoints) await this.mapIntents(exp);

      // Score each state's actions once; dedupe identical Jev payloads (e.g. viewport twins of a URL).
      const weights: SimWeights = { byState: new Map(), ambiguity: new Map() };
      const scoreCache: JevScoreCache = new Map();
      const scoredStates = graph.states.slice(0, config.maxStates);
      for (const state of scoredStates) {
        const { scored, ambiguity } = await scoreActions(this.jev, state, exp.goal, "goal-directed", {
          cache: scoreCache,
          experimentId: id,
        });
        weights.byState.set(
          state.stateId,
          new Map(scored.map((s) => [s.action.actionId, s.weight])),
        );
        weights.ambiguity.set(state.stateId, ambiguity);
      }
      await this.emit(
        id,
        "simulate",
        "decide",
        `Scored actions across ${weights.byState.size} states — ${scoreCache.size} model calls (${weights.byState.size - scoreCache.size} deduped)`,
      );

      exp.simulations = simulateTrajectories({
        graph,
        startStateId: start.stateId,
        weights,
        assertions: [...exp.assertions, ...endpointGoalAssertions(exp.graph, exp.intents?.[0], exp.endpoints)],
        seed: config.seed,
        count: config.trajectories,
        maxDepth: config.maxDepth,
      });
      const reached = exp.simulations.filter((t) => t.outcome === "goal-reached").length;
      await this.emit(id, "simulate", "info", `Simulated ${exp.simulations.length} journeys — ${reached} reached the goal`);
      await this.update(exp, "created");
      return exp;
    });
  }

  /** Stage 3 — execute selected trajectories in a real browser. */
  private async runVerify(id: string): Promise<Experiment> {
    const exp = await this.mustGet(id);
    if (exp.simulations.length === 0) await this.runSimulate(id);
    const e = (await this.mustGet(id))!;
    await this.update(e, "verifying");
    return withTrace("verify", { experimentId: id, targetUrl: e.targetUrl }, async () => {
      const graph = e.graph!;
      const actionById = new Map(graph.states.flatMap((st) => st.actions.map((a) => [a.actionId, a] as const)));
      const selected = selectTrajectories(e.simulations, e.configuration.verifyCount);

      for (const traj of selected) {
        const actions = traj.steps
          .map((s) => s.actionId)
          .filter(Boolean)
          .map((actionId) => {
            const a = actionById.get(actionId!);
            return a ? { actionId: a.actionId, label: a.label, href: a.href, role: a.role } : null;
          })
          .filter(Boolean) as { actionId: string; label: string; href?: string; role?: string }[];

        const vps = e.configuration.viewports.slice(0, 1);
        if (traj === selected[0] && e.configuration.viewports.includes("mobile") && !vps.includes("mobile")) vps.push("mobile");
        for (const vpName of vps) {
          const runId = `run_${traj.trajectoryId}_${vpName}`;
          await this.emit(id, "verify", "browser", `${runId}: replaying ${actions.length} steps on ${vpName}`);
          const args = {
            url: e.targetUrl,
            viewport: VIEWPORTS[vpName],
            actions,
            assertions: e.assertions,
            runId,
          };
          // Agent runs only where the backend has a model (opt-in); compare stays scripted so baseline/variant replay identically.
          const useAgent =
            agentVerifyEnabled() && this.runner.supportsAgent === true && typeof this.runner.runAgentTask === "function";
          const run = useAgent
            ? await this.runner.runAgentTask!({ ...args, goal: e.goal })
            : await this.runner.runTrajectory(args);
          for (const s of run.steps.filter((s) => !s.ok)) {
            await this.emit(id, "verify", "assert", `"${s.label}" failed${s.error ? ` — ${s.error}` : ""}`);
          }
          for (const a of run.assertions.filter((a) => !a.passed)) {
            await this.emit(id, "verify", "assert", `Assertion failed: ${a.assertion.kind} "${a.assertion.value}"`);
          }
          await this.emit(id, "verify", "browser", `${runId}: ${run.success ? "goal reached" : "goal not reached"} in ${run.durationMs} ms`);
          e.browserTests.push(run);
        }
      }
      await this.update(e, "created");
      return e;
    });
  }

  /** Stage 4 — rule + LLM findings. */
  private async runAnalyze(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.browserTests.length === 0) await this.runVerify(id);
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
      const verified = exp.findings.filter((f) => f.evidenceType === "verified-failure").length;
      const unanswered = (exp.questions ?? []).filter((q) => !q.answered).length;
      await this.emit(
        id, "analyze", "finding",
        `${exp.findings.length} findings (${verified} verified failures)` +
          (exp.questions ? ` · ${unanswered} of ${exp.questions.length} visitor questions unanswered` : ""),
      );
      await this.update(exp, "created");
      return exp;
    });
  }

  /** Stage 5 — propose + apply variant, re-verify, compare. */
  private async runCompare(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.findings.length === 0) await this.runAnalyze(id);
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
      await this.emit(id, "compare", "browser", `Applied variant ${variant.variantId}: ${variant.patches.length} patch(es)`);

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
      // Backtracks = successful steps that revisit a URL (query kept, hash dropped) already seen, incl. the start page.
      const backtracksOf = (r: typeof run) => {
        const pageKey = (u: string) => u.split("#")[0].replace(/\/$/, "");
        const seen = new Set([pageKey(exp.targetUrl)]);
        let n = 0;
        for (const s of r.steps) {
          const href = s.ok && s.actionId ? actionById.get(s.actionId)?.href : undefined;
          if (!href) continue;
          const key = pageKey(href);
          if (seen.has(key)) n++;
          seen.add(key);
        }
        return n;
      };
      const comparison: Comparison = {
        baselineRunId: baseline.runId,
        variantRunId: run.runId,
        deltas: {
          goalCompleted: { baseline: baseline.success, variant: run.success },
          interactionCount: { baseline: baseline.steps.length, variant: run.steps.length },
          backtracks: { baseline: backtracksOf(baseline), variant: backtracksOf(run) },
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
      await this.emit(
        id, "compare", "info",
        `Variant replay: goal ${run.success ? "reached" : "not reached"} · ${run.steps.length} steps vs baseline ${baseline.steps.length}`,
      );
      await this.update(exp, "created");
      return exp;
    });
  }

  /** Stage 6 — the deliverable: spec.md of all changes + rebuild plan. */
  private async runSpec(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.comparisons.length === 0) await this.runCompare(id);
    const exp = (await this.mustGet(id))!;
    return withTrace("spec", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      exp.spec = await generateSpec(exp, this.llm);
      await this.emit(id, "spec", "info", `Spec written: ${exp.spec.changes.length} changes across ${exp.spec.rebuildPhases.length} phases`);
      const usage = this.collectUsage();
      if (usage) {
        const fmt = (u: { calls: number; totalTokens: number; estimated?: boolean }) =>
          `${u.calls} calls · ~${(u.totalTokens / 1000).toFixed(1)}k tokens${u.estimated ? " (est)" : ""}`;
        const parts = [usage.llm && `llm ${fmt(usage.llm)}`, usage.jev && `jev ${fmt(usage.jev)}`].filter(Boolean);
        await this.emit(id, "spec", "info", `Model usage this run: ${parts.join(" · ")}`);
      }
      // Mockup is a bonus deliverable: a spec failure can't lose it, and vice versa.
      try {
        exp.mockup = await generateMockup(exp, this.llm);
        await this.emit(id, "spec", "info", `Mockup built: ${exp.mockup.pages.length} pages under /experiments/${id}/preview/`);
      } catch (err) {
        logEvent({ experimentId: id, stage: "spec", kind: "llm-fallback", data: { error: `mockup skipped: ${String(err).slice(0, 160)}` } });
      }
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

  /** Stage 7 — rebuild the site per inferred visitor goal, in the site's own branding. */
  private async runRebuild(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (!e.spec) await this.runSpec(id);
    const exp = await this.mustGet(id);
    await this.update(exp, "rebuilding");
    return withTrace("rebuild", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      exp.rebuild = await generateRebuild(exp, this.llm);
      await this.update(exp, "complete");
      return exp;
    });
  }

  /** Full closed loop. */
  async runAll(id: string): Promise<Experiment> {
    return this.exclusive(id, "run", async () => {
      await this.runDiscover(id);
      await this.runSimulate(id);
      await this.runVerify(id);
      await this.runAnalyze(id);
      await this.runCompare(id);
      await this.runSpec(id);
      return this.runRebuild(id);
    });
  }

  private async proposeVariant(exp: Experiment, findingId: string): Promise<Variant> {
    const finding = exp.findings.find((f) => f.findingId === findingId);
    const patch =
      finding && /post-event|stale|still invites registration/i.test(finding.title)
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
      const parsed: unknown = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed)) {
        const valid = parsed
          .map((a) => Assertion.safeParse(a && typeof a === "object" && a.selector === null ? { ...a, selector: undefined } : a))
          .flatMap((r) => (r.success ? [r.data] : []))
          .slice(0, 4);
        if (valid.length > 0) return valid;
      }
    } catch {
      /* fall through to heuristic */
    }
    const keywords = goal.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 4).slice(0, 2);
    return keywords.map((value) => ({ kind: "text-present" as const, value }));
  }

  /** Claim the run lock synchronously (before any await) so two concurrent calls can't both pass. */
  private async exclusive<T>(id: string, stage: string, fn: () => Promise<T>): Promise<T> {
    const active = this.running.get(id);
    if (active) throw new StageInProgressError(id, active);
    this.running.set(id, stage);
    try {
      return await fn();
    } finally {
      this.running.delete(id);
    }
  }

  private async mustGet(id: string): Promise<Experiment> {
    const e = await this.store.get(id);
    if (!e) throw new Error(`Unknown experiment: ${id}`);
    return e;
  }

  /** Records a stage failure so the dashboard stops showing a stuck "discovering…" state. */
  async markFailed(id: string, err: unknown): Promise<void> {
    const exp = await this.store.get(id).catch(() => null);
    if (!exp) return;
    const failure = toFailure(err, "run");
    const message = formatFailure(failure).slice(0, 500);
    await this.emit(id, "run", "error", `Run failed: ${message}`);
    if (exp.errors[exp.errors.length - 1] !== message) exp.errors.push(message);
    exp.failures.push(failure);
    await this.update(exp, "failed");
  }

  private async update(exp: Experiment, status: Experiment["status"]): Promise<void> {
    exp.status = status;
    const usage = this.collectUsage();
    if (usage) exp.usage = usage;
    await this.store.save(Experiment.parse(exp));
  }

  /** Merge the clients' per-run usage counters — undefined when neither client reports. */
  private collectUsage(): Experiment["usage"] {
    const llm = this.llm.usageReport?.();
    const jev = this.jev.usageReport?.();
    if (!llm && !jev) return undefined;
    return { llm, jev };
  }

  async dispose(): Promise<void> {
    await this.runner.close();
  }
}

/** Short readable form of a page URL for feed messages ("/code/2026"), raw string on parse failure. */
function pagePath(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    return `${u.host}${path}` || u.host;
  } catch {
    return url.slice(0, 80);
  }
}

