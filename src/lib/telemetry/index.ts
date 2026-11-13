import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Telemetry — Sentry (DSN-gated, lazily imported) + a structured JSONL event
 * log per experiment. No keys => Sentry stays off, event log still records.
 */
let sentry: typeof import("@sentry/nextjs") | null = null;
let sentryTried = false;

/** Lazily init the server SDK once (instrumentation.ts, API routes, scripts). Null when SENTRY_DSN is unset. */
export async function getSentry() {
  if (sentryTried) return sentry;
  sentryTried = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    sentry = await import("@sentry/nextjs");
    if (!sentry.getClient()) {
      sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2) });
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
      path.join(LOG_DIR, `${e.experimentId ?? "global"}.jsonl`),
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
