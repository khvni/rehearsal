import type { RebuildSite } from "../contracts";
import { contrastRatio, luminance, parseColor } from "./brand";

function opaque(value: string, fallback: string): string {
  const color = parseColor(
    ({ black: "#000000", white: "#ffffff" } as Record<string, string>)[value] ??
      value,
  );
  if (!color || color.a < 1) return fallback;
  return (
    "#" +
    [color.r, color.g, color.b]
      .map((c) =>
        Math.round(Math.max(0, Math.min(255, c)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const ratio = (a: string, b: string) =>
  contrastRatio(parseColor(a)!, parseColor(b)!);
const inkOn = (background: string) =>
  ratio("#000000", background) >= ratio("#ffffff", background)
    ? "#000000"
    : "#ffffff";

function mix(a: string, b: string, amount: number): string {
  const first = parseColor(a)!;
  const second = parseColor(b)!;
  const channels = ["r", "g", "b"] as const;
  return (
    "#" +
    channels
      .map((c) =>
        Math.round(first[c] * (1 - amount) + second[c] * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function derivedSurfaces(color: string) {
  const background = opaque(color, "#ffffff");
  const dark = luminance(parseColor(background)!) < 0.2;
  const ink = dark ? "#ffffff" : "#000000";
  return {
    background,
    muted: mix(background, ink, dark ? 0.06 : 0.035),
    card: mix(background, ink, dark ? 0.025 : 0),
    border: mix(background, ink, dark ? 0.2 : 0.14),
    mutedForeground: mix(background, ink, dark ? 0.7 : 0.72),
  };
}

export function repairSiteTokens(
  tokens: RebuildSite["tokens"],
): RebuildSite["tokens"] {
  const background = opaque(tokens.background, "#ffffff");
  let foreground = opaque(tokens.foreground, inkOn(background));
  if (ratio(foreground, background) < 4.5) foreground = inkOn(background);
  const surface = (value: string) => {
    const color = opaque(value, background);
    return ratio(foreground, color) >= 4.5 ? color : background;
  };
  const muted = surface(tokens.muted);
  const card = surface(tokens.card);
  let mutedForeground = opaque(tokens.mutedForeground, foreground);
  if (
    [background, muted, card].some(
      (color) => ratio(mutedForeground, color) < 4.5,
    )
  )
    mutedForeground = foreground;
  const primary = opaque(tokens.primary, foreground);
  let primaryForeground = opaque(tokens.primaryForeground, inkOn(primary));
  if (ratio(primaryForeground, primary) < 4.5)
    primaryForeground = inkOn(primary);
  return {
    ...tokens,
    background,
    foreground,
    muted,
    card,
    mutedForeground,
    primary,
    primaryForeground,
  };
}
