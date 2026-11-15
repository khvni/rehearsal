import { NextResponse } from "next/server";
import { isExperimentId } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

/** Manual stall watchdog: resume a background run whose heartbeat (last activity event) is older than the stall window. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isExperimentId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const orch = orchestrator();
  const exp = await orch.get(id);
  if (!exp) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { resumed } = await orch.resume(id);
  return NextResponse.json({ resumed, status: exp.status });
}
