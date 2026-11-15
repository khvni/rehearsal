import { NextResponse } from "next/server";
import { isExperimentId } from "@/lib/contracts";
import { Orchestrator, StageInProgressError } from "@/lib/orchestrator";
import { enqueueRun } from "@/lib/access";
import { runInBackground } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

/**
 * Run-step continuation: each background slice ends by POSTing here so the next
 * slice runs in a fresh waitUntil window on Workers (or a fresh detached
 * promise elsewhere). Authorized by the per-run `runToken` in the body, or by
 * `Authorization: Bearer $REHEARSAL_RUN_SECRET` when that env is set.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; token?: string };
  const id = body.id;
  if (!isExperimentId(id)) return NextResponse.json({ error: "invalid experiment id" }, { status: 400 });
  const orch = orchestrator();
  const exp = await orch.get(id);
  if (!exp) return NextResponse.json({ error: "not found" }, { status: 404 });
  const secret = process.env.REHEARSAL_RUN_SECRET;
  const bearerOk = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  const tokenOk = Boolean(exp.runToken) && body.token === exp.runToken;
  if (!bearerOk && !tokenOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origin = new URL(req.url).origin;
  await runInBackground(() =>
    enqueueRun(async () => {
      try {
        await orch.runStep(id, { origin });
      } catch (e) {
        if (!(e instanceof StageInProgressError)) {
          await orch.markFailed(id, e).catch(() => undefined);
        }
      }
    }),
  );
  return NextResponse.json({ ok: true, status: exp.status }, { status: 202 });
}
