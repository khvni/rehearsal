import type { Metadata } from "next";
import { headers } from "next/headers";
import { isExperimentId } from "@/lib/contracts";
import { experimentPreview, PREVIEW_SITE_NAME, previewImageUrl, previewOrigin } from "@/lib/link-preview";
import { Orchestrator } from "@/lib/orchestrator";

const g = globalThis as unknown as { __orchestrator?: Orchestrator };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const exp = isExperimentId(id) ? await (g.__orchestrator ??= new Orchestrator()).get(id).catch(() => null) : null;
  if (!exp) return {};
  const origin = previewOrigin(await headers());
  const p = experimentPreview(exp);
  const image = { url: previewImageUrl(origin, id, "findings"), width: 1200, height: 630, alt: p.alt };
  return {
    title: `${p.title} · ${PREVIEW_SITE_NAME}`,
    description: p.description,
    openGraph: {
      type: "website",
      siteName: PREVIEW_SITE_NAME,
      url: `${origin}/experiments/${id}`,
      title: p.title,
      description: p.description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [image] },
  };
}

export default function ExperimentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
