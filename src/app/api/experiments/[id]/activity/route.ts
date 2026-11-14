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
  if (!(await orch.get(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await orch.activity(id));
}
