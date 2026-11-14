import { NextResponse } from "next/server";
import { ExperimentConfig } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { clientIp, underDailyLimit } from "@/lib/ratelimit";

/** Public-demo caps: experiment creation per IP, journeys and browser runs per experiment. */
const CREATE_PER_IP_PER_DAY = 3;
const MAX_TRAJECTORIES = 1000;
const MAX_VERIFY_RUNS = 8;

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
    const body = (await req.json()) as {
      targetUrl?: string;
      url?: string;
      goal?: string;
      config?: unknown;
    };
    body.targetUrl ??= body.url;
    if (!body.targetUrl || !body.goal) {
      return NextResponse.json({ error: "targetUrl and goal are required" }, { status: 400 });
    }
    const parsed = ExperimentConfig.safeParse(body.config ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid config", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    if (!(await underDailyLimit(`exp-create:${clientIp(req)}`, CREATE_PER_IP_PER_DAY))) {
      return NextResponse.json({ error: "daily experiment limit reached" }, { status: 429 });
    }
    const config = {
      ...parsed.data,
      trajectories: Math.min(parsed.data.trajectories, MAX_TRAJECTORIES),
      verifyCount: Math.min(parsed.data.verifyCount, MAX_VERIFY_RUNS),
    };
    const experiment = await orchestrator().createExperiment(body.targetUrl, body.goal, config);
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
