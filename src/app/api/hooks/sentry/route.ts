import { NextResponse } from "next/server";
import { logEvent } from "@/lib/telemetry";
import { parseSentryAlert, upsertFirstResponderIssue, verifySentrySignature } from "@/lib/telemetry/sentry-hook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sentry internal-integration webhook (issue alerts + issue events) → GitHub first-responder issue. */
export async function POST(req: Request) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    logEvent({ stage: "sentry-hook", kind: "notice", data: { message: "SENTRY_WEBHOOK_SECRET unset: rejecting webhook" } });
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifySentrySignature(raw, req.headers.get("sentry-hook-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const resource = req.headers.get("sentry-hook-resource");
  const alert = parseSentryAlert(resource, payload);
  if (!alert) return NextResponse.json({ ok: true, ignored: resource ?? "unknown" });
  try {
    const result = await upsertFirstResponderIssue(alert, { token: process.env.GITHUB_TOKEN });
    return NextResponse.json({ ok: true, issueId: alert.issueId, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
}
