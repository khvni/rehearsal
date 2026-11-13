import { createHash } from "node:crypto";
import type {
  Endpoint,
  EndpointClass,
  IntentCategory,
  SiteState,
  SiteType,
  StateGraph,
  VisitorQuestion,
} from "../contracts";
import type { LlmClient } from "../analysis/gemini";

/**
 * Unanswered visitor questions: a checked-in bank of questions a visitor of each
 * site type is likely to ask, plus questions implied by the site's own copy, each
 * with a deterministic detector for "the site gives a path to the answer".
 */

type Detector = (state: SiteState) => string | null;

export interface QuestionTemplate {
  id: string;
  intent: IntentCategory;
  question: string;
  classes: EndpointClass[];
  importance: number;
  /** Text that answers the question; an array means every pattern must match on the same state. */
  text?: RegExp | RegExp[];
  /** State URL path that answers the question (/pricing, /faq…). */
  url?: RegExp;
  /** Only endpoints whose label matches count (e.g. a contact-form that is about sponsorship doesn't answer "contact"). */
  endpointLabel?: RegExp;
  /** Custom detector for answers that aren't a keyword (e.g. "is there a descriptive sentence?"). */
  detect?: Detector;
  /** Only the start page can answer it (Krug's homepage questions). */
  startOnly?: boolean;
}

/** Krug's homepage questions (docs/krug-principles.md K7). */
export const HOMEPAGE_QUESTION_IDS = ["hp-what", "hp-do", "hp-why", "hp-start"] as const;

const WHAT_IS_THIS: Record<SiteType, string> = {
  event: "What is this event?",
  saas: "What does it do?",
  commerce: "What do they sell?",
  content: "What is this site about?",
};

/** A plain descriptive sentence (≥8 words) near the top of the page answers "what is this?". */
const describes: Detector = (state) => {
  const head = state.visibleText.slice(0, 2500);
  for (const raw of head.split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw.trim();
    const words = s.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
    const letters = s.replace(/[^a-z]/gi, "");
    const lowerShare = letters.replace(/[^a-z]/g, "").length / Math.max(1, letters.length);
    if (words.length >= 8 && words.length <= 40 && lowerShare >= 0.6 && /\b(is|are|for|helps?|lets?|returns|brings|makes|gives|offers|builds?)\b/i.test(s)) {
      return s.slice(0, 160);
    }
  }
  return null;
};

function homepageQuestions(siteType: SiteType): QuestionTemplate[] {
  return [
    { id: "hp-what", intent: "information", question: WHAT_IS_THIS[siteType], classes: [], importance: 1, detect: describes, startOnly: true },
    {
      id: "hp-do",
      intent: "proposal",
      question: "What can I do here?",
      classes: ["signup", "contact-form", "next-steps", "download", "schedule-event", "pricing", "demo-video", "docs-answers"],
      importance: 0.9,
      startOnly: true,
    },
    {
      id: "hp-why",
      intent: "information",
      question: "Why should I be here and not somewhere else?",
      classes: [],
      importance: 0.7,
      text: /\b(why (attend|us|choose)|built for|designed for|trusted by|the only|world['’]?s (top|best|leading)|unlike|\d[\d,.]*\s*(k|m|million|thousand)?\+?\s*(customers|users|teams|companies|attendees|admitted|views|developers|engineers|downloads|subscribers|readers))\b/i,
      startOnly: true,
    },
    {
      id: "hp-start",
      intent: "proposal",
      question: "Where do I start?",
      classes: ["signup"],
      importance: 0.9,
      text: /\b(get started|start here|start (for )?free|sign up|apply (now|to attend)|register (now|today)|shop now|subscribe now|try (it )?(now|free))\b/i,
      startOnly: true,
    },
  ];
}

const DATE =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}(\s*[-–]\s*\d{1,2})?(,?\s+\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/i;
const PLACE = /\b(venue|location|address|get directions|held at|takes place (at|in)|in-person at)\b|\/\/\s*location/i;
const PRICE = /[$€£]\s?\d|\b(pricing|ticket prices?|tickets? (start|from|cost)|free (to attend|admission|of charge)|admission is free|no cost|per (month|seat|user|year))\b/i;
const CONTACT = /\b(contact us|contact (sales|support|the (team|organi[sz]ers))|get in touch|email us|reach us|talk to (sales|us|a human|an expert)|chat with us)\b|mailto:/i;
const CONTACT_LABEL = /\b(contact|get in touch|email|talk to|inquir|enquir|support|help|chat|sales)\b/i;

const shared = {
  cost: (importance: number): QuestionTemplate => ({
    id: "cost", intent: "quotation", question: "How much does it cost?", classes: ["pricing"], importance, text: PRICE, url: /\/(pricing|prices|plans|tickets)\b/i,
  }),
  contact: (question: string, importance: number): QuestionTemplate => ({
    id: "contact", intent: "proposal", question, classes: ["contact-form"], importance, text: CONTACT, endpointLabel: CONTACT_LABEL, url: /\/(contact|support|help)\b/i,
  }),
  faq: (importance: number): QuestionTemplate => ({
    id: "faq", intent: "information", question: "Where are the answers to common questions?", classes: ["docs-answers"], importance, text: /\b(faqs?|frequently asked|help cent(er|re))\b/i, url: /\/(faq|help|support)\b/i,
  }),
  integrations: (importance: number): QuestionTemplate => ({
    id: "integrations", intent: "information", question: "Does it integrate with my tools?", classes: [], importance,
    text: /\b(integrat(es?|ions?)|connects? (with|to)|works with|plugins?|api reference)\b/i, url: /\/integrations?\b/i,
  }),
  whoFor: (question: string, importance: number): QuestionTemplate => ({
    id: "who-for", intent: "information", question, classes: [], importance,
    text: /\b(built for|designed for|made for|ideal for|perfect for|who should attend|for (practitioners|developers|engineers|founders|teams|startups|enterprises|businesses|designers|marketers|beginners|everyone))\b/i,
  }),
};

/** The checked-in question bank: site-type questions beyond the four homepage questions. */
export const QUESTION_BANK: Record<SiteType, QuestionTemplate[]> = {
  event: [
    { id: "when-where", intent: "information", question: "When and where is it?", classes: [], importance: 1, text: [DATE, PLACE] },
    { id: "attend", intent: "proposal", question: "How do I attend or apply?", classes: ["signup"], importance: 0.95, text: /\b(register|apply to attend|get tickets|buy tickets|rsvp|sign up to attend)\b/i },
    { id: "agenda", intent: "information", question: "What's on the agenda?", classes: ["schedule-event"], importance: 0.85, text: /\b(agenda|schedule|program(me)?|timetable)\b/i },
    { id: "speakers", intent: "information", question: "Who is speaking?", classes: [], importance: 0.8, text: /\b(speakers?|keynotes?|lineup)\b/i, url: /\/speakers?\b/i },
    shared.cost(0.75),
    { id: "format", intent: "information", question: "Is it in person or online?", classes: [], importance: 0.6, text: /\b(in[- ]person|online|virtual|livestream|live stream|hybrid|remote attendance|venue)\b/i },
    shared.whoFor("Who is it for?", 0.6),
    { id: "recordings", intent: "information", question: "Can I watch the talks if I can't attend?", classes: ["demo-video"], importance: 0.5, text: /\b(recordings?|livestream|watch (online|on youtube|the talks))\b/i },
    shared.faq(0.5),
    shared.contact("How do I contact the organizers?", 0.5),
    { id: "sponsor", intent: "proposal", question: "How do I sponsor or partner?", classes: ["contact-form"], importance: 0.4, endpointLabel: /\b(sponsor|partner|exhibit)/i, text: /\b(become a sponsor|sponsorship|sponsor (us|the)|partner with us|exhibit)\b/i },
  ],
  saas: [
    shared.cost(1),
    { id: "free-tier", intent: "quotation", question: "Is there a free tier or trial?", classes: [], importance: 0.8, text: /\b(free (tier|plan|trial|forever)|try (it )?(for )?free|start (for )?free|freemium)\b/i },
    { id: "get-started", intent: "proposal", question: "How do I get started?", classes: ["signup"], importance: 0.95, text: /\b(get started|sign up|create (an |your )?account|start (a |your )?(free )?trial)\b/i },
    shared.integrations(0.6),
    shared.whoFor("Who is it for?", 0.7),
    { id: "docs", intent: "information", question: "Where are the docs?", classes: ["docs-answers"], importance: 0.7, text: /\b(docs|documentation|api reference|developer guide)\b/i, url: /\/(docs|documentation|developers?)\b/i },
    shared.contact("How do I talk to a human?", 0.75),
    { id: "demo", intent: "information", question: "Can I see it in action?", classes: ["demo-video"], importance: 0.6, text: /\b(watch (the )?demo|product tour|see it in action|demo video)\b/i },
    { id: "security", intent: "information", question: "Is my data secure?", classes: [], importance: 0.5, text: /\b(security|soc ?2|gdpr|hipaa|encrypt(ed|ion)?|compliance|privacy)\b/i, url: /\/(security|trust|privacy)\b/i },
  ],
  commerce: [
    shared.cost(1),
    { id: "buy", intent: "proposal", question: "How do I buy?", classes: ["signup", "next-steps"], importance: 0.95, text: /\b(add to (cart|bag)|buy now|checkout|shop now|order now)\b/i },
    { id: "shipping", intent: "quotation", question: "How much is shipping and how long does it take?", classes: [], importance: 0.8, text: /\b(shipping|delivery|ships (in|within|free)|dispatch)\b/i, url: /\/(shipping|delivery)\b/i },
    { id: "returns", intent: "information", question: "Can I return it?", classes: [], importance: 0.7, text: /\b(returns?|refunds?|exchanges?|money[- ]back)\b/i, url: /\/(returns?|refunds?)\b/i },
    { id: "reviews", intent: "information", question: "What do other customers say?", classes: [], importance: 0.6, text: /\b(reviews?|rated|testimonials?|\d(\.\d)? stars?|★)/i },
    shared.faq(0.5),
    shared.contact("How do I get help with an order?", 0.6),
  ],
  content: [
    { id: "latest", intent: "information", question: "What's new?", classes: ["docs-answers", "demo-video"], importance: 0.7, text: /\b(latest|recent (posts|articles|episodes)|new (post|episode|article)s?)\b/i },
    { id: "browse", intent: "information", question: "How do I find something specific?", classes: [], importance: 0.6, text: /\b(search|topics|categories|tags|archives?)\b/i, url: /\/(search|topics|tags|archive)\b/i },
    { id: "subscribe", intent: "proposal", question: "How do I follow along?", classes: ["next-steps"], importance: 0.7, text: /\b(subscribe|newsletter|rss|follow (us|along))\b/i },
    { id: "who-writes", intent: "information", question: "Who is behind this?", classes: [], importance: 0.6, text: /\b(about (us|me)|written by|authors?|editors?|our team|hosted by)\b/i, url: /\/(about|team|authors?)\b/i },
    { id: "join", intent: "proposal", question: "How do I join the community?", classes: ["signup"], importance: 0.5, text: /\b(join (the |our )?(community|discord|slack|forum)|become a member)\b/i },
    shared.contact("How do I get in touch?", 0.5),
  ],
};

interface ContextRule {
  /** Start-page copy that implies the question. */
  when: RegExp;
  /** Site types the rule applies to (default: all). */
  siteTypes?: SiteType[];
  template: (match: RegExpMatchArray) => QuestionTemplate;
}

/** Copy on the start page that raises a question the site should then answer. */
const CONTEXT_RULES: ContextRule[] = [
  { when: /\b(pricing|prices?|plans|paid|tickets?)\b/i, template: () => shared.cost(0.8) },
  {
    when: /\benterprise\b/i,
    siteTypes: ["saas", "commerce"],
    template: () => ({
      id: "ctx-sales", intent: "proposal", question: "How do I contact sales?", classes: ["contact-form"], importance: 0.8,
      text: /\b(contact sales|talk to sales|book a demo|request a demo)\b/i, endpointLabel: /\b(sales|demo|contact|talk to)\b/i,
    }),
  },
  {
    when: /\b(by application( only)?|apply to attend|applications? (open|close|due))\b/i,
    template: () => ({
      id: "ctx-apply-criteria", intent: "proposal", question: "Who gets accepted, and when will I hear back?", classes: [], importance: 0.7,
      text: /\b(criteria|eligib(le|ility)|who can apply|selection process|we('ll| will) (review|notify|let you know)|decisions? (by|on|within)|deadline|hear back)\b/i,
    }),
  },
  {
    when: /\b(free trial|free plan|free tier)\b/i,
    siteTypes: ["saas", "content"],
    template: () => ({
      id: "ctx-trial-limits", intent: "quotation", question: "What's included free, and what happens when it ends?", classes: ["pricing"], importance: 0.6,
      text: /\b(trial (ends|length|lasts)|\d+[- ]day (free )?trial|no credit card|free plan includes|upgrade (any ?time|when))\b/i,
    }),
  },
  {
    when: /\b(apis?|integrations?)\b/i,
    siteTypes: ["saas"],
    template: () => shared.integrations(0.6),
  },
  {
    when: /\b(venue|hotel|in[- ]person)\b/i,
    siteTypes: ["event"],
    template: () => ({
      id: "ctx-travel", intent: "information", question: "How do I get there and where should I stay?", classes: [], importance: 0.45,
      text: /\b(hotel (block|rate|discount)|room block|accommodations?|getting there|get directions|directions to|parking|public transit|nearby hotels?|travel (info|guide))\b/i,
    }),
  },
  {
    when: DATE,
    template: (m) => ({
      id: "ctx-date", intent: "proposal", question: `What happens on ${m[0].trim()}, and how do I take part?`, classes: ["schedule-event", "signup"], importance: 0.55,
      text: /\b(agenda|schedule|register|rsvp|apply|join us)\b/i,
    }),
  },
];

/** Detectors by questionId, so stored questions can be re-answered without regenerating. */
const registry = new Map<string, QuestionTemplate>(
  [
    ...homepageQuestions("content"),
    ...Object.values(QUESTION_BANK).flat(),
    ...CONTEXT_RULES.map((r) => r.template([""] as unknown as RegExpMatchArray)),
  ].map((t) => [t.id, t]),
);

const toQuestion = (t: QuestionTemplate, source: VisitorQuestion["source"]): VisitorQuestion => ({
  questionId: t.id,
  intent: t.intent,
  question: t.question,
  expectedEndpointClasses: t.classes,
  answered: false,
  importance: t.importance,
  source,
});

/** Bank + site-context questions, deterministic for a given graph. Homepage questions first, then importance desc. */
export function generateQuestions(graph: StateGraph, endpoints: Endpoint[], siteType: SiteType): VisitorQuestion[] {
  void endpoints;
  const out = new Map<string, VisitorQuestion>();
  for (const t of [...homepageQuestions(siteType), ...QUESTION_BANK[siteType]]) out.set(t.id, toQuestion(t, "bank"));

  const start = graph.states[0];
  if (start) {
    const copy = `${start.pageTitle}\n${start.visibleText}`;
    for (const rule of CONTEXT_RULES) {
      if (rule.siteTypes && !rule.siteTypes.includes(siteType)) continue;
      const m = copy.match(rule.when);
      if (!m) continue;
      const t = rule.template(m);
      const prev = out.get(t.id);
      // The site raises the topic itself, so the question matters more.
      if (prev) prev.importance = round(Math.min(1, prev.importance + 0.1));
      else out.set(t.id, toQuestion(t, "context"));
    }
  }
  return sortQuestions([...out.values()]);
}

function sortQuestions(qs: VisitorQuestion[]): VisitorQuestion[] {
  const hp = (q: VisitorQuestion) => Number(isHomepageQuestion(q));
  return qs.sort((a, b) => hp(b) - hp(a) || b.importance - a.importance || a.questionId.localeCompare(b.questionId));
}

export function isHomepageQuestion(q: Pick<VisitorQuestion, "questionId">): boolean {
  return (HOMEPAGE_QUESTION_IDS as readonly string[]).includes(q.questionId);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

const stateHay = (s: SiteState) => `${s.pageTitle}\n${s.visibleText}\n${s.actions.map((a) => a.label).join("\n")}`;

function snippet(hay: string, re: RegExp): string | null {
  const m = re.exec(hay);
  if (!m) return null;
  const from = Math.max(0, m.index - 40);
  return hay.slice(from, m.index + m[0].length + 60).replace(/\s+/g, " ").trim();
}

const usableKeywords = (words: string[]) => words.map((w) => w.trim()).filter((w) => w.length >= 2);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function keywordTemplate(q: VisitorQuestion): QuestionTemplate {
  const words = usableKeywords(q.keywords ?? []);
  return {
    id: q.questionId,
    intent: q.intent,
    question: q.question,
    classes: q.expectedEndpointClasses,
    importance: q.importance,
    text: words.length ? new RegExp(`\\b(${words.map(escapeRe).join("|")})\\b`, "i") : undefined,
  };
}

function detectInState(t: QuestionTemplate, s: SiteState): string | null {
  if (t.detect) {
    const hit = t.detect(s);
    if (hit) return hit;
  }
  if (t.url) {
    try {
      if (t.url.test(new URL(s.url).pathname)) return `URL ${new URL(s.url).pathname}`;
    } catch {
      /* ignore */
    }
  }
  if (t.text) {
    const hay = stateHay(s);
    const parts = (Array.isArray(t.text) ? t.text : [t.text]).map((re) => snippet(hay, re));
    if (parts.every(Boolean)) return parts.join(" … ");
  }
  return null;
}

/**
 * Mark each question answered when a discovered state's text/URL answers it, or an
 * endpoint of an expected class exists. Evidence cites the state + a snippet.
 * Homepage questions only look at the start page.
 */
export function answerQuestions(questions: VisitorQuestion[], graph: StateGraph, endpoints: Endpoint[]): VisitorQuestion[] {
  const start = graph.states[0];
  const byId = new Map(graph.states.map((s) => [s.stateId, s]));
  return questions.map((q) => {
    const t = registry.get(q.questionId) ?? keywordTemplate(q);
    const states = t.startOnly ? (start ? [start] : []) : graph.states;
    const classes = new Set(q.expectedEndpointClasses);
    const ep = endpoints.find(
      (e) =>
        classes.has(e.class) &&
        (!t.endpointLabel || t.endpointLabel.test(e.label)) &&
        (!t.startOnly || e.sourceStateId === start?.stateId || e.stateId === start?.stateId),
    );
    if (ep) {
      const at = byId.get(ep.sourceStateId ?? ep.stateId ?? "") ?? start;
      return {
        ...q,
        answered: true,
        answeredBy: { stateId: at?.stateId ?? "", url: ep.url, evidence: `${ep.class} endpoint "${ep.label.slice(0, 80)}"` },
      };
    }
    for (const s of states) {
      const evidence = detectInState(t, s);
      if (evidence) return { ...q, answered: true, answeredBy: { stateId: s.stateId, url: s.url, evidence } };
    }
    return { ...q, answered: false, answeredBy: undefined };
  });
}

/**
 * Optional LLM refinement (fast model): up to 5 extra site-specific questions with
 * their own answer keywords. Skipped for the keyless fixture client; any failure
 * returns the deterministic list unchanged.
 */
export async function refineQuestionsWithLlm(
  questions: VisitorQuestion[],
  graph: StateGraph,
  llm?: LlmClient,
): Promise<VisitorQuestion[]> {
  const start = graph.states[0];
  if (!llm || llm.name === "gemini-fixture" || !start) return questions;
  try {
    const raw = await llm.complete(
      `A visitor lands on this page. List up to 5 questions they would likely have that are NOT already in this list:
${questions.map((q) => `- ${q.question}`).join("\n")}
PAGE TITLE: ${start.pageTitle}
PAGE TEXT (truncated): ${start.visibleText.slice(0, 3000)}
Return VISITOR_QUESTIONS as JSON {"questions": [{"question": string, "intent": "information"|"quotation"|"proposal", "keywords": string[] (words an answer would contain), "importance": number 0-1}]}.`,
      { json: true },
    );
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      questions?: { question?: unknown; intent?: unknown; keywords?: unknown; importance?: unknown }[];
    };
    const known = new Set(questions.map((q) => q.question.toLowerCase()));
    const extra: VisitorQuestion[] = [];
    for (const p of parsed.questions?.slice(0, 5) ?? []) {
      if (typeof p.question !== "string" || known.has(p.question.toLowerCase())) continue;
      const intent = p.intent === "quotation" || p.intent === "proposal" ? p.intent : "information";
      const keywords = Array.isArray(p.keywords) ? usableKeywords(p.keywords.filter((k): k is string => typeof k === "string")).slice(0, 8) : [];
      if (keywords.length === 0) continue;
      known.add(p.question.toLowerCase());
      const importance = typeof p.importance === "number" ? round(Math.min(1, Math.max(0, p.importance))) : 0.5;
      extra.push({
        questionId: `llm-${createHash("sha1").update(p.question.toLowerCase()).digest("hex").slice(0, 8)}`,
        intent,
        question: p.question.slice(0, 200),
        expectedEndpointClasses: [],
        answered: false,
        importance,
        source: "llm",
        keywords,
      });
    }
    return sortQuestions([...questions, ...extra]);
  } catch {
    return questions;
  }
}

/** Generate → (optional LLM refine) → answer. Deterministic with the fixture client. */
export async function visitorQuestions(
  graph: StateGraph,
  endpoints: Endpoint[],
  siteType: SiteType,
  llm?: LlmClient,
): Promise<VisitorQuestion[]> {
  const generated = generateQuestions(graph, endpoints, siteType);
  const refined = await refineQuestionsWithLlm(generated, graph, llm);
  return answerQuestions(refined, graph, endpoints);
}
