import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Telemetry — Sentry (DSN-gated, lazily imported) + a structured JSONL event
 * log per experiment. No keys => Sentry stays off, event log still records.
 */
let sentry: typeof import("@sentry/nextjs") | null = null;
let sentryTried = false;

async function getSentry() {
  if (sentryTried) return sentry;
  sentryTried = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    sentry = await import("@sentry/nextjs");
    sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2) });
  } catch {
    sentry = null;
  }
  return sentry;
}

const LOG_DIR = path.join(process.cwd(), "data", "events");

export interface TelemetryEvent {
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

export async function captureError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  logEvent({ stage: "error", kind: "exception", data: { error: String(error).slice(0, 300), ...context } });
  const s = await getSentry();
  if (s) s.captureException(error, { extra: context });
}

/** Run `fn` inside a Sentry span when enabled; always logs stage timings. */
export async function withTrace<T>(stage: string, experimentId: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const s = await getSentry();
  const run = async (): Promise<T> => {
    try {
      const result = await fn();
      logEvent({ experimentId, stage, kind: "ok", data: { durationMs: Date.now() - started } });
      return result;
    } catch (e) {
      await captureError(e, { experimentId, stage });
      logEvent({ experimentId, stage, kind: "fail", data: { durationMs: Date.now() - started } });
      throw e;
    }
  };
  if (s?.startSpan) {
    return s.startSpan({ name: stage }, run);
  }
  return run();
}
