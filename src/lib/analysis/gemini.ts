import type { LlmClient } from "../contracts";

/**
 * Gemini API client — REST over generativelanguage (stable across SDK churn).
 * Models: gemini-4-hydrogen (fast/cheap structured calls), gemini-4-argon
 * (findings, recommendations, spec generation).
 */
export class GeminiClient implements LlmClient {
  readonly name = "gemini";
  private apiKey: string;
  private fast: string;
  private deep: string;
  private maxCalls: number;
  private calls = 0;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? "";
    this.fast = process.env.GEMINI_MODEL_FAST ?? "gemini-4-hydrogen";
    this.deep = process.env.GEMINI_MODEL_DEEP ?? "gemini-4-argon";
    const max = Number(process.env.REHEARSAL_GEMINI_MAX_CALLS ?? 2);
    this.maxCalls = Number.isFinite(max) && max >= 0 ? max : 2;
    if (!this.apiKey) throw new Error("GeminiClient requires GEMINI_API_KEY");
  }

  resetBudget(): void {
    this.calls = 0;
  }

  /** Over budget throws; every caller already falls back to its deterministic path on error. */
  async complete(prompt: string, opts?: { deep?: boolean; json?: boolean }): Promise<string> {
    if (this.calls >= this.maxCalls) throw new Error(`Gemini call budget (${this.maxCalls}/run) exhausted`);
    this.calls++;
    const model = opts?.deep ? this.deep : this.fast;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            ...(opts?.json ? { responseMimeType: "application/json" } : {}),
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!res.ok) throw new Error(`Gemini ${model} failed: ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }
}

/** Deterministic offline stand-in: structured responses keyed by prompt shape. */
export class FixtureLlmClient implements LlmClient {
  readonly name = "gemini-fixture";

  async complete(prompt: string): Promise<string> {
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
