import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { isExperimentId } from "../contracts";

/**
 * Telemetry — Sentry (DSN-gated, lazily imported) + a structured JSONL event
 * log per experiment. No keys => Sentry stays off, event log still records.
 */
let sentry: typeof import("@sentry/nextjs") | null = null;
let sentryTried = false;

// Sentry 11 collects user info, cookies, bodies and DB/GenAI payloads unless told otherwise;
// pin the v10 (sendDefaultPii off) baseline.
const PII_HEADER_DENY = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };
const V10_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: PII_HEADER_DENY, response: PII_HEADER_DENY },
  httpBodies: [],
  urlQueryParams: PII_HEADER_DENY,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies NonNullable<Parameters<typeof import("@sentry/nextjs").init>[0]>["dataCollection"];

/** Lazily init the server SDK once (instrumentation.ts, API routes, scripts). Null when SENTRY_DSN is unset. */
export async function getSentry() {
  if (sentryTried) return sentry;
  sentryTried = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    sentry = await import("@sentry/nextjs");
    if (!sentry.getClient()) {
      sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
        dataCollection: V10_DATA_COLLECTION,
      });
    }
  } catch {
    sentry = null;
  }
  return sentry;
}

interface TraceContext {
  experimentId: string;
  targetUrl?: string;
}

/** Tags every span and captured failure carries: stage, experimentId, targetHost. */
export function traceTags(stage: string, ctx: TraceContext): Record<string, string> {
  let targetHost = "unknown";
  try {
    if (ctx.targetUrl) targetHost = new URL(ctx.targetUrl).host;
  } catch {
    /* keep "unknown" */
  }
  return { stage, experimentId: ctx.experimentId, targetHost };
}

const LOG_DIR = path.join(process.cwd(), "data", "events");

interface TelemetryEvent {
  experimentId?: string;
  stage: string;
  kind: string;
  data?: Record<string, unknown>;
  at?: string;
}

export function logEvent(e: TelemetryEvent): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(
      path.join(LOG_DIR, `${isExperimentId(e.experimentId) ? e.experimentId : "global"}.jsonl`),
      JSON.stringify({ ...e, at: e.at ?? new Date().toISOString() }) + "\n",
    );
  } catch {
    /* telemetry must never break the pipeline */
  }
}

export async function captureError(
  error: unknown,
  context?: Record<string, unknown>,
  opts: { tags?: Record<string, string>; level?: "error" | "warning" } = {},
): Promise<void> {
  logEvent({
    experimentId: opts.tags?.experimentId,
    stage: opts.tags?.stage ?? "error",
    kind: opts.level === "warning" ? "warning" : "exception",
    data: { error: String(error).slice(0, 300), ...opts.tags, ...context },
  });
  const s = await getSentry();
  if (s) s.captureException(error, { tags: opts.tags, extra: context, level: opts.level ?? "error" });
}

type QuotaProvider = "gemini" | "ramp-router" | "browserbase" | "firecrawl" | "jev";

/** HTTP statuses providers use for "out of credits / over quota". */
export const isQuotaStatus = (status: number) => status === 402 || status === 429;

const QUOTA_REPORT_INTERVAL_MS = 10 * 60_000;
const quotaReportedAt = new Map<string, number>();

/** Test hook: forget which provider quota errors were already reported. */
export function resetProviderQuotaReports(): void {
  quotaReportedAt.clear();
}

/**
 * A provider refused a call for billing/quota (402/429). Callers usually fall back
 * (plain fetch, templates), so this reports it explicitly: one Sentry issue per
 * provider + status, tagged `provider_quota` for the quota alert rule
 * (docs/telemetry.md). At most once per provider + status per 10 minutes per isolate.
 * `detail` names the call (model, API path), never a response body: bodies can echo inputs.
 */
export async function reportProviderQuota(
  provider: QuotaProvider,
  status: number,
  detail: string,
  ctx: { experimentId?: string; stage?: string } = {},
): Promise<void> {
  const key = `${provider}:${status}`;
  const last = quotaReportedAt.get(key);
  if (last !== undefined && Date.now() - last < QUOTA_REPORT_INTERVAL_MS) return;
  quotaReportedAt.set(key, Date.now());
  const label = status === 402 ? "402 Payment Required" : status === 429 ? "429 Too Many Requests" : String(status);
  const message = `${provider} quota or billing limit hit: ${label}`;
  logEvent({ experimentId: ctx.experimentId, stage: ctx.stage ?? "provider", kind: "provider-quota", data: { provider, status, detail: detail.slice(0, 120) } });
  try {
    const s = await getSentry();
    if (!s) return;
    const error = new Error(message);
    error.name = "ProviderQuotaError";
    s.captureException(error, {
      level: "error",
      fingerprint: ["provider-quota", provider, String(status)],
      tags: {
        provider_quota: provider,
        http_status: String(status),
        ...(ctx.stage ? { stage: ctx.stage } : {}),
        ...(ctx.experimentId ? { experimentId: ctx.experimentId } : {}),
      },
      extra: { detail: detail.slice(0, 120) },
    });
  } catch {
    /* telemetry must never break the pipeline */
  }
}

/** Run `fn` inside a Sentry span when enabled; always logs stage timings. */
export async function withTrace<T>(stage: string, ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  const { experimentId } = ctx;
  const tags = traceTags(stage, ctx);
  const started = Date.now();
  const s = await getSentry();
  const run = async (): Promise<T> => {
    try {
      const result = await fn();
      logEvent({ experimentId, stage, kind: "ok", data: { durationMs: Date.now() - started } });
      return result;
    } catch (e) {
      await captureError(e, undefined, { tags });
      logEvent({ experimentId, stage, kind: "fail", data: { durationMs: Date.now() - started } });
      throw e;
    }
  };
  if (s) {
    return s.startSpan({ name: `rehearsal.${stage}`, op: "rehearsal.stage", attributes: tags }, run);
  }
  return run();
}
