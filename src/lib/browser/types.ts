import type { Assertion, BrowserRun, DomPatch, Viewport } from "../contracts";

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
  screenshotPath: string;
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

export async function evaluateAssertion(probe: AssertionProbe, a: Assertion): Promise<boolean> {
  try {
    switch (a.kind) {
      case "text-present":
        return (await probe.bodyText()).toLowerCase().includes(a.value.toLowerCase());
      case "text-absent":
        return !(await probe.bodyText()).toLowerCase().includes(a.value.toLowerCase());
      case "element-visible":
        return a.selector ? await probe.isVisible(a.selector) : false;
      case "element-present":
        return a.selector ? (await probe.count(a.selector)) > 0 : false;
      case "title-matches":
        return (await probe.title()).toLowerCase().includes(a.value.toLowerCase());
      case "url-matches":
        return (await probe.url()).toLowerCase().includes(a.value.toLowerCase());
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export function summarizeRun(args: {
  runId: string;
  viewport: Viewport;
  started: number;
  steps: BrowserRun["steps"];
  assertions: BrowserRun["assertions"];
  errors: string[];
  screenshots: string[];
}): BrowserRun {
  const failedAssertions = args.assertions.filter((a) => !a.passed).length;
  return {
    runId: args.runId,
    viewport: args.viewport,
    success: args.errors.length === 0 && failedAssertions === 0 && args.steps.every((s) => s.ok),
    steps: args.steps,
    assertions: args.assertions,
    errors: args.errors,
    screenshotPaths: args.screenshots,
    durationMs: Date.now() - args.started,
  };
}

/** Screenshot after every third step and after the last one. */
export function shouldShoot(i: number, total: number): boolean {
  return i % 3 === 2 || i === total - 1;
}

export type EnvVars = Record<string, string | undefined>;
