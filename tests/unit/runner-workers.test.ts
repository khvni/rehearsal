import { describe, expect, it } from "vitest";
import { selectRunner } from "@/lib/browser/runner";

/** workerd can never evaluate playwright/stagehand-local — selection must refuse them outright. */
describe("selectRunner on Workers", () => {
  const env = (pref?: string) => ({ REHEARSAL_BROWSER: pref, BROWSERBASE_API_KEY: "key", BROWSERBASE_FUNCTION_ID: "fn" });

  it.each(["playwright", "stagehand-local", "stagehand"] as const)(
    "REHEARSAL_BROWSER=%s returns UnavailableRunner instead of a local browser",
    (pref) => {
      expect(selectRunner(env(pref), true).name).toBe("no-browser");
    },
  );

  it("browserbase-function still picks the Function runner when keys exist", () => {
    expect(selectRunner(env("browserbase-function"), true).name).toBe("browserbase-function");
  });

  it("auto without keys stays UnavailableRunner; the same prefs still work off-Workers", () => {
    expect(selectRunner({ REHEARSAL_BROWSER: "auto" }, true).name).toBe("no-browser");
    expect(selectRunner(env("playwright"), false).name).toBe("local-playwright");
    expect(selectRunner(env("stagehand"), false).name).not.toBe("no-browser");
  });
});
