import type { ActivityEvent, DecisionQuestion, DecisionResult, Experiment } from "./index";

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

/** Jev / System One decisions client (src/lib/decisions/jev.ts). */
export interface JevClient {
  readonly name: string;
  decide(state: Record<string, unknown>, questions: DecisionQuestion[]): Promise<DecisionResult[]>;
}

/** Text LLM client (src/lib/analysis/gemini.ts). */
export interface LlmClient {
  readonly name: string;
  complete(prompt: string, opts?: { deep?: boolean; json?: boolean }): Promise<string>;
  /** Start a new per-run call budget (called when an experiment's discover stage begins). */
  resetBudget?(): void;
}

export interface PageFetcher {
  /** Fetch fully-rendered or raw HTML for a public URL. */
  fetchHtml(url: string): Promise<string>;
  readonly name: string;
}

export interface SimWeights {
  /** stateId -> actionId -> weight (from Jev scoring, profile-reweighted) */
  byState: Map<string, Map<string, number>>;
  /** stateId -> ambiguity score 0..1 */
  ambiguity: Map<string, number>;
}
