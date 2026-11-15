import { NextResponse } from "next/server";
import { isExperimentId } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isExperimentId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const orch = orchestrator();
  const experiment = await orch.get(id);
  if (!experiment) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Self-healing watchdog: a stalled background run resumes on the next poll.
  void orch.resume(id).catch(() => undefined);
  return NextResponse.json(experiment);
}
