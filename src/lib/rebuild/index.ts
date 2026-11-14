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
import type {
  BrandProfile,
  BrandSignals,
  EvaluatingPage,
  Experiment,
  LlmClient,
  RebuildPageContent,
  RebuildResult,
  SiteState,
} from "../contracts";

/** Declared design signals parsed from raw HTML (`:root` vars, meta, nav, logo). Never throws. */
export function brandSignalsFromHtml(_html: string, _pageUrl: string): BrandSignals {
  throw new Error("not implemented");
}

/**
 * Computed design signals via page.evaluate — runs inside every BrowserRunner's
 * openPage. Never throws; returns undefined when the page can't be evaluated.
 */
export function captureBrand(_page: EvaluatingPage): Promise<BrandSignals | undefined> {
  throw new Error("not implemented");
}

/** Merge a computed layer over a declared layer (computed wins per field). */
export function mergeSignals(_base: BrandSignals, _extra: BrandSignals | undefined): BrandSignals {
  throw new Error("not implemented");
}

/** Roll every state's signals up into the site's design language. Deterministic. */
export function rollupBrand(_states: SiteState[], _extra?: BrandSignals[]): BrandProfile {
  throw new Error("not implemented");
}

/**
 * Infer ALL plausible visitor goals: the experiment's own goal first, then
 * explicit CTAs, nav items, endpoint classes and page titles, plus implied goals
 * from the detected site type. Slugs are unique + url-safe; weights in [0,1].
 */
export function inferGoals(_exp: Experiment): import("../contracts").RebuildGoal[] {
  throw new Error("not implemented");
}

/**
 * Deterministic page content assembled from crawled facts (headings, CTA
 * labels, endpoint URLs, spec changes, findings) — the keyless path.
 */
export function seedPageContent(_exp: Experiment, _goal: import("../contracts").RebuildGoal): RebuildPageContent {
  throw new Error("not implemented");
}

/** Render branded self-contained HTML: inline styles, no scripts, images on the audited origin only. */
export function renderGoalPage(_input: {
  brand: BrandProfile;
  goal: import("../contracts").RebuildGoal;
  experiment: Experiment;
  content: RebuildPageContent;
}): string {
  throw new Error("not implemented");
}

/** Belt: strip scripts/iframes/event handlers and off-origin resources even if they slip through. */
export function sanitizeRebuildHtml(_html: string, _opts: { imageOrigins: string[] }): string {
  throw new Error("not implemented");
}

/** Stage 7 core: rollupBrand → inferGoals → per-goal content → rendered pages. */
export function generateRebuild(_exp: Experiment, _llm: LlmClient): Promise<RebuildResult> {
  throw new Error("not implemented");
}
