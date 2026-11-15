import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiClient, selectLlm } from "../../src/lib/analysis/gemini";
import { llmPageSource, RampRouterClient } from "../../src/lib/analysis/router";

function routerResponse(text: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model: "gemini-4-hydrogen",
      output: [
        { type: "reasoning", content: [] },
        { type: "message", content: [{ type: "output_text", text }] },
      ],
      usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15, cost: 0 },
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
  it("picks Ramp Router when RAMP_ROUTER_API_KEY is set, else Gemini, else the fixture", () => {
    vi.stubEnv("RAMP_ROUTER_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(selectLlm().name).toBe("gemini-fixture");
    vi.stubEnv("GEMINI_API_KEY", "g");
    expect(selectLlm()).toBeInstanceOf(GeminiClient);
    vi.stubEnv("RAMP_ROUTER_API_KEY", "r");
    expect(selectLlm()).toBeInstanceOf(RampRouterClient);
  });

  it("labels LLM-written pages by provider", () => {
    expect(llmPageSource({ name: "ramp-router", complete: async () => "" })).toBe("router");
    expect(llmPageSource({ name: "gemini", complete: async () => "" })).toBe("gemini");
  });
});

describe("RampRouterClient", () => {
  it("posts an OpenAI Responses request with bearer auth and returns the message text", async () => {
    vi.stubEnv("RAMP_ROUTER_API_KEY", "rk-test");
    const fetchMock = vi.fn(async () => routerResponse('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new RampRouterClient();
    llm.resetBudget({ experimentId: "exp-1" });
    await expect(llm.complete("hi", { json: true })).resolves.toBe('{"ok":true}');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.router.com/v1/responses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer rk-test");
    expect(lastBody(fetchMock)).toMatchObject({
      model: "gemini-4-hydrogen",
      input: "hi",
      text: { format: { type: "json_object" } },
      metadata: { product: "rehearsal", experiment_id: "exp-1" },
    });
    expect(llm.usageReport()).toEqual({ calls: 1, inputTokens: 12, outputTokens: 3, totalTokens: 15 });
  });

  it("sends deep and mockup calls with a fallback list ending in the fast model", async () => {
    vi.stubEnv("RAMP_ROUTER_API_KEY", "rk-test");
    vi.stubEnv("RAMP_ROUTER_MODEL_MOCKUP", "claude-design");
    const fetchMock = vi.fn(async () => routerResponse("ok", { output: undefined, output_text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new RampRouterClient();
    await expect(llm.complete("a", { deep: true })).resolves.toBe("ok");
    expect(lastBody(fetchMock)).toMatchObject({ models: ["gemini-4-argon", "gemini-4-hydrogen"] });
    expect(lastBody(fetchMock)).not.toHaveProperty("model");
    expect(lastBody(fetchMock)).not.toHaveProperty("text");
    await llm.complete("b", { deep: true, model: "mockup" });
    expect(lastBody(fetchMock)).toMatchObject({ models: ["claude-design", "gemini-4-hydrogen"] });
  });

  it("retries JSON calls without JSON mode on 501 and surfaces other errors", async () => {
    vi.stubEnv("RAMP_ROUTER_API_KEY", "rk-test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 501 }))
      .mockResolvedValueOnce(routerResponse("[]"))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new RampRouterClient();
    await expect(llm.complete("a", { json: true })).resolves.toBe("[]");
    expect(lastBody(fetchMock)).not.toHaveProperty("text");
    await expect(llm.complete("b")).rejects.toThrow(/Router gemini-4-hydrogen failed: 429/);
  });

  it("caps calls per run at REHEARSAL_GEMINI_MAX_CALLS and resets per run", async () => {
    vi.stubEnv("RAMP_ROUTER_API_KEY", "rk-test");
    vi.stubEnv("REHEARSAL_GEMINI_MAX_CALLS", "1");
    const fetchMock = vi.fn(async () => routerResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const llm = new RampRouterClient();
    await llm.complete("a");
    await expect(llm.complete("b")).rejects.toThrow(/budget/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    llm.resetBudget();
    await expect(llm.complete("c")).resolves.toBe("ok");
    expect(llm.usageReport().calls).toBe(1);
  });

  it("throws without a key so selectLlm falls through", () => {
    vi.stubEnv("RAMP_ROUTER_API_KEY", "");
    expect(() => new RampRouterClient()).toThrow(/RAMP_ROUTER_API_KEY/);
  });
});
