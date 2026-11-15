import type { CallContext, LlmClient, TokenUsage } from "../contracts";
import { isQuotaStatus, logEvent, reportProviderQuota } from "../telemetry";

/**
 * Gemini API client — REST over generativelanguage (stable across SDK churn).
 * Models: gemini-4-hydrogen (fast/cheap structured calls), gemini-4-argon
 * (findings, recommendations, spec generation, mockup pages).
 * The "mockup" slot (GEMINI_MODEL_MOCKUP) defaults to the deep model so the
 * frontier generation model builds previews; retryable errors fall back to fast.
 */
/** One per LLM step of a run: assertions, goal intent, visitor questions, findings, spec, mockup, rebuild — plus headroom for a re-entered stage. */
const DEFAULT_MAX_CALLS = 10;

export class GeminiClient implements LlmClient {
  readonly name = "gemini";
  private apiKey: string;
  private fast: string;
  private deep: string;
  private mockup: string;
  private maxCalls: number;
  private calls = 0;
  private usage = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private experimentId: string | undefined;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? "";
    this.fast = process.env.GEMINI_MODEL_FAST ?? "gemini-4-hydrogen";
    this.deep = process.env.GEMINI_MODEL_DEEP ?? "gemini-4-argon";
    this.mockup = process.env.GEMINI_MODEL_MOCKUP ?? this.deep;
    const max = Number(process.env.REHEARSAL_GEMINI_MAX_CALLS ?? DEFAULT_MAX_CALLS);
    this.maxCalls = Number.isFinite(max) && max >= 0 ? max : DEFAULT_MAX_CALLS;
    if (!this.apiKey) throw new Error("GeminiClient requires GEMINI_API_KEY");
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
    if (this.calls >= this.maxCalls) throw new Error(`Gemini call budget (${this.maxCalls}/run) exhausted`);
    this.calls++;
    const model = opts?.model === "mockup" ? this.mockup : opts?.deep ? this.deep : this.fast;
    try {
      return await this.generate(model, prompt, opts?.json ?? false);
    } catch (err) {
      if (model !== this.fast && isRetryableWithFastModel(err)) {
        logEvent({ stage: "analyze", kind: "llm-fallback", data: { from: model, to: this.fast, error: String(err).slice(0, 160) } });
        return await this.generate(this.fast, prompt, opts?.json ?? false);
      }
      throw err;
    }
  }

  private async generate(model: string, prompt: string, json: boolean): Promise<string> {
    const started = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            ...(json ? { responseMimeType: "application/json" } : {}),
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!res.ok) {
      if (isQuotaStatus(res.status)) {
        const detail = await res.text().catch(() => "");
        await reportProviderQuota("gemini", res.status, `${model}: ${detail}`, { experimentId: this.experimentId, stage: "llm" });
      }
      throw new Error(`Gemini ${model} failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const usage = data.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? Math.ceil(prompt.length / 4);
    const outputTokens = usage.candidatesTokenCount ?? 0;
    this.usage.calls++;
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.totalTokens += usage.totalTokenCount ?? inputTokens + outputTokens;
    logEvent({
      experimentId: this.experimentId,
      stage: "llm",
      kind: "llm-call",
      data: {
        model,
        inputTokens,
        outputTokens,
        totalTokens: usage.totalTokenCount ?? inputTokens + outputTokens,
        durationMs: Date.now() - started,
        estimated: !data.usageMetadata,
      },
    });
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }
}

/** Quota (429), missing model (404) or 5xx on the deep model: degrade to the fast model instead of silently losing findings. */
function isRetryableWithFastModel(err: unknown): boolean {
  return /failed: (429|404|5\d\d)/.test(String(err));
}

/** Deterministic offline stand-in: structured responses keyed by prompt shape. */
export class FixtureLlmClient implements LlmClient {
  readonly name = "gemini-fixture";
  private calls = 0;

  usageReport(): TokenUsage {
    return { calls: this.calls, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: true };
  }

  async complete(prompt: string): Promise<string> {
    this.calls++;
    if (prompt.includes("ASSERTION_LIST")) {
      // Goal object (last content word, e.g. "schedule") must be reached as a page.
      const filler = new Set(["find", "the", "a", "an", "to", "for", "of", "get", "see", "view", "check", "locate", "look", "page", "out", "where", "how", "what", "and", "or", "in", "on", "with", "up", "join", "sign", "start", "request", "understand", "does", "it", "this", "their", "its", "product"]);
      const words = (prompt.match(/GOAL:(.*)/)?.[1] ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !filler.has(w));
      const target = words[words.length - 1];
      return JSON.stringify(target ? [{ kind: "url-matches", value: target }] : []);
    }
    if (prompt.includes("FINDINGS_JSON")) {
      return JSON.stringify({ findings: [] });
    }
    return "";
  }
}

export function selectLlm(): LlmClient {
  if (process.env.GEMINI_API_KEY) {
    try {
      return new GeminiClient();
    } catch {
      /* fall through */
    }
  }
  return new FixtureLlmClient();
}
