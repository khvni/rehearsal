import { isExperimentId } from "@/lib/contracts";
import { Orchestrator } from "@/lib/orchestrator";
import { renderSiteDocument, siteStylesheet } from "@/lib/rebuild/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };

function normalizedPath(segments: string[]): string | undefined {
  const decoded: string[] = [];
  for (const segment of segments) {
    try {
      let value = segment;
      for (let i = 0; i < 4 && /%[\da-f]{2}/i.test(value); i++)
        value = decodeURIComponent(value);
      if (
        value === "." ||
        value === ".." ||
        /[%/\\\u0000-\u001f?#]/.test(value)
      )
        return;
      if (value) decoded.push(encodeURIComponent(value));
    } catch {
      return;
    }
  }
  return "/" + decoded.join("/");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path: segments = [] } = await params;
  if (!isExperimentId(id)) return new Response("Not found", { status: 404 });
  const path = normalizedPath(segments);
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
    (p) => p.path === path && p.status === "built"
  );
  return new Response(renderSiteDocument(exp, path), {
    status: page ? 200 : 404,
    headers: {
      ...headers,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
