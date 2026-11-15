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
 * Pick a browser backend from env. Priority (auto):
 *   1. Browserbase Function (BROWSERBASE_API_KEY + BROWSERBASE_FUNCTION_ID): Stagehand runs next to
 *      its Browserbase session; the only backend that works on workerd.
 *   2. On workerd without it: UnavailableRunner, so every page fails with BROWSER_UNAVAILABLE.
 *   3. Stagehand on Browserbase in-process (BROWSERBASE_API_KEY), for Node hosts.
 *   4. Local Playwright Chromium — zero keys, used by dev/evals/e2e.
 * REHEARSAL_BROWSER forces one backend; it falls back to local Playwright if its keys are missing.
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
      if (bbKey && fnId) return fn();
      if (workers) {
        return new UnavailableRunner(
          bbKey
            ? "No remote browser configured: BROWSERBASE_FUNCTION_ID is not set on this Worker (Stagehand cannot run inside workerd)"
            : "No remote browser configured: set BROWSERBASE_API_KEY and BROWSERBASE_FUNCTION_ID on this Worker",
        );
      }
      if (bbKey) return browserbase();
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
