import type { ModelConfig } from "@browserbasehq/stagehand";
import type { Assertion, BrowserRun, DomPatch, Viewport } from "./index";
import type { PageMetrics } from "./metrics";

// Browser backends (src/lib/browser/*): runner interface, trajectory args and runner options.

export interface TrajectoryAction {
  actionId?: string;
  label: string;
  href?: string;
  role?: string;
}

export interface TrajectoryArgs {
  url: string;
  viewport: Viewport;
  actions: TrajectoryAction[];
  assertions: Assertion[];
  runId: string;
  patches?: DomPatch[];
  maxSteps?: number;
}

export interface OpenPageResult {
  html: string;
  /** Absent on runtimes without a writable evidence dir (e.g. workerd). */
  screenshotPath?: string;
  /** Layout metrics from the `measurePage` hook, taken in the same session as the screenshot. */
  metrics?: PageMetrics;
}

/**
 * A browser backend. `openPage` captures one state (rendered HTML + screenshot)
 * and releases its session before returning; `runTrajectory` executes a
 * multi-step action sequence and checks assertions.
 */
export interface BrowserRunner {
  readonly name: string;
  openPage(url: string, viewport: Viewport, opts?: { patches?: DomPatch[]; shotName?: string }): Promise<OpenPageResult>;
  runTrajectory(args: TrajectoryArgs): Promise<BrowserRun>;
  close(): Promise<void>;
}

/** Minimal page surface needed to evaluate assertions, implemented by every backend. */
export interface AssertionProbe {
  bodyText(): Promise<string>;
  isVisible(selector: string): Promise<boolean>;
  count(selector: string): Promise<number>;
  title(): Promise<string>;
  url(): Promise<string>;
}

export type EnvVars = Record<string, string | undefined>;

export type RunnerPreference = "auto" | "brightdata" | "stagehand" | "stagehand-local" | "playwright";

export type StagehandEnv = "browserbase" | "local";

export interface StagehandRunnerOptions {
  env: StagehandEnv;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  /** Local Chrome/Chromium binary for env=local (Stagehand does not bundle a browser). */
  executablePath?: string;
  model?: ModelConfig;
  evidenceDir?: string;
}

export interface PlaywrightStepOptions {
  /** Navigation timeout for goto/load waits. */
  navTimeoutMs: number;
  /** Prefer clicking a same-origin link over page.goto (keeps remote sessions on one in-page flow). */
  preferClick: boolean;
}

/** Anything with a string-expression `evaluate` — Playwright pages (local or CDP) and Stagehand pages. */
export interface EvaluatingPage {
  evaluate(expression: string): Promise<unknown>;
}
