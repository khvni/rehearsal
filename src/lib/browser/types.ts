import type { Assertion, AssertionProbe, BrowserRun, EnvVars, Viewport } from "../contracts";

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

const URL_USERINFO_RE = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const SECRET_ENV_RE = /PASSWORD|SECRET|TOKEN|API_KEY|_WS$/;
const MIN_SECRET_LENGTH = 4;

function secretValues(env: EnvVars): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !SECRET_ENV_RE.test(name)) continue;
    const candidates = [value];
    try {
      const url = new URL(value);
      candidates.push(url.password, decodeURIComponent(url.password));
    } catch {
      // Not a URL; the raw value is enough.
    }
    for (const c of candidates) {
      if (c.length < MIN_SECRET_LENGTH) continue;
      values.add(c);
      values.add(encodeURIComponent(c));
    }
  }
  return [...values].sort((a, b) => b.length - a.length);
}

/** Strip URL credentials (`scheme://user:pass@`) and known secret env values from text. */
export function redactSecrets(text: string, env: EnvVars = process.env): string {
  let out = text.replace(URL_USERINFO_RE, "$1[REDACTED]@");
  for (const secret of secretValues(env)) out = out.split(secret).join("[REDACTED]");
  return out;
}

/** Error text safe to store in a BrowserRun (and return from the API): redacted, then truncated. */
export function errorText(e: unknown, max = 200, env: EnvVars = process.env): string {
  return redactSecrets(String(e), env).slice(0, max);
}
