import type {
  BrowserRun,
  BrowserRunner,
  DomPatch,
  EnvVars,
  OpenPageResult,
  RunnerPreference,
  TrajectoryArgs,
  Viewport,
} from "../contracts";
import { BrightDataBrowserRunner, brightDataBrowserEndpoint } from "./brightdata";
import { extractPage } from "./extract";
import { PlaywrightRunner, checkAssertion } from "./playwright";
import { chromiumSandboxEnabled } from "./sandbox";
import { StagehandRunner, stagehandModelFromEnv } from "./stagehand";

/**
 * Routes state capture and trajectories to different backends, e.g. Bright Data for
 * per-state capture (one fresh session per page) and Stagehand for multi-step runs.
 */
export class CompositeRunner implements BrowserRunner {
  readonly name: string;

  constructor(
    private capture: BrowserRunner,
    private trajectories: BrowserRunner,
  ) {
    this.name = capture === trajectories ? capture.name : `${capture.name}+${trajectories.name}`;
  }

  openPage(url: string, viewport: Viewport, opts?: { patches?: DomPatch[]; shotName?: string }): Promise<OpenPageResult> {
    return this.capture.openPage(url, viewport, opts);
  }

  runTrajectory(args: TrajectoryArgs): Promise<BrowserRun> {
    return this.trajectories.runTrajectory(args);
  }

  async close(): Promise<void> {
    await Promise.all([this.capture.close(), this.trajectories.close()]);
  }
}

/**
 * Pick a browser backend from env. Priority (auto):
 *   1. Bright Data Browser API (BRIGHTDATA_BROWSER_WS or _USER/_PASSWORD) for state capture;
 *      trajectories go to Stagehand on Browserbase when BROWSERBASE_API_KEY is set, else Bright Data.
 *   2. Stagehand on Browserbase (BROWSERBASE_API_KEY) for capture and trajectories.
 *   3. Local Playwright Chromium — zero keys, used by dev/evals/e2e.
 * REHEARSAL_BROWSER forces one backend; it falls back to local Playwright if its keys are missing.
 */
export function selectRunner(env: EnvVars = process.env): BrowserRunner {
  const pref = (env.REHEARSAL_BROWSER ?? "auto") as RunnerPreference;
  const bdEndpoint = brightDataBrowserEndpoint(env);
  const bbKey = env.BROWSERBASE_API_KEY;
  const model = stagehandModelFromEnv(env);
  const sandbox = chromiumSandboxEnabled(env);
  const playwright = () => new PlaywrightRunner(undefined, sandbox);
  const brightdata = () => new BrightDataBrowserRunner(bdEndpoint!);
  const browserbase = () =>
    new StagehandRunner({ env: "browserbase", browserbaseApiKey: bbKey, browserbaseProjectId: env.BROWSERBASE_PROJECT_ID, model });

  switch (pref) {
    case "playwright":
      return playwright();
    case "brightdata":
      return bdEndpoint ? brightdata() : playwright();
    case "stagehand":
      return bbKey ? browserbase() : playwright();
    case "stagehand-local":
      return new StagehandRunner({ env: "local", executablePath: env.STAGEHAND_CHROME_PATH || undefined, chromiumSandbox: sandbox, model });
    default:
      if (bdEndpoint) return bbKey ? new CompositeRunner(brightdata(), browserbase()) : brightdata();
      if (bbKey) return browserbase();
      return playwright();
  }
}

/** Telemetry label for the runner `selectRunner()` would pick from the current env. */
export function runnerName(env: EnvVars = process.env): string {
  return selectRunner(env).name;
}

export { BrightDataBrowserRunner, PlaywrightRunner, StagehandRunner, checkAssertion, extractPage };
