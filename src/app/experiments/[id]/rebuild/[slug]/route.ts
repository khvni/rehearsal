import { NextResponse } from "next/server";
import { Orchestrator } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };
function orchestrator(): Orchestrator {
  if (!g.__orchestrator) g.__orchestrator = new Orchestrator();
  return g.__orchestrator;
}

/** Serves one rebuilt page as the raw self-contained HTML document the rebuild stage generated. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const experiment = await orchestrator().get(id);
  if (!experiment) return NextResponse.json({ error: `Unknown experiment: ${id}` }, { status: 404 });
  if (!experiment.rebuild) return NextResponse.json({ error: "no rebuild yet" }, { status: 404 });
  const page = experiment.rebuild.pages.find((p) => p.slug === slug);
  if (!page) return NextResponse.json({ error: `no rebuilt page ${slug}` }, { status: 404 });
  return new Response(page.html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
