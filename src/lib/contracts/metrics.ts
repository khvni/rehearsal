import { z } from "zod";

/**
 * Scanning/usability measurements for one rendered page (Krug K2/K4/K6/K7).
 * `source: "browser"` = measured in a real layout via page.evaluate; `"html"` = DOM-only
 * fallback where layout-dependent fields are null.
 */
export const PageMetrics = z.object({
  source: z.enum(["browser", "html"]),
  pageHeightPx: z.number().nullable(),
  viewportHeightPx: z.number(),
  /** pageHeight / viewportHeight = screens of scrolling. */
  foldRatio: z.number().nullable(),
  estimatedScrollTimeSec: z.number().nullable(),
  aboveFoldCtaCount: z.number().int().nullable(),
  totalCtaCount: z.number().int(),
  /** Above-fold CTAs tied for most prominent (area x font size); 1 = a clear primary action. */
  primaryCtaAmbiguity: z.number().int().nullable(),
  primaryCtaLabels: z.array(z.string()),
  headingOutline: z.object({
    h1Count: z.number().int(),
    h1Text: z.array(z.string()),
    skippedLevels: z.array(z.string()),
  }),
  navItemCount: z.number().int(),
  /** Visible text characters per rendered font size, largest size first. */
  fontSizeBuckets: z.array(z.object({ px: z.number(), chars: z.number().int() })).nullable(),
  /** Visible above-the-fold text characters per 10,000 px² of viewport. */
  textDensity: z.number().nullable(),
  largestTextIsH1: z.boolean().nullable(),
  trunkTest: z.object({
    hasSiteName: z.boolean(),
    hasPageName: z.boolean(),
    hasPrimaryNav: z.boolean(),
    hasSearch: z.boolean(),
    hasYouAreHere: z.boolean(),
  }),
});
export type PageMetrics = z.infer<typeof PageMetrics>;
