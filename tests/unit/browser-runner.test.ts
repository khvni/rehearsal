import { describe, expect, it } from "vitest";
import { errorText, redactSecrets } from "../../src/lib/browser/types";
import { runnerName, selectRunner } from "../../src/lib/browser/runner";
import { chromiumSandboxEnabled } from "../../src/lib/browser/sandbox";
import { stagehandModelFromEnv } from "../../src/lib/browser/stagehand";

describe("selectRunner", () => {
  it("falls back to local Playwright with no keys", () => {
    expect(selectRunner({}, false).name).toBe("local-playwright");
  });

  it("uses Stagehand on Browserbase when only Browserbase keys exist", () => {
    expect(runnerName({ BROWSERBASE_API_KEY: "bb_test" })).toBe("stagehand-browserbase");
  });

  it("uses the Browserbase Function when its id is configured", () => {
    expect(runnerName({ BROWSERBASE_API_KEY: "bb", BROWSERBASE_FUNCTION_ID: "fn" })).toBe("browserbase-function");
  });

  it("honours REHEARSAL_BROWSER and falls back when the forced backend has no keys", () => {
    expect(runnerName({ REHEARSAL_BROWSER: "playwright", BROWSERBASE_API_KEY: "bb" })).toBe("local-playwright");
    expect(runnerName({ REHEARSAL_BROWSER: "browserbase-function", BROWSERBASE_API_KEY: "bb" })).toBe("local-playwright");
    expect(runnerName({ REHEARSAL_BROWSER: "stagehand-local" })).toBe("stagehand-local");
    expect(selectRunner({}).name).toBe("local-playwright");
  });
});

describe("vendor config helpers", () => {
  it("resolves the Stagehand model from env", () => {
    expect(stagehandModelFromEnv({})).toBeUndefined();
    expect(stagehandModelFromEnv({ GEMINI_API_KEY: "g" })).toEqual({ modelName: "google/gemini-4-hydrogen", apiKey: "g" });
    expect(stagehandModelFromEnv({ STAGEHAND_MODEL: "openai/gpt-5", STAGEHAND_MODEL_API_KEY: "k" })).toEqual({
      modelName: "openai/gpt-5",
      apiKey: "k",
    });
  });
});

describe("credential redaction", () => {
  it("strips URL userinfo from runner errors", () => {
    const e = new Error("browserType.connectOverCDP: WebSocket error: wss://u:hunter2@brd.superproxy.io:9222/ 403 Forbidden");
    const out = errorText(e, 200, {});
    expect(out).not.toContain("hunter2");
    expect(out).toContain("wss://[REDACTED]@brd.superproxy.io:9222/");
  });

  it("removes known secret env values even outside URLs, raw or percent-encoded", () => {
    const env = { BRIGHTDATA_BROWSER_PASSWORD: "p@ss-word", BROWSERBASE_API_KEY: "bb_live_123", BRIGHTDATA_BROWSER_WS: "wss://u:zonepw9@host" };
    const out = redactSecrets("auth p@ss-word / p%40ss-word failed; key=bb_live_123; zonepw9", env);
    for (const leaked of ["p@ss-word", "p%40ss-word", "bb_live_123", "zonepw9"]) expect(out).not.toContain(leaked);
  });

  it("redacts before truncating so no partial secret survives the cut", () => {
    const e = `run: ${"x".repeat(180)} wss://user:secretpassword@brd.superproxy.io:9222`;
    expect(errorText(e, 200, {})).not.toMatch(/secret/);
  });
});

describe("chromiumSandboxEnabled", () => {
  it("keeps the Chromium sandbox on unless REHEARSAL_CHROMIUM_NO_SANDBOX=1", () => {
    expect(chromiumSandboxEnabled({})).toBe(true);
    expect(chromiumSandboxEnabled({ REHEARSAL_CHROMIUM_NO_SANDBOX: "0" })).toBe(true);
    expect(chromiumSandboxEnabled({ REHEARSAL_CHROMIUM_NO_SANDBOX: "1" })).toBe(false);
  });
});
