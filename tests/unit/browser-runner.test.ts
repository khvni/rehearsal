import { describe, expect, it } from "vitest";
import { brightDataBrowserEndpoint, cdpConnectOptions } from "../../src/lib/browser/brightdata";
import { errorText, redactSecrets } from "../../src/lib/browser/types";
import { runnerName, selectRunner } from "../../src/lib/browser/runner";
import { stagehandModelFromEnv } from "../../src/lib/browser/stagehand";

describe("selectRunner", () => {
  it("falls back to local Playwright with no keys", () => {
    expect(runnerName({})).toBe("local-playwright");
  });

  it("prefers Bright Data Browser API when its CDP endpoint is configured", () => {
    expect(runnerName({ BRIGHTDATA_BROWSER_WS: "wss://u:p@brd.superproxy.io:9222" })).toBe("brightdata-browser-api");
  });

  it("uses Stagehand on Browserbase when only Browserbase keys exist", () => {
    expect(runnerName({ BROWSERBASE_API_KEY: "bb_test" })).toBe("stagehand-browserbase");
  });

  it("splits capture (Bright Data) and trajectories (Stagehand) when both are configured", () => {
    const env = { BRIGHTDATA_BROWSER_USER: "brd-customer-x-zone-y", BRIGHTDATA_BROWSER_PASSWORD: "pw", BROWSERBASE_API_KEY: "bb" };
    expect(runnerName(env)).toBe("brightdata-browser-api+stagehand-browserbase");
  });

  it("honours REHEARSAL_BROWSER and falls back when the forced backend has no keys", () => {
    expect(runnerName({ REHEARSAL_BROWSER: "playwright", BROWSERBASE_API_KEY: "bb" })).toBe("local-playwright");
    expect(runnerName({ REHEARSAL_BROWSER: "brightdata" })).toBe("local-playwright");
    expect(runnerName({ REHEARSAL_BROWSER: "stagehand-local" })).toBe("stagehand-local");
    expect(selectRunner({}).name).toBe("local-playwright");
  });
});

describe("vendor config helpers", () => {
  it("builds the Bright Data wss URL from zone credentials", () => {
    expect(brightDataBrowserEndpoint({ BRIGHTDATA_BROWSER_USER: "brd-customer-c-zone-z", BRIGHTDATA_BROWSER_PASSWORD: "p@ss" })).toBe(
      "wss://brd-customer-c-zone-z:p%40ss@brd.superproxy.io:9222",
    );
    expect(brightDataBrowserEndpoint({})).toBeNull();
  });

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
  it("moves CDP URL credentials into a Basic auth header", () => {
    const { wsEndpoint, headers } = cdpConnectOptions("wss://brd-customer-c-zone-z:p%40ss@brd.superproxy.io:9222");
    expect(wsEndpoint).toBe("wss://brd.superproxy.io:9222/");
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("brd-customer-c-zone-z:p%40ss").toString("base64")}`);
    expect(cdpConnectOptions("wss://brd.superproxy.io:9222")).toEqual({ wsEndpoint: "wss://brd.superproxy.io:9222", headers: {} });
  });

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
