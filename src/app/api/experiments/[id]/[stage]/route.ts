import { NextResponse } from "next/server";
import { Orchestrator, StageInProgressError } from "@/lib/orchestrator";
import { specToMarkdown } from "@/lib/analysis/spec";
import { maxConcurrentRuns, withRunSlot } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const { id, stage } = await params;
  const orch = orchestrator();
  try {
    const slot = await withRunSlot(() => runStage(orch, id, stage));
    if (slot.busy) {
      return NextResponse.json(
        { error: `busy: ${maxConcurrentRuns()} pipeline stages already running, retry shortly` },
        { status: 429, headers: { "retry-after": "30" } },
      );
    }
    return slot.value;
  } catch (e) {
    if (e instanceof StageInProgressError) {
      return NextResponse.json({ error: e.message, runningStage: e.runningStage }, { status: 409 });
    }
    if (e instanceof Error && e.message.startsWith("Unknown experiment")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    await orch.markFailed(id, e).catch(() => undefined);
    return NextResponse.json({ error: String(e).slice(0, 400) }, { status: 500 });
  }
}

async function runStage(orch: Orchestrator, id: string, stage: string): Promise<NextResponse> {
  switch (stage) {
    case "discover":
      return NextResponse.json(await orch.discover(id));
    case "simulate":
      return NextResponse.json(await orch.simulate(id));
    case "verify":
      return NextResponse.json(await orch.verify(id));
    case "analyze":
      return NextResponse.json(await orch.analyze(id));
    case "compare":
      return NextResponse.json(await orch.compare(id));
    case "spec":
      return NextResponse.json(await orch.spec(id));
    case "run":
      return NextResponse.json(await orch.runAll(id));
    default:
      return NextResponse.json({ error: `unknown stage ${stage}` }, { status: 400 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const { id, stage } = await params;
  if (stage !== "spec") return NextResponse.json({ error: "unsupported" }, { status: 400 });
  const experiment = await orchestrator().get(id);
  if (!experiment?.spec) return NextResponse.json({ error: "no spec yet" }, { status: 404 });
  return new Response(specToMarkdown(experiment.spec), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
