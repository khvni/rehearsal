/**
 * Spec-stage mockup (src/lib/mockup/**): rebuild the target site with the spec
 * applied — one self-contained page per crawled URL, served under
 * /experiments/{id}/preview/. The Gemini "mockup" model slot writes pages when
 * a key is present; the deterministic template covers anything it misses.
 * Everything is deterministic given the same experiment.
 */
export { generateMockup, mockupContent } from "./generate";
export { previewHref, renderMockupPage, rewriteLinks } from "./render";
