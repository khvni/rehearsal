import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isExperimentId } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { requestOrigin } from "@/lib/fetch/guards";
import { runInBackground } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isExperimentId(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const orch = orchestrator();
  const experiment = await orch.get(id);
  if (!experiment) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Self-healing watchdog: a stalled background run resumes on the next poll.
  // On Workers a bare promise dies with the response, so it rides waitUntil.
  const origin = requestOrigin(req);
  await runInBackground(async () => {
    await orch.resume(id, { origin, inline: true }).catch(() => undefined);
  });
  const body = JSON.stringify(experiment);
  const tag = `"${createHash("sha256").update(body).digest("hex")}"`;
  const headers = { ETag: `W/${tag}`, "Cache-Control": "private, no-cache" };
  const unchanged = req.headers.get("if-none-match")?.split(",").some((value) => {
    const candidate = value.trim();
    return candidate === "*" || candidate.replace(/^W\//, "") === tag;
  });
  if (unchanged) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(body, { headers: { ...headers, "Content-Type": "application/json" } });
}
