import type { ErrorCode, RunFailure } from "./contracts";
import { errorText } from "./browser/types";

/** An error that already knows its code; thrown where the cause is known. */
export class RehearsalError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly url?: string,
  ) {
    super(message);
    this.name = "RehearsalError";
  }
}

/** The submitted target URL was rejected (unparseable, blocked, private or unresolvable): the caller's fault, not ours. */
export class InvalidTargetError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "InvalidTargetError";
  }
}

/** Ordered: first match wins, so specific patterns precede generic ones. */
const PATTERNS: [ErrorCode, RegExp][] = [
  ["PROVIDER_QUOTA", /\b402\b|payment required|\b429\b|too many requests|rate.?limit|quota (exceeded|exhausted)|insufficient (credits|funds|balance)/i],
  ["EGRESS_BLOCKED", /Blocked (private IP|hostname|protocol)|resolves to private IP|egress proxy refused/i],
  ["ROBOTS_DISALLOWED", /robots\.txt/i],
  ["REDIRECT_OFF_ORIGIN", /Redirected off-origin|off-origin redirect/i],
  ["NON_HTML", /Non-HTML response/i],
  ["BOT_CHALLENGE", /captcha|cf-chl|challenge page|Just a moment|Attention Required|Access denied/i],
  [
    "BROWSER_UNAVAILABLE",
    /Executable doesn't exist|Failed to launch|browserType\.launch|spawn .*ENOENT|not implemented on this runtime|No remote browser/i,
  ],
  ["BROWSER_REMOTE_FAILED", /Browserbase|Stagehand initialization|CDP|Target page, context or browser has been closed/i],
  ["NAV_TIMEOUT", /Timeout \d+ms exceeded|timed out|TimeoutError/i],
  ["NAV_FAILED", /net::ERR_|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|did not resolve|fetch failed$/i],
  ["HTTP_STATUS", /\b(HTTP|status|failed)[ :]+[45]\d\d\b/i],
];

export function classifyError(e: unknown): ErrorCode {
  if (e instanceof RehearsalError) return e.code;
  const text = String(e instanceof Error ? e.message : e);
  return PATTERNS.find(([, re]) => re.test(text))?.[0] ?? "UNKNOWN";
}

/** One coded, redacted failure record for `Experiment.failures`. */
export function toFailure(e: unknown, stage: string, url?: string): RunFailure {
  const message = errorText(e instanceof Error ? e.message : e, 300);
  const u = url ?? (e instanceof RehearsalError ? e.url : undefined);
  return { code: classifyError(e), stage, message, ...(u ? { url: u } : {}) };
}

/** "[CODE] message" — the readable line stored in `Experiment.errors` and shown in the dashboard. */
export function formatFailure(f: Pick<RunFailure, "code" | "message">): string {
  return f.message.startsWith(`[${f.code}]`) ? f.message : `[${f.code}] ${f.message}`;
}

/** Most frequent code among failures (ties: first seen). */
export function dominantCode(failures: RunFailure[]): ErrorCode | undefined {
  const counts = new Map<ErrorCode, number>();
  for (const f of failures) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
  let best: ErrorCode | undefined;
  for (const [code, n] of counts) if (best === undefined || n > counts.get(best)!) best = code;
  return best;
}
