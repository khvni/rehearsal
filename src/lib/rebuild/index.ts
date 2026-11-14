/**
 * Rebuild stage (src/lib/rebuild/**): turn a crawled site into a redesigned
 * version of itself. Three deterministic steps and one optional LLM step:
 *
 *   brand.ts     crawled states → BrandProfile (colors, fonts, logo, nav, voice)
 *   goals.ts     graph + endpoints → every plausible visitor goal
 *   generate.ts  goal + brand + facts → RebuildPageContent (Gemini, else seeded)
 *   templates.ts content + brand → one self-contained safe HTML page
 *
 * Everything here is deterministic given the same experiment: ids come from
 * content hashes, never randomUUID; no wall-clock reads outside generatedAt.
 */
export { brandSignalsFromHtml, captureBrand, mergeSignals, rollupBrand } from "./brand";
export { MAX_REBUILD_GOALS, inferGoals } from "./goals";
export { generateRebuild, seedPageContent } from "./generate";
export { sanitizeRebuildHtml } from "./sanitize";
export { renderGoalPage } from "./templates";
