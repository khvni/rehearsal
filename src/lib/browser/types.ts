import type { Assertion, AssertionProbe, BrowserRun, Viewport } from "../contracts";

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
  const navigationCompleted = args.steps.every((s) => s.ok) && !args.errors.some(isRunError);
  return {
    runId: args.runId,
    viewport: args.viewport,
    // Real sites always log some console noise; it is reported via consoleErrorCount instead.
    success: navigationCompleted && failedAssertions === 0,
    steps: args.steps,
    assertions: args.assertions,
    errors: args.errors,
    consoleErrorCount: args.errors.filter((e) => !isRunError(e)).length,
    screenshotPaths: args.screenshots,
    durationMs: Date.now() - args.started,
  };
}

/** `run:` errors mean the runner itself failed (navigation/timeout), not the page. */
export function isRunError(error: string): boolean {
  return error.startsWith("run:");
}

/** Screenshot after every third step and after the last one. */
export function shouldShoot(i: number, total: number): boolean {
  return i % 3 === 2 || i === total - 1;
}
