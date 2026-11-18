import { randomUUID } from "node:crypto";
import {
  Experiment,
  ExperimentConfig,
  VIEWPORTS,
  type ActivityKind,
  Assertion,
  type BrowserRun,
  type BrowserRunner,
  type Comparison,
  type ExperimentStore,
  type FirecrawlClient as FirecrawlClientPort,
  type JevClient,
  type JevScoreCache,
  type LlmClient,
  type PageFetcher,
  type RescanReport,
  type DiscoverCheckpoint,
  type RunCheckpoint,
  type RunFailure,
  type RunLeaseStore,
  type SimWeights,
  type Variant,
  type VisitorPersona,
} from "./contracts";
import { FirecrawlClient, PlainFetcher, looksLikeJsShell, selectFetcher } from "./fetch";
import { assertPublicUrl, robotsAllows } from "./fetch/guards";
import { agentVerifyEnabled, extractPage, selectRunner } from "./browser/runner";
import { InvalidTargetError, RehearsalError, RemoteTimeoutError, classifyError, dominantCode, formatFailure, toFailure } from "./errors";
import { GraphBuilder, makeState } from "./graph";
import { selectJev, scoreActions } from "./decisions/jev";
import { simulateTrajectories, selectTrajectories } from "./simulation";
import { journeysToTrajectories, runPersonaSwarm, selectJourneys } from "./simulation/swarm";
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
import { contentSignatureFor, isSameOrigin, normalizeSiteUrl } from "./browser/extract";
import { errorText, failedGoalAssertions, runSucceeded } from "./browser/types";
import { generateSpec, specToMarkdown } from "./analysis/spec";
import { generateMockup } from "./mockup";
import { brandSignalsFromHtml, inferGoals, rollupBrand, mergeSignals } from "./rebuild";
import { buildPage, planSite, rebuildPending, REBUILD_BATCH, SITE_BYTE_CAP } from "./rebuild/site";
import { collectRebuildGaps, fetchRebuildGaps } from "./rebuild/gaps";
import { selectStore, selectRunLeaseStore } from "./storage";
import { enqueueRun, runSlotTtlMs } from "./access";
import { continueRun, isWorkersRuntime, runInBackground } from "./jobs";
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

type StartedExperiment = { experiment: Experiment; created: boolean; via: "idempotency" | "site" | "new" };

/** Fewer same-origin links than this on the seed page triggers one Firecrawl /v1/map expansion. */
const MIN_SEED_LINKS = 3;

/** Per-slice wall-clock budget for a background run step — Workers waitUntil windows die silently around ~30s, so slices stay comfortably under that. */
function stepBudgetMs(): number {
  const v = Number(process.env.REHEARSAL_STEP_BUDGET_MS);
  return Number.isFinite(v) && v >= 1_000 ? v : 20_000;
}

/** A run with no activity for this long is treated as stalled and can be resumed via `resume()` (or any poll). */
function stallMs(): number {
  const v = Number(process.env.REHEARSAL_STALL_MS);
  return Number.isFinite(v) && v >= 1_000 ? v : 180_000;
}

/** Slices a single stage may consume before it fails with STAGE_TIMEOUT — caps retry loops on stages that cannot finish in one step. */
const MAX_STAGE_SLICES = 10;

/**
 * Discover checkpoint cadence: the crawl state is saved after this many
 * crawled pages, or once this much time has passed since the last save,
 * whichever comes first. A slice killed mid-crawl loses at most that much
 * work; a step-budget suspend always saves.
 */
export const DISCOVER_CHECKPOINT_PAGES = 5;
export const DISCOVER_CHECKPOINT_MS = 10_000;

/** Statuses a chunked run can be sitting in when the runtime kills it mid-flight. */
const IN_FLIGHT_STATUSES: readonly string[] = [
  "queued",
  "discovering",
  "simulating",
  "verifying",
  "analyzing",
  "comparing",
  "rebuilding",
];

/** Status -> the pipeline stage a stale run resumes at when no checkpoint survived. */
const STATUS_STAGE: Record<string, string> = {
  discovering: "discover",
  simulating: "simulate",
  verifying: "verify",
  analyzing: "analyze",
  comparing: "compare",
  rebuilding: "rebuild",
};

function pipelineFinished(exp: Experiment): boolean {
  return !!exp.spec && (exp.status === "complete" || exp.status === "rebuilding" || rebuildPending(exp));
}

/**
 * Whether a poll should run the resume watchdog. False when nothing could be
 * in flight — the resume path costs ~3 extra store reads per poll, so finished
 * and never-started experiments skip it. A surviving checkpoint still triggers
 * it (resume clears stale ones).
 */
export function runNeedsWatchdog(exp: Experiment): boolean {
  return exp.runCheckpoint !== undefined || IN_FLIGHT_STATUSES.includes(exp.status) || rebuildPending(exp);
}

interface OrchestratorDeps {
  fetcher?: PageFetcher;
  /** Plain-HTTP probe fetcher for rescan/signature checks and the default discover crawl — must never be provider-quota-bound. Defaults to PlainFetcher. */
  probeFetcher?: PageFetcher;
  /** Hosted render/map fallback for JS-dependent pages in discover (no-ops without FIRECRAWL_API_KEY). Defaults to FirecrawlClient. */
  firecrawl?: FirecrawlClientPort;
  jev?: JevClient;
  llm?: LlmClient;
  store?: ExperimentStore;
  leases?: RunLeaseStore;
  runner?: BrowserRunner;
}

/** Thrown when a stage is requested while another run of the same experiment is in progress. */
export class StageInProgressError extends Error {
  constructor(
    readonly experimentId: string,
    readonly runningStage: string,
  ) {
    super(`Experiment ${experimentId} already has a ${runningStage === "run" ? "full" : runningStage} run in progress`);
    this.name = "StageInProgressError";
  }
}

/** Runner errors that mean "no browser this run": verify and compare degrade instead of failing the run. */
const BROWSER_SKIP_CODES: ReadonlySet<string> = new Set(["BROWSER_UNAVAILABLE", "PROVIDER_QUOTA"]);

function browserSkipped(e: Experiment): boolean {
  return e.failures.some((f) => f.stage === "verify" && BROWSER_SKIP_CODES.has(f.code));
}

function isCrawlableLink(href: string | undefined, origin: string): boolean {
  if (!isSameOrigin(href, origin)) return false;
  const pathname = new URL(href!).pathname.replace(/%2e/gi, ".");
  if (pathname.startsWith("/cdn-cgi/")) return false;
  return !/\.(?:md|mdx|markdown|txt|json|jsonl|csv|tsv|xml|ya?ml|pdf|docx?|xlsx?|pptx?|rtf|png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?|mp[34]|webm|ogg|wav|zip|gz|tar|7z|woff2?|ttf|otf|css|[cm]?js)$/i.test(pathname);
}

export class Orchestrator {
  /** Experiment id -> stage currently running. One run per experiment at a time. */
  private running = new Map<string, { stage: string; acquiredAt: number }>();
  private fetcher: PageFetcher;
  private probeFetcher: PageFetcher;
  private firecrawl: FirecrawlClientPort;
  private jev: JevClient;
  private llm: LlmClient;
  private store: ExperimentStore;
  private runner: BrowserRunner;
  private leases: RunLeaseStore;

  constructor(deps: OrchestratorDeps = {}) {
    this.fetcher = deps.fetcher ?? selectFetcher();
    this.probeFetcher = deps.probeFetcher ?? new PlainFetcher();
    this.firecrawl = deps.firecrawl ?? new FirecrawlClient();
    this.jev = deps.jev ?? selectJev();
    this.llm = deps.llm ?? selectLlm();
    this.store = deps.store ?? selectStore();
    this.leases = deps.leases ?? selectRunLeaseStore();
    this.runner = deps.runner ?? selectRunner();
  }

  /**
   * Create an experiment. `goal` is optional: when omitted, a cheap first-page
   * probe (one HTML fetch through the keyless fetcher) derives the goal and a
   * small set of visitor personas from the site's own CTAs, nav and endpoints.
   * The probe never blocks creation — on failure the goal falls back to a
   * generic "Learn what {host} offers" and discovery still runs.
   */
  async createExperiment(
    targetUrl: string,
    goal?: string,
    config?: Partial<ExperimentConfig>,
    opts?: { idempotencyKey?: string },
  ): Promise<Experiment> {
    const url = await this.publicTarget(targetUrl);
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
      siteKey: normalizeSiteUrl(url.toString()),
      idempotencyKey: opts?.idempotencyKey,
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
        headings: page.headings,
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

  /** Stored dedupe key — new records carry `siteKey`; older ones normalize `targetUrl` on the fly. */
  private siteKeyOf(e: Experiment): string {
    return e.siteKey || normalizeSiteUrl(e.targetUrl);
  }

  /**
   * The stored experiment an idempotency key or `targetUrl`'s normalized site key
   * already maps to, from one store scan. The key wins and is checked before the
   * URL guard, so a repeat key returns its record without re-resolving the host.
   */
  private async findExisting(
    targetUrl: string,
    idempotencyKey?: string,
  ): Promise<{ experiment: Experiment; via: "idempotency" | "site" } | null> {
    const all = await this.store.list();
    const keyHit = idempotencyKey ? all.find((e) => e.idempotencyKey === idempotencyKey) : undefined;
    if (keyHit) return { experiment: keyHit, via: "idempotency" };
    const siteKey = normalizeSiteUrl((await this.publicTarget(targetUrl)).toString());
    const siteHit = all.find((e) => this.siteKeyOf(e) === siteKey);
    return siteHit ? { experiment: siteHit, via: "site" } : null;
  }

  /** `assertPublicUrl` for a submitted target: a rejection is rethrown as `InvalidTargetError`. */
  private async publicTarget(raw: string): Promise<URL> {
    try {
      return await assertPublicUrl(raw);
    } catch (e) {
      throw new InvalidTargetError(e);
    }
  }

  /** Serializes dedupe+create so two concurrent POSTs can't both pass the dedupe scan. */
  private createQueue: Promise<void> = Promise.resolve();

  /**
   * Dedupe + create, atomic under `createQueue`. A matching `idempotencyKey` or a
   * matching normalized site returns the existing record instead of a new one.
   * `admit` runs only when a new record would be created (dedupe hits never spend
   * it); when it answers false nothing is created and the result is null.
   */
  async startExperiment(
    targetUrl: string,
    goal?: string,
    config?: Partial<ExperimentConfig>,
    opts?: { idempotencyKey?: string },
  ): Promise<StartedExperiment>;
  async startExperiment(
    targetUrl: string,
    goal: string | undefined,
    config: Partial<ExperimentConfig> | undefined,
    opts: { idempotencyKey?: string; admit: () => Promise<boolean> },
  ): Promise<StartedExperiment | null>;
  async startExperiment(
    targetUrl: string,
    goal?: string,
    config?: Partial<ExperimentConfig>,
    opts?: { idempotencyKey?: string; admit?: () => Promise<boolean> },
  ): Promise<StartedExperiment | null> {
    const run = this.createQueue.then(async (): Promise<StartedExperiment | null> => {
      const existing = await this.findExisting(targetUrl, opts?.idempotencyKey);
      if (existing) return { ...existing, created: false };
      if (opts?.admit && !(await opts.admit())) return null;
      const experiment = await this.createExperiment(targetUrl, goal, config, { idempotencyKey: opts?.idempotencyKey });
      return { experiment, created: true, via: "new" };
    });
    this.createQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Fire-and-forget the full pipeline: mark queued, then kick `runPipeline` as a
   * background job that outlives the request (ctx.waitUntil on Workers). The job
   * waits for a pipeline slot and for any in-flight run, and marks the
   * experiment failed on an unhandled stage error — nothing spins forever.
   */
  async scheduleRun(id: string, opts?: { skipDiscover?: boolean; origin?: string }): Promise<Experiment> {
    const exp = await this.mustGet(id);
    exp.runToken = randomUUID();
    exp.runOrigin = opts?.origin ?? exp.runOrigin;
    exp.runCheckpoint = { stage: opts?.skipDiscover ? "simulate" : "discover", attempt: 0 };
    await this.update(exp, "queued");
    await this.emit(id, "run", "info", "Run queued — the pipeline continues in the background");
    const work = async (): Promise<void> => {
      try {
        await this.exclusiveWhenFree(id, "run", () => enqueueRun(() => this.stepBody(id, { origin: opts?.origin })));
      } catch (e) {
        await this.markFailed(id, e).catch(() => undefined);
      }
    };
    await runInBackground(work);
    return exp;
  }

  /**
   * Resume a stalled background run — nothing to do when the run is finished or
   * still producing activity inside the stall window. Safe to call from any
   * poll: it is the watchdog that covers a dropped continuation hop.
   */
  async resume(id: string, opts?: { origin?: string; inline?: boolean }): Promise<{ experiment: Experiment; resumed: boolean }> {
    const exp = await this.mustGet(id);
    if (this.activeRun(id) || await this.leases.activeLock(id, Date.now())) return { experiment: exp, resumed: false };
    const pendingRebuild = exp.status === "rebuilding" || rebuildPending(exp);
    if (!pendingRebuild && pipelineFinished(exp) && exp.runCheckpoint && exp.runCheckpoint.stage !== "rebuild") {
      exp.runCheckpoint = undefined;
      await this.store.save(Experiment.parse(exp));
      return { experiment: exp, resumed: false };
    }
    const inFlight = pendingRebuild || IN_FLIGHT_STATUSES.includes(exp.status) || exp.runCheckpoint !== undefined;
    if (!inFlight) return { experiment: exp, resumed: false };
    if (Date.now() - (await this.lastBeat(id, exp)) < stallMs()) {
      return { experiment: exp, resumed: false };
    }
    if (pendingRebuild && exp.runCheckpoint?.stage !== "rebuild") {
      exp.runCheckpoint = { stage: "rebuild", attempt: 0 };
      await this.store.save(Experiment.parse(exp));
    }
    // Runs queued before per-run tokens existed can't authorize their own
    // continuation hop (run-step answers 401) — give them one on resume.
    if (!exp.runToken) {
      exp.runToken = randomUUID();
      exp.runOrigin ??= opts?.origin;
      await this.store.save(Experiment.parse(exp));
    }
    await this.emit(id, "run", "info", "Run stalled — resuming from the last checkpoint");
    const work = async (): Promise<void> => {
      try {
        await this.exclusiveWhenFree(id, "run", () => enqueueRun(() => this.stepBody(id, { origin: opts?.origin })));
      } catch (e) {
        await this.markFailed(id, e).catch(() => undefined);
      }
    };
    // `inline` callers are already inside a background task (a GET's waitUntil):
    // the slice and its continuation hop must run in that task, not a nested one.
    if (opts?.inline) await work();
    else await runInBackground(work);
    return { experiment: exp, resumed: true };
  }

  /** One bounded slice of the pipeline under the run lock; self-continues on Workers when the slice suspended. */
  async runStep(
    id: string,
    opts?: { origin?: string; deadlineMs?: number; now?: () => number },
  ): Promise<Experiment> {
    return this.exclusive(id, "run", async () => {
      const { suspended } = await this.sliceRun(id, {
        ...opts,
        deadlineMs: opts?.deadlineMs ?? (isWorkersRuntime() ? stepBudgetMs() : undefined),
      });
      if (suspended && isWorkersRuntime()) {
        const exp = await this.mustGet(id);
        await continueRun(id, { origin: exp.runOrigin ?? opts?.origin, token: exp.runToken });
      }
      return this.mustGet(id);
    });
  }

  /** Queued next-slice for the run-step route: waits for the in-flight slice to release the run lock — a same-isolate continuation can land while the caller still holds it. */
  async runContinuation(id: string, opts?: { origin?: string }): Promise<void> {
    await this.exclusiveWhenFree(id, "run", () => this.stepBody(id, opts));
  }

  /** Runs slices to completion: in-process loop on Node; one slice per run-step hop on Workers. Callers hold the lock. */
  private async stepBody(id: string, opts?: { origin?: string }): Promise<void> {
    const deadlineMs = isWorkersRuntime() ? stepBudgetMs() : undefined;
    for (;;) {
      const { suspended } = await this.sliceRun(id, { ...opts, deadlineMs });
      if (!suspended) return;
      if (isWorkersRuntime()) {
        const exp = await this.mustGet(id);
        await continueRun(id, { origin: exp.runOrigin ?? opts?.origin, token: exp.runToken });
        return;
      }
    }
  }

  /**
   * Sequential stage chain resuming at the persisted `runCheckpoint`. Each
   * slice writes an entry checkpoint ({stage, attempt+1}) before running; a
   * stage that suspends keeps the checkpoint, a killed slice is re-entered at
   * attempt+1 — after MAX_STAGE_SLICES the run fails with STAGE_TIMEOUT
   * instead of looping forever.
   */
  private async sliceRun(
    id: string,
    opts?: { deadlineMs?: number; origin?: string; now?: () => number },
  ): Promise<{ suspended: boolean }> {
    const exp = await this.mustGet(id);
    const cp = exp.runCheckpoint;
    if (pipelineFinished(exp) && cp && cp.stage !== "rebuild") {
      exp.runCheckpoint = undefined;
      await this.store.save(Experiment.parse(exp));
      return { suspended: false };
    }
    const stageFns: Record<string, (deadline?: number, resume?: DiscoverCheckpoint, attempt?: number) => Promise<unknown>> = {
      discover: (d, r, a) => this.runDiscover(id, { deadline: d, now: opts?.now, resume: r, attempt: a }),
      simulate: () => this.runSimulate(id),
      verify: () => this.runVerify(id),
      analyze: () => this.runAnalyze(id),
      compare: () => this.runCompare(id),
      spec: () => this.runSpec(id),
      rebuild: async (deadline) => {
        do {
          await this.runRebuild(id);
          if (!rebuildPending(await this.mustGet(id))) return { complete: true };
        } while (deadline === undefined || (opts?.now ?? Date.now)() < deadline);
        return { complete: false };
      },
    };
    const startAt = cp && (PIPELINE_STAGES as readonly string[]).includes(cp.stage)
      ? cp.stage
      : STATUS_STAGE[exp.status] ?? "discover";
    // Rebuild is opt-in (one more LLM call per goal set): a run stops at spec unless it is resuming a rebuild already asked for.
    const order = PIPELINE_STAGES.slice(PIPELINE_STAGES.indexOf(startAt as (typeof PIPELINE_STAGES)[number]))
      .filter((s) => s !== "rebuild" || startAt === "rebuild");
    const now = opts?.now ?? Date.now;
    const deadline = opts?.deadlineMs !== undefined ? now() + opts.deadlineMs : undefined;
    const persist = async (checkpoint: RunCheckpoint) => {
      const latest = await this.mustGet(id);
      latest.runCheckpoint = checkpoint;
      await this.store.save(Experiment.parse(latest));
    };
    for (const stage of order) {
      const carryDiscover = stage === "discover" && cp?.stage === "discover" ? cp.discover : undefined;
      if (deadline !== undefined && now() >= deadline) {
        await persist({ stage, attempt: cp?.stage === stage ? cp.attempt : 0, discover: carryDiscover });
        await this.emit(id, "run", "info", `Step budget reached — run continues in the background (next: ${stage})`);
        return { suspended: true };
      }
      const attempt = (cp?.stage === stage ? cp.attempt : 0) + 1;
      if (attempt > MAX_STAGE_SLICES) {
        throw new RehearsalError(
          "STAGE_TIMEOUT",
          `Stage ${stage} did not finish within ${MAX_STAGE_SLICES} run steps — the runtime's step budget is too small for it`,
        );
      }
      await persist({ stage, attempt, discover: carryDiscover });
      const result = (await stageFns[stage](
        deadline,
        carryDiscover,
        stage === "discover" ? attempt : undefined,
      )) as { complete?: boolean } | undefined;
      // A stage that suspended mid-flight owns the checkpoint — don't overwrite it.
      if (result?.complete === false) return { suspended: true };
    }
    const done = await this.mustGet(id);
    done.runCheckpoint = undefined;
    await this.store.save(Experiment.parse(done));
    return { suspended: false };
  }

  /** Timestamp of the most recent activity event — the run heartbeat. Falls back to createdAt. */
  private async lastBeat(id: string, exp: Experiment): Promise<number> {
    try {
      const feed = await this.store.activity(id, 1);
      const last = feed[feed.length - 1]?.ts;
      return Date.parse(last ?? exp.createdAt);
    } catch {
      return Date.parse(exp.createdAt);
    }
  }

  /**
   * Re-check the site against the signatures discover stored, via the plain
   * fetcher (no browser budget): fetch each known URL, extract, and compare
   * `contentSignatureFor`. A changed page or a page that no longer loads counts
   * as a change; a probe failure on the seed alone does not. When content
   * changed the derived artifacts reset and the caller kicks a full re-run; a
   * new `goal` regenerates them on the kept graph (discover skipped).
   */
  async rescan(id: string, opts?: { goal?: string }): Promise<{ experiment: Experiment; report: RescanReport }> {
    return this.exclusive(id, "rescan", async () => {
      const exp = await this.mustGet(id);
      if (exp.runCheckpoint !== undefined) {
        if (Date.now() - (await this.lastBeat(id, exp)) < stallMs()) {
          throw new StageInProgressError(id, "run");
        }
        // Stale run: the continuation died with no watchdog catch — let rescan proceed and scheduleRun restart it.
      }
      const goal = opts?.goal?.trim() || undefined;
      const goalChanged = Boolean(goal && goal !== exp.goal);
      const stored = new Map((exp.siteSignatures ?? []).map((s) => [s.url, s]));
      const probes = [exp.targetUrl, ...[...stored.values()].map((s) => s.url)].filter(
        (u, i, a) => a.indexOf(u) === i,
      );
      const mismatches: string[] = [];
      let checked = 0;
      let note: string | undefined;
      for (const url of probes) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(new Error("rescan probe timed out")), PROBE_TIMEOUT_MS);
        try {
          const html = await Promise.race([
            this.probeFetcher.fetchHtml(url, { signal: ctrl.signal }),
            new Promise<never>((_, reject) =>
              ctrl.signal.addEventListener("abort", () => reject(ctrl.signal.reason), { once: true }),
            ),
          ]);
          const page = extractPage(html, url);
          const signature = contentSignatureFor(url, page);
          const old = stored.get(url);
          checked++;
          if (!old || old.signature !== signature) mismatches.push(url);
        } catch {
          if (normalizeSiteUrl(url) === normalizeSiteUrl(exp.targetUrl)) {
            note = `couldn't reach ${pagePath(url)} — nothing refreshed`;
          } else {
            mismatches.push(url); // a page that no longer loads is a change
          }
        } finally {
          clearTimeout(timer);
        }
      }
      const changed = stored.size === 0 || mismatches.length > 0;
      if (!changed && !goalChanged) {
        await this.emit(id, "rescan", "info", `Rescan: ${checked} page(s) unchanged — no re-run${note ? ` (${note})` : ""}`);
        return {
          experiment: exp,
          report: { changed: false, checked, mismatches, goalChanged: false, restarted: false, ...(note ? { note } : {}) },
        };
      }
      if (goalChanged) {
        exp.goal = goal!;
        exp.goalSource = "user";
        exp.personas = [];
      }
      if (changed) {
        exp.graph = undefined;
        exp.siteSignatures = [];
      }
      // Goal-derived artifacts regenerate either way; `siteSignatures` stays only
      // when content matched so rescan keeps a baseline to compare against.
      exp.intents = undefined;
      exp.endpoints = undefined;
      exp.journeys = undefined;
      exp.questions = undefined;
      exp.assertions = [];
      exp.simulations = [];
      exp.swarm = undefined;
      exp.browserTests = [];
      exp.findings = [];
      exp.variants = [];
      exp.comparisons = [];
      exp.spec = undefined;
      exp.mockup = undefined;
      exp.rebuild = undefined;
      exp.usage = undefined;
      exp.errors = [];
      exp.failures = [];
      await this.update(exp, "queued");
      await this.emit(
        id,
        "rescan",
        "info",
        changed
          ? `Rescan: ${mismatches.length}/${checked} probed page(s) changed — re-running the pipeline`
          : `Goal updated to "${exp.goal}" — regenerating results (site unchanged)`,
      );
      return {
        experiment: exp,
        report: { changed, checked, mismatches, goalChanged, restarted: true, ...(note ? { note } : {}) },
      };
    });
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
    return this.exclusive(id, "discover", async () => {
      const cp = (await this.mustGet(id)).runCheckpoint;
      await this.runDiscover(id, cp?.stage === "discover" ? { resume: cp.discover, attempt: cp.attempt } : undefined);
      return this.mustGet(id);
    });
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

  /** A standalone rebuild gets a fresh call budget: the per-run budget resets only at discover, so a finished run has spent it. */
  async rebuild(id: string, opts?: { restart?: boolean; resumeLegacy?: boolean }): Promise<Experiment> {
    return this.exclusive(id, "rebuild", async () => {
      if (opts?.resumeLegacy && !opts.restart) {
        const exp = await this.mustGet(id);
        const site = exp.rebuild?.site;
        if (site?.completedAt) {
          site.gap = collectRebuildGaps(exp);
          if (!site.gap.completed) {
            delete site.completedAt;
            exp.status = "rebuilding";
            exp.runCheckpoint = { stage: "rebuild", attempt: 0 };
          }
          await this.store.save(Experiment.parse(exp));
        }
      }
      return this.runRebuild(id, opts);
    });
  }

  /** Stage 1 — discover states, build graph. */
  /**
   * Resumable discover: persists a `runCheckpoint` every few crawled pages so a
   * suspended step (Workers waitUntil window) or a crashed process resumes the
   * frontier instead of restarting the crawl. `deadline` is a wall-clock point
   * (`now()`) at which the stage must checkpoint and suspend; `resume` replays
   * a saved crawl state through GraphBuilder.restore.
   */
  private async runDiscover(
    id: string,
    opts?: { deadline?: number; now?: () => number; resume?: DiscoverCheckpoint; attempt?: number },
  ): Promise<{ complete: boolean }> {
    const experiment = await this.mustGet(id);
    this.llm.resetBudget?.({ experimentId: id });
    this.jev.resetBudget?.({ experimentId: id });
    await this.update(experiment, "discovering");
    return withTrace("discover", { experimentId: id, targetUrl: experiment.targetUrl }, async () => {
      const config = experiment.configuration;
      const resumeData = opts?.resume;
      const builder = resumeData
        ? GraphBuilder.restore({ states: resumeData.states, edges: resumeData.edges }, config.maxStates, config.maxDepth)
        : new GraphBuilder(config.maxStates, config.maxDepth);
      const pageFailures: RunFailure[] = resumeData?.pageFailures ? [...resumeData.pageFailures] : [];
      const attempt = opts?.attempt ?? 0;
      const now = opts?.now ?? Date.now;
      const expired = () => opts?.deadline !== undefined && now() >= opts.deadline;
      let pagesSinceSave = 0;
      let lastSaveAt = now();
      /** Write the crawl state so a suspended step or dropped hop resumes where it left off. */
      const persist = async (discover: DiscoverCheckpoint) => {
        const latest = await this.mustGet(id);
        latest.runCheckpoint = { stage: "discover", attempt, discover };
        await this.store.save(Experiment.parse(latest));
        pagesSinceSave = 0;
        lastSaveAt = now();
      };
      const snapshot = async (parts: {
        vpIndex: number;
        passStart?: number;
        frontier: { url: string; depth: number; from?: { stateId: string; actionId: string } }[];
        attempted: Set<string>;
        visited: Map<string, string>;
        signaturePending?: string[];
        signatureDone?: { url: string; signature: string }[];
      }) => {
        const built = builder.build();
        await persist({
          vpIndex: parts.vpIndex,
          passStart: parts.passStart,
          frontier: parts.frontier,
          attempted: [...parts.attempted],
          visited: [...parts.visited],
          states: built.states,
          edges: built.edges,
          pageFailures,
          providerQuotaHit,
          remoteTimedOut,
          signaturePending: parts.signaturePending,
          signatureDone: parts.signatureDone ?? [],
          seedExtras: [...seedExtras],
          mapExpanded,
        });
      };
      /** Save + emit + report suspension in one place. */
      const suspend = async (parts: Parameters<typeof snapshot>[0]) => {
        await snapshot(parts);
        await this.emit(id, "discover", "info", "Step budget reached mid-crawl — resuming on the next run step");
        return { complete: false };
      };
      // REHEARSAL_BROWSER opts the crawl into the browser runner (screenshots/metrics);
      // the default is plain fetch → Firecrawl rescue for JS-bound pages.
      const browserCrawl = (process.env.REHEARSAL_BROWSER ?? "auto") !== "auto";
      const crawler = browserCrawl
        ? this.runner.name
        : `${this.probeFetcher.name}${this.firecrawl.available ? ` + ${this.firecrawl.name}` : ""}`;
      logEvent({ experimentId: id, stage: "discover", kind: "browser-runner", data: { runner: crawler } });
      await this.emit(id, "discover", "info", `Mapping ${experiment.targetUrl} with ${crawler}`);
      if (!(await robotsAllows(new URL(experiment.targetUrl)))) {
        await this.emit(id, "discover", "error", "Blocked by robots.txt", experiment.targetUrl);
        throw new RehearsalError("ROBOTS_DISALLOWED", `Target path disallowed by robots.txt: ${experiment.targetUrl}`, experiment.targetUrl);
      }

      // Once the browser runner is out of provider quota, or its hosted backend
      // timed out, the crawl continues on the plain fetcher — pages lose
      // screenshots/metrics but still map.
      let providerQuotaHit = resumeData?.providerQuotaHit ?? false;
      let remoteTimedOut = resumeData?.remoteTimedOut ?? false;
      // Firecrawl /v1/map runs once per run, on the seed, when it exposes few links.
      let mapExpanded = resumeData?.mapExpanded ?? false;
      const seedExtras: string[] = resumeData?.seedExtras ? [...resumeData.seedExtras] : [];
      // Plain-fetch html doesn't vary by viewport, so each URL is fetched once per
      // run: later viewports and the signature pass reuse it (each fetch pays politeDelay).
      // Keyed by the exact URL: `/docs` and `/docs/` may serve different pages.
      const probedHtml = new Map<string, string>();
      const probeHtml = async (url: string) => {
        const cached = probedHtml.get(url);
        if (cached !== undefined) return cached;
        const html = await this.probeFetcher.fetchHtml(url);
        probedHtml.set(url, html);
        return html;
      };
      try {
        if (!resumeData?.signaturePending) {
        for (let vi = resumeData?.vpIndex ?? 0; vi < config.viewports.length; vi++) {
          const vpName = config.viewports[vi];
          const viewport = VIEWPORTS[vpName];
          const openPage = async (url: string, depth: number) => {
            if (browserCrawl) {
              if (providerQuotaHit || remoteTimedOut) return { html: await probeHtml(url) };
              try {
                return await this.runner.openPage(url, viewport, {
                  shotName: `${id}_${vpName}_d${depth}`,
                  scope: id,
                });
              } catch (e) {
                if (classifyError(e) === "PROVIDER_QUOTA") providerQuotaHit = true;
                else if (e instanceof RemoteTimeoutError) remoteTimedOut = true;
                else throw e;
                const reason = providerQuotaHit ? "is out of provider quota" : `timed out (${errorText(e, 120)})`;
                await this.emit(
                  id,
                  "discover",
                  "info",
                  `${this.runner.name} ${reason} — continuing with ${this.probeFetcher.name} (no screenshots)`,
                );
                return { html: await probeHtml(url) };
              }
            }
            // Default crawl: plain fetch; Firecrawl rescues pages that need a renderer.
            const isShell = (html: string) => looksLikeJsShell(html, extractPage(html, url));
            let plainFailure: string;
            try {
              const html = await probeHtml(url);
              if (!isShell(html)) return { html };
              plainFailure = "returned a JS app shell";
            } catch (e) {
              // Structural failures (robots, egress, off-origin redirect, non-HTML) are
              // not renderer problems — a hosted scrape must not bypass them.
              const code = classifyError(e);
              if (code === "ROBOTS_DISALLOWED" || code === "EGRESS_BLOCKED" || code === "REDIRECT_OFF_ORIGIN" || code === "NON_HTML") throw e;
              plainFailure = `failed (${errorText(e, 120)})`;
            }
            if (!this.firecrawl.available) {
              throw new Error(`${this.probeFetcher.name} ${plainFailure}; no hosted fallback configured (set FIRECRAWL_API_KEY, or REHEARSAL_BROWSER for a browser crawl)`);
            }
            await this.emit(id, "discover", "fetch", `${pagePath(url)} looks JS-rendered — retrying with ${this.firecrawl.name}`, url);
            const scraped = await this.firecrawl.scrape(url);
            if (scraped?.html && !isShell(scraped.html)) return { html: scraped.html };
            throw new Error(
              `${this.probeFetcher.name} ${plainFailure}; ${this.firecrawl.name} ${scraped?.html ? "still saw a JS shell" : "returned nothing"}`,
            );
          };
          const resumingVp = vi === resumeData?.vpIndex;
          // Reserve a fair share of the remaining page budget for each later
          // pass: without a per-viewport cap the first pass can spend the whole
          // maxStates budget and later viewports never crawl. `passStart` is
          // persisted so a suspended pass keeps the same budget on resume.
          const passStart = resumingVp && resumeData.passStart !== undefined ? resumeData.passStart : builder.size;
          const passBudget = Math.ceil((config.maxStates - passStart) / (config.viewports.length - vi));
          const passFull = () => builder.size - passStart >= passBudget;
          const frontier: { url: string; depth: number; from?: { stateId: string; actionId: string } }[] =
            resumingVp ? resumeData.frontier.map((f) => ({ ...f })) : [{ url: experiment.targetUrl, depth: 0 }, ...seedExtras.map((url) => ({ url, depth: 1 }))];
          const visited = new Map<string, string>(resumingVp ? resumeData.visited : []); // url -> canonical stateId
          const attempted = new Set<string>(resumingVp ? resumeData.attempted : []);
          while (frontier.length > 0) {
            if (expired()) return suspend({ vpIndex: vi, passStart, frontier, attempted, visited });
            const { url, depth, from } = frontier.shift()!;
            if (visited.has(url)) {
              if (from) builder.link(from.stateId, from.actionId, visited.get(url)!);
              continue;
            }
            if (attempted.has(url) || depth > config.maxDepth || passFull()) continue;
            attempted.add(url);
            await this.emit(id, "discover", "fetch", `Fetching ${url}`, url);
            try {
              const { html, screenshotPath, metrics, brand } = await openPage(url, depth);
              const extracted = extractPage(html, url);
              const state = makeState({
                url,
                viewport,
                title: extracted.title,
                visibleText: extracted.visibleText,
                headings: extracted.headings,
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
                  .filter((a) => a.type === "click" && isCrawlableLink(a.href, origin))
                  .sort((a, b) => relevant(b.label, b.href!) - relevant(a.label, a.href!));
                for (const a of links) {
                  frontier.push({ url: a.href!, depth: depth + 1, from: { stateId: canonical.stateId, actionId: a.actionId } });
                }
                // Seed page with few crawlable links: ask Firecrawl /v1/map for the
                // site's URL list once per run, capped by config.firecrawlMapLimit.
                if (depth === 0 && !mapExpanded) {
                  mapExpanded = true;
                  if (links.length < MIN_SEED_LINKS && this.firecrawl.available) {
                    const seen = new Set([...visited.keys(), ...attempted, ...frontier.map((f) => f.url)]);
                    const extra = (await this.firecrawl.mapLinks(experiment.targetUrl, config.firecrawlMapLimit))
                      .filter((u) => isCrawlableLink(u, origin) && !seen.has(u))
                      .slice(0, config.firecrawlMapLimit);
                    if (extra.length > 0) {
                      seedExtras.push(...extra);
                      await this.emit(
                        id,
                        "discover",
                        "map",
                        `Seed exposed ${links.length} links — ${this.firecrawl.name} map added ${extra.length} URLs`,
                        experiment.targetUrl,
                      );
                      for (const u of extra) frontier.push({ url: u, depth: depth + 1 });
                    }
                  }
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
            // Batched durable checkpoint — a kill mid-crawl resumes the frontier, redoing at most one batch.
            pagesSinceSave += 1;
            if (pagesSinceSave >= DISCOVER_CHECKPOINT_PAGES || now() - lastSaveAt >= DISCOVER_CHECKPOINT_MS) {
              await snapshot({ vpIndex: vi, passStart, frontier, attempted, visited });
            }
          }
        }
        }
      } finally {
        await this.runner.releaseCaptures?.(id);
      }
      experiment.graph = builder.build();
      experiment.failures = [...experiment.failures.filter((f) => f.stage !== "discover"), ...pageFailures];
      const signatures = new Map<string, { url: string; signature: string }>();
      const resumeDone = resumeData?.signatureDone ?? [];
      for (const s of resumeDone) signatures.set(s.url, s);
      const pendingUrls = resumeData?.signaturePending ?? experiment.graph.states.map((s) => s.url);
      const statesByUrl = new Map(experiment.graph.states.map((s) => [s.url, s]));
      for (const url of pendingUrls) {
        if (signatures.has(url)) continue;
        if (expired()) {
          return suspend({
            vpIndex: config.viewports.length,
            frontier: [],
            attempted: new Set(),
            visited: new Map(),
            signaturePending: pendingUrls.slice(pendingUrls.indexOf(url)),
            signatureDone: [...signatures.values()],
          });
        }
        const s = statesByUrl.get(url);
        // Signatures must match what rescan re-probes: derive them from the
        // plain-fetch decode path (UTF-8), not the crawl html a browser may
        // have decoded differently (windows-1252 fallback for undeclared
        // charsets). On probe failure, fall back to the crawled extraction.
        let page: { title: string; visibleText: string; actions: { label: string; role?: string; href?: string }[] } = {
          title: s?.pageTitle ?? "",
          visibleText: s?.visibleText ?? "",
          actions: s?.actions ?? [],
        };
        try {
          page = extractPage(await probeHtml(url), url);
        } catch {
          // keep the crawl-extracted signature
        }
        signatures.set(url, { url, signature: contentSignatureFor(url, page) });
      }
      experiment.siteSignatures = [...signatures.values()];
      if (experiment.graph.states.length === 0) {
        // Keep the per-page failures before markFailed reloads the stored experiment.
        await this.update(experiment, "discovering");
        const code = dominantCode(pageFailures);
        const sample = pageFailures.find((f) => f.code === code);
        const cause = sample ? ` Most common cause: ${formatFailure(sample)}` : "";
        if (code === "PROVIDER_QUOTA") {
          throw new RehearsalError(
            "PROVIDER_QUOTA",
            `Discovery stopped: ${browserCrawl ? this.runner.name : crawler} is out of provider quota${providerQuotaHit ? ` and ${this.probeFetcher.name} could not cover` : ""}.${cause}`,
            experiment.targetUrl,
          );
        }
        throw new RehearsalError(
          "DISCOVERY_EMPTY",
          `Discovery captured no states: ${pageFailures.length} of ${pageFailures.length} page loads failed with ${providerQuotaHit || remoteTimedOut ? this.probeFetcher.name : crawler}.${cause}`,
          experiment.targetUrl,
        );
      }
      await this.emit(
        id, "discover", "info",
        `Map complete: ${experiment.graph.states.length} states · ${experiment.graph.edges.length} links`,
      );
      await this.mapIntents(experiment);
      experiment.runCheckpoint = undefined;
      await this.update(experiment, "created");
      return { complete: true };
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
      const goalAssertions = [...exp.assertions, ...endpointGoalAssertions(exp.graph, exp.intents?.[0], exp.endpoints)];

      if (typeof this.runner.runPersonaJourney === "function") {
        // Emergent journeys: bounded persona swarm navigating the real site.
        await this.emit(
          id,
          "simulate",
          "info",
          `Swarming ${config.maxAgents} persona agents over ${exp.targetUrl} (≤${config.maxStepsPerAgent} steps each, ${config.maxConcurrentAgents} concurrent)`,
        );
        exp.swarm = await runPersonaSwarm({
          runner: this.runner,
          url: exp.targetUrl,
          goal: exp.goal,
          assertions: goalAssertions,
          endpoints: exp.endpoints,
          intents: exp.intents,
          config,
          viewport: VIEWPORTS[config.viewports[0]],
          jev: this.jev,
        });
        exp.simulations = journeysToTrajectories(exp.swarm, graph);
        const reached = exp.swarm.journeys.filter((j) => j.outcome === "goal-reached").length;
        const dropped = exp.swarm.journeys.length - reached;
        const dist = Object.entries(exp.swarm.dropOffDistribution)
          .map(([reason, n]) => `${reason}×${n}`)
          .join(", ");
        await this.emit(
          id,
          "simulate",
          "decide",
          `Swarm settled: ${reached} agents reached the goal, ${dropped} dropped off${dist ? ` (${dist})` : ""}`,
        );
      } else {
        // Fallback for runners without journey support: Jev-scored seeded sampling.
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
          assertions: goalAssertions,
          seed: config.seed,
          count: config.trajectories,
          maxDepth: config.maxDepth,
        });
        const reached = exp.simulations.filter((t) => t.outcome === "goal-reached").length;
        await this.emit(id, "simulate", "info", `Simulated ${exp.simulations.length} journeys — ${reached} reached the goal`);
      }
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
      interface Replayable {
        id: string;
        actions: { actionId?: string; label: string; href?: string; role?: string }[];
      }
      // Journey actions carry synthetic act_N ids — resolve to the graph actionId
      // matching label/role/href on the same state so recorded runs resolve in compare.
      const actionIdByKey = new Map(
        graph.states.flatMap((st) =>
          st.actions.map(
            (a) => [`${st.stateHash}|${a.role ?? "link"}|${a.label}|${a.href ?? ""}`, a.actionId] as const,
          ),
        ),
      );
      // Emergent journeys replay their recorded actions; sampled trajectories resolve actionIds via the graph.
      const replayables: Replayable[] =
        e.swarm && e.swarm.journeys.length > 0
          ? selectJourneys(e.swarm, e.configuration.verifyCount).map((j) => ({
              id: j.agentId,
              actions: j.steps.flatMap((s) => {
                if (!s.action) return [];
                const actionId = actionIdByKey.get(
                  `${s.stateHash}|${s.action.role ?? "link"}|${s.action.label}|${s.action.href ?? ""}`,
                );
                return [{ actionId, label: s.action.label, href: s.action.href, role: s.action.role }];
              }),
            }))
          : selectTrajectories(e.simulations, e.configuration.verifyCount).map((traj) => ({
              id: traj.trajectoryId,
              actions: traj.steps
                .map((s) => s.actionId)
                .filter(Boolean)
                .map((actionId) => {
                  for (const st of graph.states) {
                    const a = st.actions.find((x) => x.actionId === actionId);
                    if (a) return { actionId: a.actionId, label: a.label, href: a.href, role: a.role };
                  }
                  return null;
                })
                .filter(Boolean) as { actionId: string; label: string; href?: string; role?: string }[],
            }));

      e.failures = e.failures.filter((f) => f.stage !== "verify");
      // A re-run replaces verify's own baseline runs; compare's variant runs stay behind them.
      const runs: BrowserRun[] = [];
      const goalAlternatives = endpointGoalAssertions(e.graph, e.intents?.[0], e.endpoints);
      try {
        for (const selected of replayables) {
          const actions = selected.actions;

          const vps = e.configuration.viewports.slice(0, 1);
          if (selected === replayables[0] && e.configuration.viewports.includes("mobile") && !vps.includes("mobile")) vps.push("mobile");
          for (const vpName of vps) {
            const runId = `run_${selected.id}_${vpName}`;
            await this.emit(id, "verify", "browser", `${runId}: replaying ${actions.length} steps on ${vpName}`);
            const args = {
              url: e.targetUrl,
              viewport: VIEWPORTS[vpName],
              actions,
              assertions: e.assertions,
              goalAlternatives,
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
            for (const a of failedGoalAssertions(run)) {
              await this.emit(id, "verify", "assert", `Assertion failed: ${a.assertion.kind} "${a.assertion.value}"`);
            }
            await this.emit(id, "verify", "browser", `${runId}: ${run.success ? "goal reached" : "goal not reached"} in ${run.durationMs} ms`);
            runs.push(run);
          }
        }
      } catch (err) {
        const code = classifyError(err);
        if (!BROWSER_SKIP_CODES.has(code)) throw err;
        e.failures.push(toFailure(err, "verify"));
        await this.emit(
          id,
          "verify",
          "info",
          `Browser replays skipped (${code}): ${this.runner.name} can't run here — findings come from the crawl and simulation`,
        );
      }
      e.browserTests = [...runs, ...e.browserTests.filter((r) => r.variantId)];
      await this.update(e, "created");
      return e;
    });
  }

  /** Stage 4 — rule + LLM findings. */
  private async runAnalyze(id: string): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (e.browserTests.length === 0 && !browserSkipped(e)) await this.runVerify(id);
    const exp = (await this.mustGet(id))!;
    await this.update(exp, "analyzing");
    return withTrace("analyze", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      const states = exp.graph?.states ?? [];
      // Findings describe the live site: a re-run after compare skips the patched variant runs.
      const runs = exp.browserTests.filter((r) => !r.variantId);
      const rules = ruleFindings({ states, runs, assertions: exp.assertions });
      const llm = await llmFindings({ llm: this.llm, states, runs, goal: exp.goal });
      const endpoints = await this.endpointAnalysis(exp);
      const graph = exp.graph?.states.length ? exp.graph : undefined;
      if (graph) exp.questions = await visitorQuestions(graph, exp.endpoints ?? [], detectSiteType(graph), this.llm);
      exp.findings = collapseFindings([
        ...rules,
        ...endpoints,
        ...metricFindings(states, { homepageUrl: exp.targetUrl }),
        ...questionFindings(exp.questions ?? [], graph),
        ...llm,
      ], { states, runs: runs.length });
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
      // A re-run replaces compare's own variant, variant run, comparison and failure.
      exp.failures = exp.failures.filter((f) => f.stage !== "compare");
      exp.variants = [];
      exp.comparisons = [];
      exp.browserTests = exp.browserTests.filter((r) => !r.variantId);
      const finding = exp.findings.find((f) => /post-event|stale/i.test(f.title)) ?? exp.findings[0];
      if (!finding) {
        await this.update(exp, "created");
        return exp;
      }
      const variant = await this.proposeVariant(exp, finding.findingId);
      exp.variants.push(variant);
      const notReplayed = async (why: string) => {
        variant.status = "proposed";
        await this.emit(id, "compare", "info", `Variant ${variant.variantId} proposed, not replayed: ${why}`);
        await this.update(exp, "created");
        return exp;
      };
      const baseline = exp.browserTests.find((r) => !r.variantId);
      if (!baseline) return notReplayed("no baseline browser run to compare against");
      await this.emit(id, "compare", "browser", `Applied variant ${variant.variantId}: ${variant.patches.length} patch(es)`);

      const actionById = new Map((exp.graph?.states ?? []).flatMap((st) => st.actions.map((a) => [a.actionId, a] as const)));
      const baselineActions =
        baseline.steps.map((s) => {
          const a = s.actionId ? actionById.get(s.actionId) : undefined;
          return { actionId: s.actionId, label: s.label, href: a?.href, role: a?.role };
        });
      let run: BrowserRun;
      try {
        run = await this.runner.runTrajectory({
          url: exp.targetUrl,
          viewport: baseline.viewport,
          actions: baselineActions,
          assertions: exp.assertions,
          goalAlternatives: endpointGoalAssertions(exp.graph, exp.intents?.[0], exp.endpoints),
          runId: `run_variant_${variant.variantId}`,
          patches: variant.patches,
        });
      } catch (err) {
        const code = classifyError(err);
        if (!BROWSER_SKIP_CODES.has(code)) throw err;
        exp.failures.push(toFailure(err, "compare"));
        return notReplayed(`browser unavailable (${code})`);
      }
      run.variantId = variant.variantId;
      exp.browserTests.push(run);

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
          goalCompleted: { baseline: runSucceeded(baseline), variant: runSucceeded(run) },
          interactionCount: { baseline: baseline.steps.length, variant: run.steps.length },
          backtracks: { baseline: backtracksOf(baseline), variant: backtracksOf(run) },
          failedInteractions: {
            baseline: baseline.steps.filter((s) => !s.ok).length,
            variant: run.steps.filter((s) => !s.ok).length,
          },
          runtimeErrors: { baseline: baseline.errors.length, variant: run.errors.length },
          findingReproduces: runSucceeded(run) === runSucceeded(baseline),
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
    if (e.comparisons.length === 0 && e.variants.length === 0) await this.runCompare(id);
    const exp = (await this.mustGet(id))!;
    return withTrace("spec", { experimentId: id, targetUrl: exp.targetUrl }, async () => {
      // Spec + mockup are two model calls that can outlast one Workers slice: the
      // spec is saved as soon as it exists, and a re-entered slice reuses it.
      const retried = exp.runCheckpoint?.stage === "spec" && exp.runCheckpoint.attempt > 1;
      if (!(retried && exp.spec)) {
        exp.spec = await generateSpec(exp, this.llm);
        await this.emit(id, "spec", "info", `Spec written: ${exp.spec.changes.length} changes across ${exp.spec.rebuildPhases.length} phases`);
        const usage = this.collectUsage();
        if (usage) {
          const fmt = (u: { calls: number; totalTokens: number; estimated?: boolean }) =>
            `${u.calls} calls · ~${(u.totalTokens / 1000).toFixed(1)}k tokens${u.estimated ? " (est)" : ""}`;
          const parts = [usage.llm && `llm ${fmt(usage.llm)}`, usage.jev && `jev ${fmt(usage.jev)}`].filter(Boolean);
          await this.emit(id, "spec", "info", `Model usage this run: ${parts.join(" · ")}`);
        }
        await this.store.save(Experiment.parse(exp));
      }
      const spec = exp.spec;
      // Mockup is a bonus deliverable: a spec failure can't lose it, and vice versa.
      try {
        // A suspended spec slice re-enters with the spec already saved —
        // reuse a stored mockup too, so a retry finishes instead of burning
        // another model call past the step budget.
        if (exp.mockup === undefined) exp.mockup = await generateMockup(exp, this.llm);
        await this.emit(id, "spec", "info", `Mockup built: ${exp.mockup.pages.length} pages under /experiments/${id}/preview/`);
      } catch (err) {
        logEvent({ experimentId: id, stage: "spec", kind: "llm-fallback", data: { error: `mockup skipped: ${String(err).slice(0, 160)}` } });
      }
      // Evidence/spec files are best-effort; edge runtimes have a read-only fs.
      try {
        const dir = path.join(process.cwd(), "data", "experiments", exp.id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "spec.md"), specToMarkdown(spec));
      } catch {
        /* spec.md lives on the experiment payload regardless */
      }
      if (exp.runCheckpoint?.stage !== "rebuild") exp.runCheckpoint = undefined;
      await this.update(exp, "complete");
      return exp;
    });
  }

  /** Stage 7 — one durable site planning or page-building step. */
  private async runRebuild(
    id: string,
    opts?: { restart?: boolean },
  ): Promise<Experiment> {
    const e = await this.mustGet(id);
    if (!e.spec) await this.runSpec(id);
    const exp = await this.mustGet(id);
    if (exp.rebuild?.site?.completedAt && !opts?.restart) return exp;
    const planning = !exp.rebuild?.site || opts?.restart;
    const batchSize =
      exp.rebuild?.site?.pages
        .filter((p) => p.status === "planned")
        .slice(0, REBUILD_BATCH).length ?? 0;
    this.llm.resetBudget?.({
      experimentId: id,
      maxCalls: planning ? 1 : exp.rebuild?.site?.gap && !exp.rebuild.site.gap.completed ? 0 : batchSize * 2,
    });
    const priorUsage = exp.usage?.llm;
    const baseline = this.llm.usageReport?.();
    const saveStep = async (status: Experiment["status"]) => {
      const current = this.llm.usageReport?.();
      if (current) {
        const total = (key: "calls" | "inputTokens" | "outputTokens" | "totalTokens") =>
          (priorUsage?.[key] ?? 0) + Math.max(0, current[key] - (baseline?.[key] ?? 0));
        exp.usage = {
          ...exp.usage,
          llm: {
            calls: total("calls"),
            inputTokens: total("inputTokens"),
            outputTokens: total("outputTokens"),
            totalTokens: total("totalTokens"),
            ...((priorUsage?.estimated || current.estimated) ? { estimated: true } : {}),
          },
        };
      }
      exp.status = status;
      if (status === "rebuilding") exp.runCheckpoint = { stage: "rebuild", attempt: 0 };
      else if (exp.runCheckpoint?.stage === "rebuild") exp.runCheckpoint = undefined;
      await this.store.save(Experiment.parse(exp));
    };
    await saveStep("rebuilding");
    return withTrace(
      "rebuild",
      { experimentId: id, targetUrl: exp.targetUrl },
      async () => {
        if (!exp.rebuild?.site || opts?.restart) {
          const site = await planSite(exp, this.llm);
          exp.rebuild = {
            generatedAt: new Date().toISOString(),
            brand: rollupBrand(exp.graph?.states ?? []),
            goals: inferGoals(exp),
            pages: [],
            llm: this.llm.name,
            site,
          };
          await this.emit(
            id,
            "rebuild",
            "info",
            `Planned ${site.pages.length} site pages (${site.plannerSource})${site.plannerError ? `: ${site.plannerError}` : ""}`,
          );
        } else if (exp.rebuild.site.gap && !exp.rebuild.site.gap.completed) {
          await fetchRebuildGaps(exp, this.probeFetcher, () => saveStep("rebuilding"));
          const gap = exp.rebuild.site.gap;
          await this.emit(id, "rebuild", "info", `Gap pages: checked ${gap.cursor} of ${gap.candidates.length}; ${gap.failed.length} failed; ${gap.skipped} over cap`);
        } else {
          const site = exp.rebuild.site;
          const batch = site.pages
            .filter((p) => p.status === "planned")
            .slice(0, REBUILD_BATCH);
          const built = await Promise.all(
            batch.map((p) => buildPage(exp, site, p, this.llm)),
          );
          let total = site.pages.reduce((n, p) => n + (p.bytes ?? 0), 0);
          let capped = total >= SITE_BYTE_CAP;
          for (const page of built) {
            if (capped || total + (page.bytes ?? 0) > SITE_BYTE_CAP) {
              capped = true;
              Object.assign(
                site.pages.find((p) => p.path === page.path)!,
                { status: "failed", issues: ["size cap"] },
              );
            } else {
              total += page.bytes ?? 0;
              site.pages[site.pages.findIndex((p) => p.path === page.path)] =
                page;
            }
          }
          if (capped)
            for (const page of site.pages)
              if (page.status === "planned") {
                page.status = "failed";
                page.issues = ["size cap"];
              }
          await this.emit(
            id,
            "rebuild",
            "info",
            `Built ${site.pages.filter((p) => p.status === "built").length} of ${site.pages.length} site pages`,
          );
        }
        const site = exp.rebuild.site;
        if (site && !site.pages.some((p) => p.status === "planned")) {
          site.gap = collectRebuildGaps(exp);
          if (site.gap.completed) {
            site.completedAt = new Date().toISOString();
            const counts = {
              openrouter: 0,
              gemini: 0,
              template: 0,
              failed: 0,
              issues: 0,
            };
            for (const p of site.pages) {
              if (p.source) counts[p.source]++;
              if (p.status === "failed") counts.failed++;
              counts.issues += p.issues?.length ?? 0;
            }
            await this.emit(
              id,
              "rebuild",
              "info",
              `Site rebuild complete: ${JSON.stringify(counts)}`,
            );
          }
        }
        await saveStep(
          exp.rebuild.site?.completedAt ? "complete" : "rebuilding",
        );
        return exp;
      },
    );
  }

  /** Full closed loop. */
  async runAll(id: string, opts?: { origin?: string }): Promise<Experiment> {
    return this.exclusive(id, "run", async () => {
      await this.stepBody(id, opts);
      return this.mustGet(id);
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
    const active = this.activeRun(id);
    if (active) throw new StageInProgressError(id, active.stage);
    const lock = { stage, acquiredAt: Date.now() };
    this.running.set(id, lock);
    const holder = randomUUID();
    const ttlMs = runSlotTtlMs();
    let renewal: ReturnType<typeof setInterval> | undefined;
    try {
      if (!await this.leases.acquireLock(id, holder, stage, ttlMs, Date.now())) {
        const held = await this.leases.activeLock(id, Date.now());
        throw new StageInProgressError(id, held?.stage ?? stage);
      }
      renewal = setInterval(() => {
        lock.acquiredAt = Date.now();
        void this.leases.renew(holder, ttlMs, lock.acquiredAt).catch(() => undefined);
      }, ttlMs / 3);
      return await fn();
    } finally {
      clearInterval(renewal);
      if (this.running.get(id) === lock) this.running.delete(id);
      await this.leases.release(holder).catch(() => undefined);
    }
  }

  private activeRun(id: string) {
    const active = this.running.get(id);
    if (active && Date.now() - active.acquiredAt >= runSlotTtlMs()) {
      this.running.delete(id);
      return undefined;
    }
    return active;
  }

  /** `exclusive` for background jobs: waits for the in-flight run to finish instead of throwing 409-style. */
  private async exclusiveWhenFree<T>(id: string, stage: string, fn: () => Promise<T>): Promise<T> {
    for (;;) {
      try {
        return await this.exclusive(id, stage, fn);
      } catch (e) {
        if (!(e instanceof StageInProgressError)) throw e;
        await new Promise((r) => setTimeout(r, 2_000));
      }
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
