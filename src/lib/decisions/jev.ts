import { createHash } from "node:crypto";
import type {
  ActionNode,
  BehavioralProfile,
  CallContext,
  DecisionQuestion,
  DecisionResult,
  JevClient,
  JevScoreCache,
  SiteState,
  TokenUsage,
} from "../contracts";
import { logEvent } from "../telemetry";

/** Jev reports no usage metadata; estimate tokens as bytes/4 of the JSON payloads. */
function estTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

/**
 * Jev / System One client.
 * Live path: OpenRouter decisions API (POST /api/alpha/decisions, model typesafe/jev-*).
 * Offline path: FixtureJevClient — deterministic typed answers from token overlap.
 */
interface RawDecisionEntry {
  type?: string;
  distribution?: Record<string, number>;
  probabilities?: Record<string, number>;
  selected?: string;
  value?: string;
}
interface RawDecisionResponse {
  decisions?: Record<string, RawDecisionEntry>;
  questions?: Record<string, RawDecisionEntry>;
}

export class HttpJevClient implements JevClient {
  readonly name = "jev-http";
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private usage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  constructor() {
    this.baseUrl = process.env.JEV_BASE_URL ?? "https://openrouter.ai/api/alpha/decisions";
    this.apiKey = process.env.JEV_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = process.env.JEV_MODEL ?? "typesafe/jev-1.13";
    if (!this.apiKey) throw new Error("HttpJevClient requires JEV_API_KEY or OPENROUTER_API_KEY");
  }

  resetBudget(): void {
    this.usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  }

  usageReport(): TokenUsage {
    const { calls, inputTokens, outputTokens } = this.usage;
    return { calls, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimated: true };
  }

  async decide(
    state: Record<string, unknown>,
    questions: DecisionQuestion[],
    ctx?: CallContext,
  ): Promise<DecisionResult[]> {
    const body = {
      model: this.model,
      state,
      questions: Object.fromEntries(
        questions.map((q) => [
          q.name,
          { type: q.type, instructions: q.instructions, criteria: q.criteria },
        ]),
      ),
    };
    const started = Date.now();
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const requestBytes = JSON.stringify(body).length;
    const responseBytes = Number(res.headers.get("content-length") ?? 0);
    this.usage.calls++;
    this.usage.inputTokens += estTokens(requestBytes);
    if (!res.ok) throw new Error(`Jev request failed: ${res.status}`);
    const text = await res.text();
    this.usage.outputTokens += estTokens(responseBytes || text.length);
    logEvent({
      experimentId: ctx?.experimentId,
      stage: "simulate",
      kind: "jev-call",
      data: {
        model: this.model,
        questions: questions.length,
        inputTokens: estTokens(requestBytes),
        outputTokens: estTokens(responseBytes || text.length),
        durationMs: Date.now() - started,
        estimated: true,
      },
    });
    const raw = JSON.parse(text) as RawDecisionResponse;
    const decisions = raw.decisions ?? raw.questions ?? {};
    return questions.map((q) => {
      const d = decisions[q.name] ?? {};
      const distribution = d.distribution ?? d.probabilities ?? {};
      return {
        question: q.name,
        type: q.type,
        distribution,
        selected: d.selected ?? d.value ?? argmax(distribution),
      };
    });
  }
}

/**
 * Deterministic Jev stand-in: scores each option by token overlap between the
 * option's criteria/label text and the goal + behavioral profile. Powers evals
 * and offline development; identical input => identical output.
 */
export class FixtureJevClient implements JevClient {
  readonly name = "jev-fixture";
  private calls = 0;

  resetBudget(): void {
    this.calls = 0;
  }

  usageReport(): TokenUsage {
    return { calls: this.calls, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: true };
  }

  async decide(state: Record<string, unknown>, questions: DecisionQuestion[]): Promise<DecisionResult[]> {
    this.calls++;
    const goal = String(state.goal ?? "").toLowerCase();
    const profile = String(state.profile ?? "goal-directed");
    const stop = new Set(["the", "a", "an", "to", "for", "of", "in", "on", "and", "or", "is"]);
    const goalTokens = new Set(
      goal.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !stop.has(t)),
    );
    return questions.map((q) => {
      const criteria = q.criteria as Record<string, string>;
      const keys = Object.keys(criteria);
      const raw = keys.map((k) => {
        const text = `${k} ${criteria[k]}`.toLowerCase();
        const tokens = new Set(text.split(/[^a-z0-9]+/));
        let score = 0.1;
        for (const t of tokens) if (goalTokens.has(t)) score += 2;
        if (profile === "impatient" && /buy|apply|register|now|schedule|top/i.test(text)) score += 1;
        if (profile === "exploratory" && /about|blog|info|more|docs/i.test(text)) score += 1;
        // deterministic tiebreak by key
        score += stableJitter(k);
        return [k, score] as const;
      });
      const total = raw.reduce((a, [, s]) => a + s, 0) || 1;
      const distribution = Object.fromEntries(raw.map(([k, s]) => [k, s / total]));
      return { question: q.name, type: q.type, distribution, selected: argmax(distribution) };
    });
  }
}

function stableJitter(key: string): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 1e6;
  return (h % 100) / 1000;
}

function argmax(dist: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestV = -1;
  for (const [k, v] of Object.entries(dist)) {
    if (v > bestV) {
      best = k;
      bestV = v;
    }
  }
  return best;
}

/** Live Jev with a per-call fixture fallback: a 401/timeout must not fail the simulate stage. */
export class FallbackJevClient implements JevClient {
  readonly name: string;
  private fixture = new FixtureJevClient();

  constructor(private live: JevClient) {
    this.name = `${live.name}+fallback`;
  }

  async decide(
    state: Record<string, unknown>,
    questions: DecisionQuestion[],
    ctx?: CallContext,
  ): Promise<DecisionResult[]> {
    try {
      return await this.live.decide(state, questions, ctx);
    } catch (err) {
      logEvent({ stage: "simulate", kind: "jev-fallback", data: { from: this.live.name, error: String(err).slice(0, 160) } });
      return this.fixture.decide(state, questions);
    }
  }

  resetBudget(): void {
    this.live.resetBudget?.();
    this.fixture.resetBudget();
  }

  usageReport(): TokenUsage {
    const merge = (r?: TokenUsage) =>
      r ?? { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: true };
    const live = merge(this.live.usageReport?.());
    const fixture = merge(this.fixture.usageReport());
    return {
      calls: live.calls + fixture.calls,
      inputTokens: live.inputTokens + fixture.inputTokens,
      outputTokens: live.outputTokens + fixture.outputTokens,
      totalTokens: live.totalTokens + fixture.totalTokens,
      estimated: true,
    };
  }
}

export function selectJev(): JevClient {
  if (process.env.JEV_API_KEY || process.env.OPENROUTER_API_KEY) {
    try {
      return new FallbackJevClient(new HttpJevClient());
    } catch {
      /* fall through */
    }
  }
  return new FixtureJevClient();
}

// ── Action scoring ──────────────────────────────────────────────────────────

interface ScoredAction {
  action: ActionNode;
  weight: number;
}

/** 0..1: how contested the top action is — 0 when one option dominates, 1 on a dead heat. */
function ambiguityFromWeights(weights: number[]): number {
  if (weights.length < 2) return 0;
  const [top, next] = [...weights].sort((a, b) => b - a);
  return Math.min(1, Math.max(0, 1 - (top - next)));
}

/** Hash of everything Jev sees except actionIds — identical payloads score once per run. */
function scoreSignature(state: SiteState, goal: string, profile: BehavioralProfile, values: string[]): string {
  return createHash("sha1")
    .update(
      JSON.stringify([
        goal,
        profile,
        state.url,
        state.pageTitle,
        state.visibleText.slice(0, 800),
        values,
      ]),
    )
    .digest("hex");
}

/**
 * Score candidate actions in a state via one Jev `choice` question. Ambiguity is
 * derived from the weight spread (no second question — nothing consumed the old
 * model-rated score). `opts.cache` dedupes identical scoring inputs within a run
 * (e.g. the desktop+mobile captures of one URL carry the same Jev payload).
 */
export async function scoreActions(
  jev: JevClient,
  state: SiteState,
  goal: string,
  profile: BehavioralProfile,
  opts?: { cache?: JevScoreCache; experimentId?: string },
): Promise<{ scored: ScoredAction[]; ambiguity: number }> {
  const candidates = state.actions.filter((a) => a.enabled && a.safeToExecute);
  if (candidates.length === 0) return { scored: [], ambiguity: 0.5 };

  const criteria = Object.fromEntries(
    candidates.map((a) => [a.actionId, `${a.label} (${a.role ?? a.type})`]),
  );
  const signature = scoreSignature(state, goal, profile, Object.values(criteria));
  const cached = opts?.cache?.get(signature);
  if (cached && cached.weights.length === candidates.length) {
    return {
      scored: candidates.map((action, i) => ({ action, weight: cached.weights[i] })),
      ambiguity: cached.ambiguity,
    };
  }

  const results = await jev.decide(
    {
      goal,
      profile,
      state: {
        url: state.url,
        title: state.pageTitle,
        text: state.visibleText.slice(0, 800),
        historyNote: "simulated journey",
      },
    },
    [
      {
        type: "choice",
        name: "best_action",
        instructions: "Which available action best advances the user's objective?",
        criteria,
      },
    ],
    { experimentId: opts?.experimentId },
  );

  const choice = results.find((r) => r.question === "best_action");
  const weights = candidates.map((action) =>
    Math.max(0.001, choice?.distribution[action.actionId] ?? 1 / candidates.length),
  );
  const ambiguity = ambiguityFromWeights(weights);
  opts?.cache?.set(signature, { weights, ambiguity });
  return {
    scored: candidates.map((action, i) => ({ action, weight: weights[i] })),
    ambiguity,
  };
}
