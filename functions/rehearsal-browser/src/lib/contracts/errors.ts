import { z } from "zod";

// Run failures: a fixed set of codes so every failure names its cause (src/lib/errors.ts).

export const ErrorCode = z.enum([
  /** No browser can start on this runtime (e.g. workerd with no remote browser configured). */
  "BROWSER_UNAVAILABLE",
  /** The remote browser (Browserbase session or Function invocation) failed or timed out. */
  "BROWSER_REMOTE_FAILED",
  "NAV_TIMEOUT",
  /** DNS, TLS or connection failure (net::ERR_*, ENOTFOUND, ECONNREFUSED…). */
  "NAV_FAILED",
  "HTTP_STATUS",
  "NON_HTML",
  "REDIRECT_OFF_ORIGIN",
  /** assertPublicUrl refused the URL (private IP, blocked host or protocol). */
  "EGRESS_BLOCKED",
  "ROBOTS_DISALLOWED",
  /** Anti-bot challenge or captcha page instead of the site. */
  "BOT_CHALLENGE",
  /** Discovery finished with zero states: every page load failed. */
  "DISCOVERY_EMPTY",
  /** A provider (Browserbase Function/fetch, LLM, Jev) is out of quota or rate-limited — 402/429 patterns. */
  "PROVIDER_QUOTA",
  /** A stage consumed its per-step budget cap — the runtime (e.g. Workers waitUntil) cannot finish it and retrying cannot help. */
  "STAGE_TIMEOUT",
  "UNKNOWN",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const RunFailure = z.object({
  code: ErrorCode,
  stage: z.string(),
  message: z.string(),
  url: z.string().optional(),
});
export type RunFailure = z.infer<typeof RunFailure>;
