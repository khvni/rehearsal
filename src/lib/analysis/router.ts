import type { CallContext, LlmClient, RebuiltPage, TokenUsage } from "../contracts";
import { logEvent } from "../telemetry";

/**
 * Ramp Router client — OpenAI Responses API at api.router.com, used for every LLM
 * stage when RAMP_ROUTER_API_KEY is set. Deep and mockup calls send a `models`
 * fallback list ending in the fast model, so Router itself retries on 429/5xx.
 */
const DEFAULT_BASE_URL = "https://api.router.com/v1";
const DEFAULT_MAX_CALLS = 10;

export class RampRouterClient implements LlmClient {
  readonly name = "ramp-router";
  private apiKey: string;
  private baseUrl: string;
  private fast: string;
  private deep: string;
  private mockup: string;
  private maxCalls: number;
  private calls = 0;
  private usage = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private experimentId: string | undefined;

  constructor() {
    this.apiKey = process.env.RAMP_ROUTER_API_KEY ?? "";
    this.baseUrl = (process.env.RAMP_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fast = process.env.RAMP_ROUTER_MODEL_FAST || "gemini-4-hydrogen";
    this.deep = process.env.RAMP_ROUTER_MODEL_DEEP || "gemini-4-argon";
    this.mockup = process.env.RAMP_ROUTER_MODEL_MOCKUP || this.deep;
    const max = Number(process.env.REHEARSAL_GEMINI_MAX_CALLS ?? DEFAULT_MAX_CALLS);
    this.maxCalls = Number.isFinite(max) && max >= 0 ? max : DEFAULT_MAX_CALLS;
    if (!this.apiKey) throw new Error("RampRouterClient requires RAMP_ROUTER_API_KEY");
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
  async complete(prompt: string, opts?: { deep?: boolean; json?: boolean; model?: string }): Promise<string> {
    if (this.calls >= this.maxCalls) throw new Error(`LLM call budget (${this.maxCalls}/run) exhausted`);
    this.calls++;
    const primary = opts?.model === "mockup" ? this.mockup : opts?.deep ? this.deep : this.fast;
    const models = [...new Set([primary, this.fast])];
    const json = opts?.json ?? false;
    try {
      return await this.respond(models, prompt, json);
    } catch (err) {
      // 501: a model in the list can't do JSON mode; the prompts already ask for JSON.
      if (json && /failed: 501/.test(String(err))) return await this.respond(models, prompt, false);
      throw err;
    }
  }

  private async respond(models: string[], prompt: string, json: boolean): Promise<string> {
    const started = Date.now();
    const res = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...(models.length > 1 ? { models } : { model: models[0] }),
        input: prompt,
        max_output_tokens: 8192,
        ...(json ? { text: { format: { type: "json_object" } } } : {}),
        metadata: { product: "rehearsal", ...(this.experimentId ? { experiment_id: this.experimentId } : {}) },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`Router ${models[0]} failed: ${res.status}`);
    const data = (await res.json()) as RouterResponse;
    const usage = data.usage;
    const inputTokens = usage?.input_tokens ?? Math.ceil(prompt.length / 4);
    const outputTokens = usage?.output_tokens ?? 0;
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
        provider: data.provider ?? res.headers.get("x-router-provider") ?? undefined,
        inputTokens,
        outputTokens,
        totalTokens,
        ...(typeof usage?.cost === "number" ? { costUsd: usage.cost } : {}),
        durationMs: Date.now() - started,
        estimated: !usage,
      },
    });
    return responseText(data);
  }
}

interface RouterResponse {
  model?: string;
  provider?: string;
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; cost?: number };
}

function responseText(data: RouterResponse): string {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
}

/** The page `source` label for content an LLM produced. */
export function llmPageSource(llm: LlmClient): Exclude<RebuiltPage["source"], "template"> {
  return llm.name === "ramp-router" ? "router" : "gemini";
}
