import type { Instrumentation } from "next";

// Next.js instrumentation hook: init the server Sentry SDK (no-op without SENTRY_DSN) and
// report errors thrown by route handlers / server components.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSentry } = await import("./lib/telemetry");
    await getSentry();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  const { getSentry } = await import("./lib/telemetry");
  (await getSentry())?.captureRequestError(...args);
};
