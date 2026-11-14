import { NextResponse } from "next/server";
import { Orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

function norm(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/** /experiments/{id}/preview → the mockup's index page (the crawled target URL, else first page). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experiment = await orchestrator().get(id);
  if (!experiment) return NextResponse.json({ error: `Unknown experiment: ${id}` }, { status: 404 });
  const mockup = experiment.mockup;
  if (!mockup || mockup.pages.length === 0) return NextResponse.json({ error: "no mockup yet" }, { status: 404 });
  const target = norm(experiment.targetUrl);
  const index = mockup.pages.find((p) => norm(p.sourceUrl) === target) ?? mockup.pages[0];
  return NextResponse.redirect(new URL(`/experiments/${id}/preview/${index.slug}`, req.url));
}
