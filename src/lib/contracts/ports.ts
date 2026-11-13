import type { DecisionQuestion, DecisionResult, Experiment } from "./index";

// Pluggable service interfaces wired by the Orchestrator; each has a keyless fallback.

export interface ExperimentStore {
  readonly name: string;
  save(experiment: Experiment): Promise<void>;
  get(id: string): Promise<Experiment | null>;
  list(): Promise<Experiment[]>;
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
