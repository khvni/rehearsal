import type { BrowserRunner, EnvVars, RunnerPreference } from "../contracts";
import { extractPage } from "./extract";
import { BrowserbaseFunctionRunner, UnavailableRunner } from "./function-runner";
import { PlaywrightRunner, checkAssertion } from "./playwright";
import { chromiumSandboxEnabled } from "./sandbox";
import { StagehandRunner, stagehandModelFromEnv } from "./stagehand";

/** workerd (Cloudflare Workers) can neither launch Chromium nor run Stagehand in-process. */
export function onWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * Pick a browser backend from env. `auto` (default) never spends hosted quota — discovery
 * crawls with the plain fetcher (+ Firecrawl fallback) and auto always picks the local
 * Playwright Chromium here (UnavailableRunner on workerd, which can't launch a browser).
 * REHEARSAL_BROWSER is the opt-in switch for the hosted Browserbase backends:
 *   browserbase-function: BROWSERBASE_API_KEY + BROWSERBASE_FUNCTION_ID (the only backend on workerd)
 *   stagehand:            BROWSERBASE_API_KEY (in-process Stagehand)
 *   stagehand-local:      Stagehand on a local Chrome (STAGEHAND_CHROME_PATH)
 *   playwright:           local Chromium
 * A forced backend with missing keys falls back to local Playwright.
 */
export function selectRunner(env: EnvVars = process.env, workers = onWorkersRuntime()): BrowserRunner {
  const pref = (env.REHEARSAL_BROWSER ?? "auto") as RunnerPreference;
  const bbKey = env.BROWSERBASE_API_KEY;
  const fnId = env.BROWSERBASE_FUNCTION_ID;
  const model = stagehandModelFromEnv(env);
  const sandbox = chromiumSandboxEnabled(env);
  const playwright = () => new PlaywrightRunner(undefined, sandbox);
  const fn = () => new BrowserbaseFunctionRunner({ apiKey: bbKey!, functionId: fnId!, extensionId: env.BROWSERBASE_EXTENSION_ID || undefined });
  const browserbase = () =>
    new StagehandRunner({
      env: "browserbase",
      browserbaseApiKey: bbKey,
      browserbaseProjectId: env.BROWSERBASE_PROJECT_ID,
      browserbaseExtensionId: env.BROWSERBASE_EXTENSION_ID || undefined,
      model,
    });

  const noLocal = (which: string) =>
    new UnavailableRunner(
      `${which} cannot run inside workerd (playwright never evaluates on Workers) — use BROWSERBASE_FUNCTION_ID, or unset it for BROWSERBASE_API_KEY + BROWSERBASE_FUNCTION_ID`,
    );
  switch (pref) {
    case "playwright":
      return workers ? noLocal("REHEARSAL_BROWSER=playwright") : playwright();
    case "browserbase-function":
      return bbKey && fnId ? fn() : workers ? noLocal("REHEARSAL_BROWSER=browserbase-function without BROWSERBASE keys") : playwright();
    case "stagehand":
      return bbKey && !workers ? browserbase() : workers ? noLocal("REHEARSAL_BROWSER=stagehand") : playwright();
    case "stagehand-local":
      return workers
        ? noLocal("REHEARSAL_BROWSER=stagehand-local")
        : new StagehandRunner({ env: "local", executablePath: env.STAGEHAND_CHROME_PATH || undefined, chromiumSandbox: sandbox, model });
    default:
      if (workers) {
        return new UnavailableRunner(
          "No browser can run inside workerd: set REHEARSAL_BROWSER=browserbase-function with BROWSERBASE_API_KEY + BROWSERBASE_FUNCTION_ID",
        );
      }
      return playwright();
  }
}

/** REHEARSAL_VERIFY_AGENT opts the verify stage into agent-driven runs (runAgentTask) when the runner supports it. */
export function agentVerifyEnabled(env: EnvVars = process.env): boolean {
  const v = env.REHEARSAL_VERIFY_AGENT;
  return !!v && v !== "0" && v.toLowerCase() !== "false";
}

/** Telemetry label for the runner `selectRunner()` would pick from the current env. */
export function runnerName(env: EnvVars = process.env): string {
  return selectRunner(env).name;
}

export { BrowserbaseFunctionRunner, PlaywrightRunner, StagehandRunner, UnavailableRunner, checkAssertion, extractPage };
