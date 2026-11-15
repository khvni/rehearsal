import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiClient, selectLlm } from "../../src/lib/analysis/gemini";
import { llmPageSource, OpenRouterClient } from "../../src/lib/analysis/openrouter";

function orResponse(text: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model: "google/gemini-4-hydrogen",
      provider: "Google",
      choices: [{ message: { role: "assistant", content: text } }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15, cost: 0.0001 },
      ...extra,
    }),
  );
}

function lastBody(fetchMock: ReturnType<typeof vi.fn>, call = -1) {
  const calls = fetchMock.mock.calls;
  const [, init] = calls.at(call) as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("selectLlm provider order", () => {
  it("picks OpenRouter when OPENROUTER_API_KEY is set, else Gemini, else the fixture", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(selectLlm().name).toBe("gemini-fixture");
    vi.stubEnv("GEMINI_API_KEY", "g");
    expect(selectLlm()).toBeInstanceOf(GeminiClient);
    vi.stubEnv("OPENROUTER_API_KEY", "r");
    expect(selectLlm()).toBeInstanceOf(OpenRouterClient);
  });

  it("labels LLM-written pages by provider", () => {
    expect(llmPageSource({ name: "openrouter", complete: async () => "" })).toBe("openrouter");
    expect(llmPageSource({ name: "gemini", complete: async () => "" })).toBe("gemini");
  });
});

describe("OpenRouterClient", () => {
  it("posts a chat completion with bearer auth and returns the message text", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    const fetchMock = vi.fn(async () => orResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new OpenRouterClient();
    llm.resetBudget({ experimentId: "exp-1" });
    await expect(llm.complete("hi", { json: true })).resolves.toBe('{"ok":true}');
    expect(lastBody(fetchMock)).not.toHaveProperty("response_format");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer or-test");
    expect(lastBody(fetchMock)).toMatchObject({
      model: "google/gemini-4-hydrogen",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(llm.usageReport()).toEqual({ calls: 1, inputTokens: 12, outputTokens: 3, totalTokens: 15 });
  });

  it("sends deep and mockup calls with a fallback list ending in the fast model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubEnv("OPENROUTER_MODEL_MOCKUP", "claude-design");
    const fetchMock = vi.fn(async () => orResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new OpenRouterClient();
    await expect(llm.complete("a", { deep: true })).resolves.toBe("ok");
    expect(lastBody(fetchMock)).toMatchObject({ models: ["google/gemini-4-argon", "google/gemini-4-hydrogen"] });
    expect(lastBody(fetchMock)).not.toHaveProperty("model");
    expect(lastBody(fetchMock)).not.toHaveProperty("response_format");
    await llm.complete("b", { deep: true, model: "mockup" });
    expect(lastBody(fetchMock)).toMatchObject({ models: ["claude-design", "google/gemini-4-hydrogen"] });
    await llm.complete("c", { deep: true, json: true, model: "rebuild" });
    expect(lastBody(fetchMock)).toMatchObject({ models: ["google/gemini-3.8-flash", "google/gemini-4-hydrogen"] });
  });

  it("surfaces non-2xx errors so callers fall back", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(new OpenRouterClient().complete("b")).rejects.toThrow(/OpenRouter google\/gemini-4-hydrogen failed: 429/);
  });

  it("treats an error body on a 200 as a failure", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 502, message: "upstream" } }))));
    await expect(new OpenRouterClient().complete("b")).rejects.toThrow(/failed: 502/);
  });

  it("caps calls per run at REHEARSAL_GEMINI_MAX_CALLS and resets per run", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubEnv("REHEARSAL_GEMINI_MAX_CALLS", "1");
    const fetchMock = vi.fn(async () => orResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new OpenRouterClient();
    await llm.complete("a");
    await expect(llm.complete("b")).rejects.toThrow(/budget/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    llm.resetBudget();
    await expect(llm.complete("c")).resolves.toBe("ok");
    expect(llm.usageReport().calls).toBe(1);
  });

  it("throws without a key so selectLlm falls through", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(() => new OpenRouterClient()).toThrow(/OPENROUTER_API_KEY/);
  });
});
