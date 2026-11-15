import type { SiteType, StateGraph } from "../contracts";
import { detectSiteType } from "./site-type";

export const DATE = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}(\s*[-–]\s*\d{1,2})?(,?\s+\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/i;

export const CONTEXT_SIGNALS: Record<string, { questionId: string; when: RegExp; siteTypes?: SiteType[] }> = {
  cost: { questionId: "cost", when: /\b(pricing|prices?|plans|paid|tickets?)\b/i },
  sales: { questionId: "ctx-sales", when: /\benterprise\b/i, siteTypes: ["saas", "commerce"] },
  apply: { questionId: "ctx-apply-criteria", when: /\b(by application( only)?|apply to attend|applications? (open|close|due))\b/i },
  trial: { questionId: "ctx-trial-limits", when: /\b(free trial|free plan|free tier)\b/i, siteTypes: ["saas", "content"] },
  integrations: { questionId: "integrations", when: /\b(apis?|integrations?)\b/i, siteTypes: ["saas"] },
  travel: { questionId: "ctx-travel", when: /\b(venue|hotel|in[- ]person)\b/i, siteTypes: ["event"] },
  date: { questionId: "ctx-date", when: DATE },
};

/** Re-evaluate context for stored questions whose bank source predates context provenance. */
export function contextQuestionIds(graph: StateGraph): string[] {
  const start = graph.states[0];
  if (!start) return [];
  const copy = `${start.pageTitle}\n${start.visibleText}`;
  const siteType = detectSiteType(graph);
  return Object.values(CONTEXT_SIGNALS)
    .filter((rule) => (!rule.siteTypes || rule.siteTypes.includes(siteType)) && rule.when.test(copy))
    .map((rule) => rule.questionId);
}
