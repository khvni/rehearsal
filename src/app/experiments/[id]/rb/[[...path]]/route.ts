import { isExperimentId } from "@/lib/contracts";
import { previewOrigin } from "@/lib/link-preview";
import { Orchestrator } from "@/lib/orchestrator";
import { normalizeRebuildPath, renderSiteDocument, siteStylesheet } from "@/lib/rebuild/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path: segments = [] } = await params;
  if (!isExperimentId(id)) return new Response("Not found", { status: 404 });
  const path = normalizeRebuildPath(segments);
  if (!path) return new Response("Invalid path", { status: 400 });
  const orch = (g.__orchestrator ??= new Orchestrator());
  const exp = await orch.get(id);
  if (!exp?.rebuild?.site) return new Response("Not found", { status: 404 });
  const origin = new URL(exp.targetUrl).origin;
  const headers = {
    "content-security-policy": `default-src 'none'; script-src 'none'; img-src 'self' ${origin}; style-src 'self'; font-src 'self' ${origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (path === "/_assets/site.css") {
    return new Response(siteStylesheet(exp.rebuild.site.tokens), {
      headers: {
        ...headers,
        "content-type": "text/css; charset=utf-8",
        "cache-control": "public, max-age=60, must-revalidate",
      },
    });
  }
  const page = exp.rebuild.site.pages.find(
    (p) => normalizeRebuildPath(p.path.split("/")) === path && p.status === "built"
  );
  return new Response(renderSiteDocument(exp, path, { origin: previewOrigin(req.headers) }), {
    status: page ? 200 : 404,
    headers: {
      ...headers,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
