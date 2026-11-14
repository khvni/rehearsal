import type { ActionNode, EndpointClass, IntentCategory } from "../contracts";

/**
 * Ordered endpoint-class patterns: first match wins, so more specific intents
 * (signup, contact) are tried before broad ones (schedule, docs).
 */
export const ENDPOINT_PATTERNS: readonly (readonly [EndpointClass, RegExp])[] = [
  [
    "signup",
    /\b(sign ?up|register|registration|get started|apply|application|join (now|us|the|today|free)|create (an |your )?account|start (a |your )?(free )?trial|free trial|get tickets|buy tickets|rsvp|enroll|waitlist)\b/,
  ],
  [
    "contact-form",
    /\b(contact|talk to (sales|us|an expert)|contact sales|get in touch|book a demo|request (a )?(demo|quote|proposal)|sponsor(ship)?|become a (sponsor|partner)|partner with|enquir(y|e)|inquir(y|e))\b/,
  ],
  ["pricing", /\b(pricing|prices?|plans|cost|quote|rates|tiers|billing|how much)\b/],
  ["download", /\b(download|install|app store|google play|get the app)\b|\.(pdf|dmg|exe|zip|msi|apk)\b/],
  [
    "next-steps",
    /\b(next steps?|what'?s next|newsletter|subscribe|email updates|stay (updated|in touch)|book a call|schedule a call|get updates)\b/,
  ],
  ["schedule-event", /\b(schedule|agenda|program(me)?|sessions?|talks|timetable|calendar|events?|lineup|itinerary)\b/],
  ["demo-video", /\b(demo|videos?|watch|youtube|livestream|live stream|recordings?|webinar|trailer)\b/],
  [
    "docs-answers",
    /\b(docs|documentation|faqs?|help|support|guides?|knowledge base|how it works|answers|resources|tutorials?)\b/,
  ],
];

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|loom\.com|wistia\.com)$/;

/** Which RFX intents an endpoint class serves. */
export const CLASS_INTENTS: Record<EndpointClass, IntentCategory[]> = {
  pricing: ["quotation"],
  signup: ["proposal"],
  "demo-video": ["information"],
  "contact-form": ["proposal", "quotation"],
  "docs-answers": ["information"],
  "next-steps": ["proposal"],
  "schedule-event": ["information"],
  download: ["information", "proposal"],
  other: ["information"],
};

/** Last path segment as words: /code/2026/get-started → "get started". */
export function pathWords(url: string | undefined): string {
  if (!url) return "";
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    return (segs[segs.length - 1] ?? "").replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
}

export function classifyText(text: string): EndpointClass | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  for (const [cls, re] of ENDPOINT_PATTERNS) if (re.test(t)) return cls;
  return null;
}

/** Classify a CTA/link by its visible label plus the destination's last path segment. */
export function classifyAction(action: Pick<ActionNode, "label" | "href">): EndpointClass | null {
  const byText = classifyText(`${action.label} ${pathWords(action.href)}`);
  if (byText) return byText;
  if (action.href) {
    try {
      if (VIDEO_HOSTS.test(new URL(action.href).hostname)) return "demo-video";
    } catch {
      /* ignore */
    }
  }
  return null;
}
