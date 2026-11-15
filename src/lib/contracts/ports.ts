import type {
  ActivityEvent,
  DecisionQuestion,
  DecisionResult,
  Experiment,
  TokenUsage,
} from "./index";

// Pluggable service interfaces wired by the Orchestrator; each has a keyless fallback.

export interface ExperimentStore {
  readonly name: string;
  save(experiment: Experiment): Promise<void>;
  get(id: string): Promise<Experiment | null>;
  list(): Promise<Experiment[]>;
  /** Append one event to the experiment's activity feed. Bounded to ACTIVITY_EVENT_LIMIT, newest win. */
  appendActivity(id: string, event: ActivityEvent): Promise<void>;
  /** The experiment's activity feed, chronological; at most `limit` events (default ACTIVITY_EVENT_LIMIT). */
  activity(id: string, limit?: number): Promise<ActivityEvent[]>;
}

/** Optional telemetry context attached to model calls, used for per-call usage logging. */
export interface CallContext {
  experimentId?: string;
}

/** Jev / System One decisions client (src/lib/decisions/jev.ts). */
export interface JevClient {
  readonly name: string;
  decide(state: Record<string, unknown>, questions: DecisionQuestion[], ctx?: CallContext): Promise<DecisionResult[]>;
  /** Start a new per-run call budget (called when an experiment's discover stage begins). */
  resetBudget?(ctx?: CallContext): void;
  /** Per-run call/token totals since construction or the last budget reset. */
  usageReport?(): TokenUsage;
}

/** Text LLM client (src/lib/analysis/gemini.ts). */
export interface LlmClient {
  readonly name: string;
  /** `model` is a named slot ("mockup", "rebuild"); adapters resolve it to a configured model id and ignore unknown slots. */
  complete(prompt: string, opts?: { deep?: boolean; json?: boolean; model?: string; timeoutMs?: number }): Promise<string>;
  /** Start a new per-run call budget (called when an experiment's discover stage begins). */
  resetBudget?(ctx?: CallContext): void;
  /** Per-run call/token totals since construction or the last budget reset. */
  usageReport?(): TokenUsage;
}

export interface PageFetcher {
  /** Fetch fully-rendered or raw HTML for a public URL. `signal` aborts the request; fetchers without abort support still honor their own deadline. */
  fetchHtml(url: string, opts?: { signal?: AbortSignal }): Promise<string>;
  readonly name: string;
}

export interface SimWeights {
  /** stateId -> actionId -> weight (from Jev scoring, profile-reweighted) */
  byState: Map<string, Map<string, number>>;
  /** stateId -> ambiguity score 0..1 */
  ambiguity: Map<string, number>;
}

/**
 * Per-run cache for `scoreActions`, keyed by the scoring-input signature (goal,
 * profile, url, title, text and the candidate labels — actionIds excluded).
 * `weights` aligns with the state's candidate order, so identical Jev payloads
 * (e.g. the desktop+mobile states of one URL) score once.
 */
export type JevScoreCache = Map<string, { weights: number[]; ambiguity: number }>;
