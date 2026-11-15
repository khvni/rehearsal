import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ getClient: () => ({}), init: vi.fn(), captureException }));

describe("provider quota reporting", () => {
  beforeEach(() => {
    vi.resetModules();
    captureException.mockClear();
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.test/1");
    vi.stubEnv("REHEARSAL_ALLOW_PRIVATE", "1"); // fetch is mocked; skip DNS
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports a Gemini 429 to Sentry with the provider_quota tag, once per provider + status", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 })));
    const { GeminiClient } = await import("@/lib/analysis/gemini");
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const llm = new GeminiClient();
    llm.resetBudget({ experimentId: "exp_1" });
    await expect(llm.complete("a")).rejects.toThrow(/failed: 429/);
    await expect(llm.complete("b")).rejects.toThrow(/failed: 429/);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = captureException.mock.calls[0];
    expect((error as Error).name).toBe("ProviderQuotaError");
    expect(hint).toMatchObject({
      level: "error",
      fingerprint: ["provider-quota", "gemini", "429"],
      tags: { provider_quota: "gemini", http_status: "429", experimentId: "exp_1" },
    });
    expect(JSON.stringify(hint)).not.toContain("key=test");
    expect(JSON.stringify(hint)).not.toContain("RESOURCE_EXHAUSTED");
  });

  it("reports a Browserbase Function 402 and still throws PROVIDER_QUOTA", async () => {
    const { BrowserbaseFunctionRunner } = await import("@/lib/browser/function-runner");
    const { classifyError } = await import("@/lib/errors");
    const fetchImpl = (async () => new Response("Free plan browser minutes limit reached", { status: 402 })) as typeof fetch;
    const runner = new BrowserbaseFunctionRunner({ apiKey: "bb", functionId: "fn_1", fetchImpl, sleep: async () => {}, pollMs: 10, timeoutMs: 50 });
    const err = await runner.openPage("http://127.0.0.1/", { name: "desktop" as const, width: 1440, height: 900 }).catch((e) => e);
    expect(classifyError(err)).toBe("PROVIDER_QUOTA");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1]).toMatchObject({ tags: { provider_quota: "browserbase", http_status: "402" } });
  });

  it("does not report non-quota failures", async () => {
    const { FirecrawlClient } = await import("@/lib/fetch/firecrawl");
    const client = new FirecrawlClient({ FIRECRAWL_API_KEY: "fc" }, async () => new Response("boom", { status: 500 }));
    await expect(client.scrape("http://127.0.0.1/")).rejects.toThrow(/500/);
    expect(captureException).not.toHaveBeenCalled();
  });
});
