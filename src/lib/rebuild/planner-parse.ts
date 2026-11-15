import { z } from "zod";
import { BlockType, RebuildSite, RebuildSitePage } from "../contracts";
import { cleanNavLabel, parseColor } from "./brand";
import { repairSiteTokens } from "./site-tokens";

const pageDesign = RebuildSitePage.pick({
  path: true,
  mode: true,
  blocks: true,
  primaryAction: true,
});
const siteDesign = RebuildSite.pick({
  tokens: true,
  designNotes: true,
  nav: true,
  footer: true,
}).extend({ pages: z.array(pageDesign) });

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, limit: number): string | undefined {
  if (!["string", "number", "boolean"].includes(typeof value)) return;
  return String(value).trim().slice(0, limit) || undefined;
}

function link(value: unknown) {
  const item = record(value);
  const label = text(item.label, 100);
  const href = typeof item.href === "string" ? item.href.trim() : "";
  if (!label || !href || href.length > 2048) return;
  try {
    const url = new URL(href, "https://planner.invalid");
    if (/^(https?:|mailto:|tel:)$/.test(url.protocol))
      return { label: cleanNavLabel(label), href };
  } catch {
    return;
  }
}

export function parsePlannerDesign(value: unknown, fallback: RebuildSite) {
  const input = record(value);
  const rawTokens = record(input.tokens);
  const colors = [
    "background",
    "foreground",
    "primary",
    "primaryForeground",
    "muted",
    "mutedForeground",
    "card",
    "border",
    "ring",
  ];
  if (
    !colors.some(
      (key) =>
        typeof rawTokens[key] === "string" &&
        (parseColor(rawTokens[key]) || /^(black|white)$/i.test(rawTokens[key])),
    )
  )
    throw new Error("Planner tokens are unusable");
  const tokens = { ...fallback.tokens };
  for (const [key, schema] of Object.entries(RebuildSite.shape.tokens.shape)) {
    const parsed = schema.safeParse(rawTokens[key]);
    if (parsed.success && parsed.data !== undefined)
      tokens[key as keyof typeof tokens] = parsed.data;
  }
  if (!Array.isArray(input.pages))
    throw new Error("Planner pages are unusable");
  const pages = input.pages.flatMap((value) => {
    const page = record(value);
    const owned = fallback.pages.find((p) => p.path === page.path);
    if (!owned || !Array.isArray(page.blocks)) return [];
    const blocks = page.blocks.flatMap((value) => {
      const block = record(typeof value === "string" ? { type: value } : value);
      const type = BlockType.safeParse(block.type);
      if (!type.success) return [];
      return [
        {
          type: type.data,
          purpose: text(block.purpose, 400) ?? `Present ${owned.title}`,
          notes: text(block.notes, 600),
        },
      ];
    });
    if (!blocks.length) return [];
    const mode = RebuildSitePage.shape.mode.safeParse(
      typeof page.mode === "string"
        ? page.mode.toLowerCase().trim()
        : page.mode,
    );
    return [
      {
        path: owned.path,
        mode: mode.success ? mode.data : owned.mode,
        blocks,
        primaryAction: link(page.primaryAction),
      },
    ];
  });
  if (fallback.pages.length && !pages.length)
    throw new Error("Planner pages/blocks are unusable");
  const rawNav = Array.isArray(input.nav) ? input.nav : [];
  const nav = rawNav
    .flatMap((value) => {
      const item = record(value);
      const label = text(item.label, 80);
      return label && fallback.pages.some((p) => p.path === item.path)
        ? [{ label: cleanNavLabel(label), path: String(item.path) }]
        : [];
    })
    .filter((n, i, all) => all.findIndex((item) => item.path === n.path) === i)
    .slice(0, 7);
  const rawFooter = record(input.footer);
  const footerLinks = Array.isArray(rawFooter.links)
    ? rawFooter.links
        .flatMap((value) => {
          const item = link(value);
          return item ? [item] : [];
        })
        .slice(0, 8)
    : fallback.footer.links;
  return siteDesign.parse({
    tokens: repairSiteTokens(tokens),
    designNotes: text(input.designNotes, 2000) ?? fallback.designNotes,
    pages,
    nav: nav.length ? nav : fallback.nav,
    footer: {
      note: text(rawFooter.note, 400) ?? fallback.footer.note,
      links: footerLinks,
    },
  });
}
