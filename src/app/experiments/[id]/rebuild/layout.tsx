import type { Metadata } from "next";
import { headers } from "next/headers";
import { isExperimentId } from "@/lib/contracts";
import { PREVIEW_SITE_NAME, previewImageUrl, previewOrigin, rebuildPreview } from "@/lib/link-preview";
import { Orchestrator } from "@/lib/orchestrator";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const exp = isExperimentId(id) ? await (g.__orchestrator ??= new Orchestrator()).get(id).catch(() => null) : null;
  const p = exp && rebuildPreview(exp);
  if (!p) return {};
  const origin = previewOrigin(await headers());
  const image = { url: previewImageUrl(origin, id, "rebuild"), width: 1200, height: 630, alt: p.alt };
  return {
    title: `${p.title} · ${PREVIEW_SITE_NAME}`,
    description: p.description,
    openGraph: {
      type: "website",
      siteName: PREVIEW_SITE_NAME,
      url: `${origin}/experiments/${id}/rebuild`,
      title: p.title,
      description: p.description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [image] },
  };
}

export default function RebuildLayout({ children }: { children: React.ReactNode }) {
  return children;
}
