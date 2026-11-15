import { NextResponse } from "next/server";
import { isExperimentId } from "@/lib/contracts";
import { Orchestrator, StageInProgressError } from "@/lib/orchestrator";
import { specToMarkdown } from "@/lib/analysis/spec";
import { displaySpec } from "@/lib/presentation";
import {
  maxConcurrentRuns,
  presentsAccessToken,
  withRunSlot,
} from "@/lib/access";
import { underRunLimit } from "@/lib/ratelimit";
import { rebuildPending } from "@/lib/rebuild/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

const STAGES = new Set([
  "discover",
  "simulate",
  "verify",
  "analyze",
  "compare",
  "spec",
  "rebuild",
  "run",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; stage: string }> }
) {
  const { id, stage } = await params;
  if (!isExperimentId(id))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!STAGES.has(stage))
    return NextResponse.json(
      { error: `unknown stage ${stage}` },
      { status: 400 }
    );
  const orch = orchestrator();
  try {
    let restart = new URL(req.url).searchParams.get("restart") === "1";
    if (
      stage === "rebuild" &&
      req.headers.get("content-type")?.includes("application/json")
    ) {
      const body = await req.json().catch(() => null);
      restart ||=
        body?.restart === true || body?.restart === 1 || body?.restart === "1";
    }
    // Public demo: every stage spends crawl/browser/LLM budget, so reruns are capped per caller and per experiment.
    if (!presentsAccessToken(req)) {
      const experiment = await orch.get(id);
      if (!experiment)
        return NextResponse.json({ error: "not found" }, { status: 404 });
      // Continuations share the planning step's run allowance.
      if (experiment.status === "complete" && stage !== "rebuild") {
        return NextResponse.json(
          {
            error:
              "experiment already complete — use Rescan site to refresh it",
          },
          { status: 403 }
        );
      }
      const continuation =
        stage === "rebuild" &&
        !restart &&
        (rebuildPending(experiment) || !!experiment.rebuild?.site?.completedAt);
      if (!continuation && !(await underRunLimit(req, id))) {
        return NextResponse.json(
          { error: "daily run limit reached" },
          { status: 429 }
        );
      }
    }
    const slot = await withRunSlot(() =>
      runStage(orch, id, stage, new URL(req.url).origin, restart),
      20_000
    );
    if (slot.busy) {
      return NextResponse.json(
        {
          error: `busy: ${maxConcurrentRuns()} pipeline stages already running, retry shortly`,
        },
        { status: 429, headers: { "retry-after": "30" } }
      );
    }
    return slot.value;
  } catch (e) {
    if (e instanceof StageInProgressError) {
      return NextResponse.json(
        { error: e.message, runningStage: e.runningStage },
        { status: 409 }
      );
    }
    if (e instanceof Error && e.message.startsWith("Unknown experiment")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    const code =
      e instanceof Error && "code" in e
        ? (e as { code?: string }).code
        : undefined;
    await orch.markFailed(id, e).catch(() => undefined);
    return NextResponse.json(
      { error: String(e).slice(0, 400), ...(code ? { code } : {}) },
      { status: 500 }
    );
  }
}

async function runStage(
  orch: Orchestrator,
  id: string,
  stage: string,
  origin: string,
  restart: boolean
): Promise<NextResponse> {
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
    case "rebuild":
      return NextResponse.json(await orch.rebuild(id, { restart }));
    case "run":
      return NextResponse.json(await orch.runAll(id, { origin }));
    default:
      return NextResponse.json(
        { error: `unknown stage ${stage}` },
        { status: 400 }
      );
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; stage: string }> }
) {
  const { id, stage } = await params;
  if (!isExperimentId(id))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (stage !== "spec")
    return NextResponse.json({ error: "unsupported" }, { status: 400 });
  const experiment = await orchestrator().get(id);
  if (!experiment?.spec)
    return NextResponse.json({ error: "no spec yet" }, { status: 404 });
  return new Response(specToMarkdown(displaySpec(experiment)!), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
