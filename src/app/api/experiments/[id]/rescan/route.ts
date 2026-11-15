import { NextResponse } from "next/server";
import { ExperimentGoal, isExperimentId } from "@/lib/contracts";
import { Orchestrator, StageInProgressError } from "@/lib/orchestrator";
import { presentsAccessToken } from "@/lib/access";
import { underRunLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

/**
 * Re-check the site's pages against the signatures discover stored — cheap
 * fetcher probes, no browser budget. Content changed → derived artifacts reset
 * and the pipeline re-runs as a background job (202). Unchanged → no-op (200).
 * A `goal` in the body regenerates goal-derived artifacts on the kept graph
 * without a recrawl.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isExperimentId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { goal?: unknown };
  const goal = ExperimentGoal.optional().safeParse(body?.goal ?? undefined);
  if (!goal.success) return NextResponse.json({ error: "invalid goal" }, { status: 400 });
  const orch = orchestrator();
  try {
    // A changed site or goal re-runs the pipeline, so rescans share the stage route's daily run budget.
    if (!presentsAccessToken(req)) {
      if (!(await orch.get(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (!(await underRunLimit(req, id))) {
        return NextResponse.json({ error: "daily run limit reached" }, { status: 429 });
      }
    }
    const { experiment, report } = await orch.rescan(id, { goal: goal.data });
    if (report.restarted) {
      await orch.scheduleRun(id, { skipDiscover: !report.changed });
    }
    return NextResponse.json({ ...experiment, rescan: report }, { status: report.restarted ? 202 : 200 });
  } catch (e) {
    if (e instanceof StageInProgressError) {
      return NextResponse.json({ error: e.message, runningStage: e.runningStage }, { status: 409 });
    }
    if (e instanceof Error && e.message.startsWith("Unknown experiment")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return NextResponse.json({ error: String(e).slice(0, 400) }, { status: 500 });
  }
}
