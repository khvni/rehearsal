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
