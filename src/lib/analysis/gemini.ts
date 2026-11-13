/**
 * Gemini API client — REST over generativelanguage (stable across SDK churn).
 * Models: gemini-4-hydrogen (fast/cheap structured calls), gemini-4-argon
 * (findings, recommendations, spec generation).
 */
export interface LlmClient {
  readonly name: string;
  complete(prompt: string, opts?: { deep?: boolean; json?: boolean }): Promise<string>;
}

export class GeminiClient implements LlmClient {
  readonly name = "gemini";
  private apiKey: string;
  private fast: string;
  private deep: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? "";
    this.fast = process.env.GEMINI_MODEL_FAST ?? "gemini-4-hydrogen";
    this.deep = process.env.GEMINI_MODEL_DEEP ?? "gemini-4-argon";
    if (!this.apiKey) throw new Error("GeminiClient requires GEMINI_API_KEY");
  }

  async complete(prompt: string, opts?: { deep?: boolean; json?: boolean }): Promise<string> {
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
      return JSON.stringify([
        { kind: "text-present", value: prompt.match(/GOAL:(.*)/)?.[1]?.trim().split(/\s+/).slice(0, 4).join(" ") ?? "" },
      ]);
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
