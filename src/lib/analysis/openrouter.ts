import type { CallContext, LlmClient, RebuiltPage, TokenUsage } from "../contracts";
import { isQuotaStatus, logEvent, reportProviderQuota } from "../telemetry";

/**
 * OpenRouter client — OpenAI-compatible chat completions at openrouter.ai, used for
 * every LLM stage when OPENROUTER_API_KEY is set. Deep and mockup calls send a
 * `models` fallback list ending in the fast model, so OpenRouter itself retries on
 * 429/5xx. Rebuild has its own cheaper model: its pages are a layout POC. No `response_format`: json_object mode forces a top-level object, but
 * several callers expect a JSON array; the prompts ask for JSON and callers strip fences.
 */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MAX_CALLS = 10;

export class OpenRouterClient implements LlmClient {
  readonly name = "openrouter";
  private apiKey: string;
  private fast: string;
  private deep: string;
  private mockup: string;
  private rebuild: string;
  private planner: string;
  private maxCalls: number;
  private calls = 0;
  private usage = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private experimentId: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY ?? "";
    this.fast = process.env.OPENROUTER_MODEL_FAST || "google/gemini-4-hydrogen";
    this.deep = process.env.OPENROUTER_MODEL_DEEP || "google/gemini-4-argon";
    this.mockup = process.env.OPENROUTER_MODEL_MOCKUP || this.deep;
    this.rebuild = process.env.OPENROUTER_MODEL_REBUILD || "google/gemini-3.8-flash";
    this.planner = process.env.OPENROUTER_MODEL_REBUILD_PLANNER || "anthropic/claude-opus-5.5";
    const max = Number(process.env.REHEARSAL_GEMINI_MAX_CALLS ?? DEFAULT_MAX_CALLS);
    this.maxCalls = Number.isFinite(max) && max >= 0 ? max : DEFAULT_MAX_CALLS;
    if (!this.apiKey) throw new Error("OpenRouterClient requires OPENROUTER_API_KEY");
  }

  resetBudget(ctx?: CallContext): void {
    this.calls = 0;
    this.usage = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.experimentId = ctx?.experimentId;
  }

  usageReport(): TokenUsage {
    return { ...this.usage };
  }

  /** Over budget throws; every caller already falls back to its deterministic path on error. */
  async complete(prompt: string, opts?: { deep?: boolean; json?: boolean; model?: string; timeoutMs?: number }): Promise<string> {
    if (this.calls >= this.maxCalls) throw new Error(`LLM call budget (${this.maxCalls}/run) exhausted`);
    this.calls++;
    const primary =
      opts?.model === "rebuild-planner" ? this.planner : opts?.model === "mockup" ? this.mockup : opts?.model === "rebuild" ? this.rebuild : opts?.deep ? this.deep : this.fast;
    const models = [...new Set([primary, this.fast])];
    const started = Date.now();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "http-referer": "https://rehearsal.alikhani.co",
        "x-title": "Rehearsal",
      },
      body: JSON.stringify({
        ...(models.length > 1 ? { models } : { model: models[0] }),
        messages: [{ role: "user", content: prompt }],
        max_tokens: 16384,
      }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 90000),
    });
    if (!res.ok) {
      if (isQuotaStatus(res.status)) await reportProviderQuota("openrouter", res.status, models[0], { experimentId: this.experimentId, stage: "llm" });
      throw new Error(`OpenRouter ${models[0]} failed: ${res.status}`);
    }
    const data = (await res.json()) as ChatCompletion;
    if (data.error) throw new Error(`OpenRouter ${models[0]} failed: ${data.error.code ?? "error"}`);
    const usage = data.usage;
    const inputTokens = usage?.prompt_tokens ?? Math.ceil(prompt.length / 4);
    const outputTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
    this.usage.calls++;
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.totalTokens += totalTokens;
    logEvent({
      experimentId: this.experimentId,
      stage: "llm",
      kind: "llm-call",
      data: {
        model: data.model ?? models[0],
        requested: models[0],
        provider: data.provider,
        inputTokens,
        outputTokens,
        totalTokens,
        ...(typeof usage?.cost === "number" ? { costUsd: usage.cost } : {}),
        durationMs: Date.now() - started,
        estimated: !usage,
      },
    });
    return data.choices?.[0]?.message?.content ?? "";
  }
}

interface ChatCompletion {
  model?: string;
  provider?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  error?: { code?: number | string; message?: string };
}

/** The page `source` label for content an LLM produced. */
export function llmPageSource(llm: LlmClient): Exclude<RebuiltPage["source"], "template"> {
  return llm.name === "openrouter" ? "openrouter" : "gemini";
}
