import { NextResponse } from "next/server";
import { Orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Process-wide orchestrator: browser instance + stores persist across requests.
const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { targetUrl?: string; goal?: string; config?: object };
    if (!body.targetUrl || !body.goal) {
      return NextResponse.json({ error: "targetUrl and goal are required" }, { status: 400 });
    }
    const experiment = await orchestrator().createExperiment(body.targetUrl, body.goal, body.config);
    return NextResponse.json(experiment);
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 400 });
  }
}

export async function GET() {
  const list = await orchestrator().list();
  return NextResponse.json(
    list.map((e) => ({ id: e.id, targetUrl: e.targetUrl, goal: e.goal, status: e.status, createdAt: e.createdAt })),
  );
}
