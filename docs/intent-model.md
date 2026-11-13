# Intent model — engineering reference

Implementation spec for PRD v3.0 §3–§7. The schemas below are TypeScript-ish pseudocode. When you implement them, they become zod schemas in `src/lib/contracts/index.ts` (contracts-first rule), extending the existing types rather than duplicating them. `?` means optional. All numbers are defaults, configurable through `ExperimentConfig`.

## 1. Enums

```ts
type IntentClass = "rfi" | "rfq" | "rfp";            // Information | Quotation | Proposal

type EndpointClass =
  | "answer" | "docs" | "video" | "case-study"        // RFI
  | "pricing" | "plan-compare" | "calculator" | "quote-form"   // RFQ
  | "signup" | "demo-booking" | "contact-sales" | "register" | "next-steps" | "download"; // RFP

type Archetype =
  | "devtool-saas" | "b2b-saas" | "cloud-infra" | "creative-saas" | "enterprise-hardware"
  | "event" | "community" | "hackathon-platform" | "agency-services" | "open-source-tool";

type Persona = "scanner" | "searcher" | "evaluator"; // Phase 0: scanner only

type ScanPattern = "f-pattern" | "layer-cake" | "spotted" | "z-pattern";

type Tier = 0 | 1 | 2;                               // 0 = code, 1 = Jev, 2 = Gemini
```

## 2. Endpoint classes: default intent, detector, reached predicate

Each endpoint class has one default intent. An instance can override it; for example, `contact-sales` found inside a "Request a quote" flow becomes `rfq`.

| Class | Intent | Tier 0 detector (any of) | `reached` when (read-only) |
|---|---|---|---|
| `answer` | rfi | FAQ/accordion (`details`, `[aria-expanded]` under a FAQ heading); a heading that matches the goal noun | Target text is visible in the viewport after ≤1 expand click |
| `docs` | rfi | path `/docs`, `/documentation`, `/guide`; host `docs.*`; sidebar nav + code blocks | Docs page renders and its H1 matches the goal subject (Jev `noul` if fuzzy) |
| `video` | rfi | `<video>`; iframe host ∈ {youtube, vimeo, wistia, mux, loom}; "watch" + play-icon button | Player element is visible, with nonzero size, in the viewport |
| `case-study` | rfi | path `/customers`, `/case-studies`, `/stories`; logo grid + "read story" | Story page renders |
| `pricing` | rfq | path `/pricing`, `/plans`; currency regex `[$€£]\s?\d` within 200 px of a plan heading; or `priceKind` = free/eligibility text on community/event sites | A price or a free/eligibility statement is visible |
| `plan-compare` | rfq | a table/grid with ≥2 plan columns and ✓/✗ or feature rows | Comparison grid is visible |
| `calculator` | rfq | range/number inputs plus a live price output; path `/calculator` | Calculator inputs are visible and enabled |
| `quote-form` | rfq | form + "quote" in heading/submit label; path `/quote`, `/rfq` | Form renders, required fields are visible, submit is present (never clicked) |
| `signup` | rfp | form with email (+ password or SSO buttons); path `/signup`, `/register`, `/join`, `/start`; "start free" CTA destination | Same as `quote-form`, or an SSO provider button is visible |
| `demo-booking` | rfp | embed host ∈ {calendly, chilipiper, hubspot meetings, savvycal}; "book a demo" form | Scheduler embed/redirect is present, or the form renders |
| `contact-sales` | rfp | path `/contact`, `/contact-sales`, `/talk-to-sales`; form + "sales" | Form renders (same rule as `quote-form`) |
| `register` | rfp | event/hackathon "register", "apply", "get tickets", "submit project"; ticketing host (tito, eventbrite, luma) | Registration form or ticket widget/redirect is present |
| `next-steps` | rfp | "get started", "get involved", "join us", "become a partner" with a non-form destination (e.g. Discord, newsletter, onboarding page) | Destination renders; off-site counts as reached (with no navigation beyond the click) |
| `download` | rfp | link to `.dmg`/`.exe`/`.zip`/`.pkg`; path `/download`; app-store badges | Download link is present (never clicked) |

Each detector emits `{ class, confidence ∈ [0,1], rule: string }`. If the top confidence is below 0.7, or the top two are within 0.1 of each other, Tier 1 runs (see §7).

## 3. Weighting tables

Both tables are checked in as `src/lib/intent/priors.ts` and are reviewable. The values are initial priors to be tuned on the corpus. They are not measured.

```ts
// Share of visitors per intent, by archetype (each row sums to 1).
const intentShare: Record<Archetype, Record<IntentClass, number>> = {
  "devtool-saas":        { rfi: 0.40, rfq: 0.25, rfp: 0.35 },
  "b2b-saas":            { rfi: 0.35, rfq: 0.25, rfp: 0.40 },
  "cloud-infra":         { rfi: 0.35, rfq: 0.35, rfp: 0.30 },
  "creative-saas":       { rfi: 0.30, rfq: 0.25, rfp: 0.45 },
  "enterprise-hardware": { rfi: 0.45, rfq: 0.35, rfp: 0.20 },
  "event":               { rfi: 0.45, rfq: 0.15, rfp: 0.40 },
  "community":           { rfi: 0.50, rfq: 0.10, rfp: 0.40 },
  "hackathon-platform":  { rfi: 0.35, rfq: 0.10, rfp: 0.55 },
  "agency-services":     { rfi: 0.45, rfq: 0.15, rfp: 0.40 },
  "open-source-tool":    { rfi: 0.55, rfq: 0.05, rfp: 0.40 },
};

// Within-intent importance of each endpoint class (each intent group sums to 1 per archetype).
// 0 = not expected on this archetype (absence is not a finding).
const archetypePrior: Record<Archetype, Partial<Record<EndpointClass, number>>> = {
  "devtool-saas": { docs: .45, answer: .20, video: .15, "case-study": .20,
                    pricing: .70, "plan-compare": .20, calculator: .10,
                    signup: .60, "demo-booking": .15, "contact-sales": .20, download: .05 },
  "enterprise-hardware": { answer: .35, docs: .30, video: .20, "case-study": .15,
                    "quote-form": .55, pricing: .25, "plan-compare": .20,
                    "contact-sales": .60, "demo-booking": .25, download: .15 },
  "event":        { answer: .70, video: .30,
                    pricing: 1.0,
                    register: .85, "next-steps": .15 },
  "community":    { answer: .80, video: .20,
                    pricing: 1.0,                      // priceKind: free | eligibility
                    "next-steps": .70, register: .30 },
  "hackathon-platform": { answer: .60, docs: .20, video: .20,
                    pricing: 1.0,
                    register: .60, signup: .40 },
  // …remaining archetypes follow the same shape
};
```

```ts
interface WeightedEndpoint { endpointId: string; importance: number } // Σ importance = 1 per site

importance(e) = intentShare[a][e.intent] × archetypePrior[a][e.class] × instanceFactor(e)
               → then normalize over all detected endpoints

instanceFactor(e) =
    1.0  canonical instance of its class (best confidence, linked from primary nav)
    0.5  duplicate instance of the same class (e.g., footer pricing FAQ)
    × ownerOverride[e.class] ?? 1
```

**Missing endpoints.** If a class with prior ≥ 0.3 has no instance after discovery, emit a `MissingEndpoint { class, intent, prior }`. It becomes a finding (K7/K6) only if discovery did *not* hit its budget. Otherwise the scorecard marks the class `unresolved`.

## 4. Graph + layout extensions

```ts
// Extends SiteState (optional, so v2 fixtures still parse).
interface SiteState { /* …v2 fields… */ layout?: LayoutSnapshot }

interface LayoutSnapshot {
  viewport: Viewport;                 // existing contract
  scrollHeight: number;               // px
  folds: number;                      // ceil(scrollHeight / viewport.height), capped at maxFolds
  scanPattern: ScanPattern;
  elements: LayoutElement[];          // actions + headings + media, ≤ 200 by visualWeight
  regions: { header?: BBox; nav?: BBox; main?: BBox; footer?: BBox; search?: BBox };
  trunk: TrunkSignals;                // §6
  wordsByFold: number[];
}

interface BBox { x: number; y: number; w: number; h: number }   // page coordinates, px

interface LayoutElement {
  ref: string;                        // actionId if actionable, else "h:<n>" / "m:<n>"
  kind: "action" | "heading" | "media" | "form";
  bbox: BBox;
  foldIndex: number;                  // floor(bbox.y / viewport.height)
  region: "header" | "nav" | "main" | "footer" | "overlay";
  style: { fontPx: number; fontWeight: number; contrast: number; bgSaturated: boolean; isButton: boolean };
  visualWeight: number;               // §5, 0..1 normalized per state
  scanRank: number;                   // 1 = first fixation; computed per fold
  endpointHint?: { class: EndpointClass; confidence: number; tier: Tier };
}

// Extends ActionNode.
interface ActionNode { /* …v2 fields… */ layoutRef?: string }   // → LayoutElement.ref

// New pseudo-actions in the fold-expanded graph (not persisted as ActionNodes).
type MoveKind = "action" | "scroll" | "back" | "give-up";
```

**Capture.** `openPage` runs one `page.evaluate` per state that returns `LayoutSnapshot` minus `visualWeight`/`scanRank`, which are computed in Node so they are deterministic and testable. It also returns one screenshot per fold (≤ `maxFolds`).

## 5. Visual weight and scan rank (Tier 0)

```ts
visualWeight(el) = normalize(
    0.30 * log(area(el.bbox)) / log(maxArea)
  + 0.20 * (el.style.fontPx / maxFontPx)
  + 0.15 * (el.style.fontWeight >= 600 ? 1 : 0.4)
  + 0.15 * min(el.style.contrast / 7, 1)          // WCAG contrast ratio, 7 → 1.0
  + 0.15 * (el.style.isButton || el.style.bgSaturated ? 1 : 0)
  + 0.05 * isolation(el)                          // whitespace around it, 0..1
)

positionalPrior(el, pattern, vpH):
  y' = (el.bbox.y mod vpH) / vpH ; x' = el.bbox.x / vpW
  f-pattern:  exp(-2.5*y') * (x' < 0.5 ? 1 : 0.5)
  layer-cake: el.kind === "heading" ? 1 : 0.5 * exp(-1.5*y')
  spotted:    1                                    // weight dominates
  z-pattern:  max(exp(-3*y') * (1 - 0.3*x'), (y' > 0.7 ? 0.6 : 0))

scanScore(el) = visualWeight(el) * positionalPrior(el, pattern, vpH)
scanRank      = rank of scanScore within (state, foldIndex), descending
fixationsTo(target) = scanRank(target) among elements in the same fold

classifyScanPattern(layout):
  textDensity = words / mainArea; headingRatio = headings / blocks; ctaCount = buttons in fold 0
  textDensity high & left-aligned         → f-pattern
  headingRatio > 0.3                      → layer-cake
  ctaCount ≤ 3 & textDensity low          → z-pattern
  else                                    → spotted

prominence(endpoint, entryState) =
  max over entry-state elements e linking toward endpoint (direct link or 1-hop nav parent) of
    visualWeight(e) * (e.foldIndex === 0 ? 1.0 : 0.5 ** e.foldIndex) / scanRank(e)
```

All constants live in `src/lib/intent/scan.ts` with the comment "model defaults, uncalibrated."

## 6. Journey ontology

```ts
interface Goal {
  goalId: string;
  intent: IntentClass;
  text: string;                       // generated or user-supplied
  source: "generated" | "user";
  targets: EndpointClass[];           // ordered by preference
  endpointIds: string[];              // concrete endpoints that satisfy it
}

interface Endpoint {
  endpointId: string;
  class: EndpointClass;
  intent: IntentClass;
  stateId: string;                    // where it lives
  anchor: { selector?: string; layoutRef?: string; url: string };
  confidence: number;
  detectedBy: { tier: Tier; rule: string };
  importance: number;                 // §3, normalized
  priceKind?: "paid" | "free" | "eligibility";
}

// Node of the fold-expanded graph: one decision point.
interface SubState { subId: string /* `${stateId}#${fold}` */; stateId: string; fold: number }

interface JourneyEdgeCost {
  clicks: number; scrollPx: number; fixations: number; wordsRead: number;
  entropy: number;                    // bits, from Jev next_move distribution at the source
  latencyMs: number;                  // measured during discovery
}
scalarCost(c) = 0.25*c.fixations + c.scrollPx/1000 + c.wordsRead/4 + 1.0*c.clicks + 2.0*c.entropy + c.latencyMs/1000

interface JourneyEdge {
  from: string; to: string;           // SubState ids or terminal ids
  move: MoveKind; actionId?: string;
  p: number;                          // transition probability (Jev, persona-shaped)
  cost: JourneyEdgeCost;
}

type Terminal =
  | { kind: "endpoint"; endpointId: string }
  | { kind: "dead-end" } | { kind: "give-up" } | { kind: "budget" } | { kind: "off-site" };

interface JourneyTree {               // per (goal, persona); materialized for display + spec
  goalId: string; persona: Persona;
  root: string;                       // entry SubState
  nodes: (SubState | Terminal & { id: string })[];
  edges: JourneyEdge[];               // pruned: p ≥ pMin(0.02) or on a shortest path to a target
  reach: number;                      // P(any endpoint in goal.endpointIds)
  expectedCost: JourneyEdgeCost;      // conditional on reach
  topPaths: JourneyPath[];            // k = 3 by −log p, plus cheapest and most-probable-failing
}

interface JourneyPath { edges: number[] /* indexes into edges */; p: number; cost: JourneyEdgeCost; terminal: Terminal }
```

**Fold-expanded moves.** At `SubState(s, k)`, the candidate moves are:

- `action(a)`: an action whose `foldIndex ≤ k`, limited to the top K=12 by `scanScore`, with earlier folds discounted ×0.5 per fold back.
- `scroll`: to `(s, k+1)`, only if `k+1 < folds`. Cost = `scrollPx: vpH`, plus the fixations for the new fold.
- `back`: to the parent sub-state. Cost = `clicks: 1`.
- `give-up`: goes to a terminal.

**Trunk signals** (captured in layout, scored per non-home state):

```ts
interface TrunkSignals {
  siteId: boolean;      // logo/img/text in header region linking to origin "/"
  pageName: boolean;    // exactly one prominent H1 (visualWeight ≥ 0.6) and token overlap with <title> or active nav label
  sections: boolean;    // primary nav with ≥ 3 links present in header region, same set as home ±1
  localNav: boolean;    // secondary nav/sidebar/tabs in main region, or state is a leaf (n/a → true)
  youAreHere: boolean;  // aria-current, .active/.is-active/.selected on a nav item, or breadcrumb whose last item ≈ H1
  search: boolean;      // role=search | input[type=search] | button/link labelled "search" | ⌘K hint
}
trunkScore = count(true) // 0..6
```

## 7. Jev questions (Tier 1)

All questions go through the existing `JevClient.decide(state, questions)`. The `state` payload is always compact (≤ ~1.2 k chars) and never contains raw HTML.

```ts
// Sweep: one batched request per (SubState, goal.intent, persona)
decide({
  intent, goal: goal.text, persona,
  page: { title, h1, url: path only, fold: k, of: folds },
  visible: topKElements.map(e => `${e.ref}: ${e.label} [${e.region}, rank ${e.scanRank}]`),
}, [
  { type: "choice", name: "next_move",
    instructions: PERSONA_PREAMBLE[persona] + INTENT_PREAMBLE[intent],
    criteria: { ...Object.fromEntries(topK.map(e => [e.ref, e.label])),
                scroll: "scroll down to see more", back: "go back", give_up: "leave the site" } },
  // only when an endpoint anchor of a target class is in folds ≤ k:
  { type: "noul", name: "endpoint_here",
    instructions: "Does what is visible on screen satisfy the goal?",
    criteria: { true: "yes, the goal is satisfied here", false: "no" } },
  { type: "score", name: "ambiguity",
    instructions: "How hard is choosing the next step for this goal?",
    criteria: { "0": "obvious", "0.5": "some thought", "1": "confusing" } },
]);

// Cache key
sha1(stateHash | fold | intent | persona | sha1(sorted candidate refs+labels) | JEV_MODEL)

// Classification fallbacks (one question each)
endpoint_class:  choice over EndpointClass ∪ {"none"} — state: title, h1, fold-0 text ≤600, form field labels
archetype:       choice over Archetype — state: title, h1, meta description, nav labels
goal_intent:     choice over {rfi, rfq, rfp} + choice over EndpointClass — state: goal text, site archetype
four_questions:  4× noul on fold-0 text (what is it / what do they have / what can I do / why here)
```

**Persona shaping** is applied after Jev and is deterministic; it generalizes the v2 `applyProfile`:

| Persona | Rule |
|---|---|
| `scanner` | `p ← p^1.6` (sharpen); `scroll` ×0.7 beyond fold 1; `give_up` floor 0.05 |
| `searcher` | ×2 on the search affordance and on header-nav actions |
| `evaluator` | `p ← p^0.7` (flatten); `scroll` ×1.3; `give_up` floor 0.01 |

Renormalize after shaping.

**Fixture client.** `FixtureJevClient` keeps its token-overlap scoring and adds two terms: `+1/scanRank` (scan bias) and an intent lexicon per intent (rfq: price, plan, cost, quote, free; rfp: start, sign, book, demo, register, apply, contact; rfi: docs, learn, how, what, about, faq). It stays deterministic.

## 8. Exact reach (Tier 0)

```
Let T = transient SubStates, A = absorbing terminals.
Q[i][j] = p(i→j) for i,j ∈ T;  R[i][a] = p(i→a) for a ∈ A
N = (I − Q)^-1                       // fundamental matrix; |T| ≤ maxExactSubStates (250)
B = N·R                              // B[root][endpoint] = P(reach endpoint from root)
reach(goal) = Σ_{a ∈ goal.endpointIds} B[root][a]
E[cost | reach]: solve c = Q·c + r over T, with r = expected one-step scalar cost,
                 conditioned via Doob h-transform with h = B[·][goal endpoints]
topPaths: Yen's k-shortest on edge weight −log p (k=3); cheapest: Dijkstra on scalarCost
          restricted to paths ending at goal endpoints; mostProbableFailing: Yen on −log p ending in
          {dead-end, give-up, budget}
|T| > 250 → seeded Monte Carlo (mulberry32, v2 sampler), 20k samples, report 95% CI
```

Use a small dense solver; with ≤250 nodes, Gauss-Jordan in plain TS is enough. No new dependency.

## 9. Outputs

```ts
interface IntentScorecardRow {
  intent: IntentClass; goalId: string; endpointId?: string; endpointClass?: EndpointClass;
  status: "resolved" | "unresolved";  // unresolved ≠ failure; means not found within budget
  importance: number;
  reach: number; clicks: number; folds: number; modeledSeconds: number; entropyMax: number;
  verified?: { runId: string; reached: boolean; measuredFolds: number; measuredClicks: number };
}

interface SiteScorecard {
  archetype: Archetype; archetypeConfidence: number;
  rows: IntentScorecardRow[];
  trunkMean: number; trunkMin: { stateId: string; score: number };
  hierarchyTau: number;               // Kendall τ(importance, prominence) over endpoints
  competingPrimaryCtas: number; wordsAboveFold: number;
  fourQuestions?: Record<"what" | "have" | "do" | "why", number>; // Phase 1
}

interface RunCost {
  gemini: { calls: number; model: string[] };
  jev: { requests: number; cacheHits: number };
  browser: { discoverySessions: number; verifySessions: number; actHeals: number };
  wallMs: number;
}

// Experiment additions (all optional, so v2 experiments still parse)
interface Experiment {
  /* …v2… */
  archetype?: Archetype; endpoints?: Endpoint[]; goals?: Goal[];
  journeys?: JourneyTree[]; scorecard?: SiteScorecard; runCost?: RunCost;
}

// ExperimentConfig additions
interface ExperimentConfig {
  /* …v2… */
  maxFolds: 6; topK: 12; pMin: 0.02; maxExactSubStates: 250;
  personas: Persona[];                // default ["scanner"]
  endpointWeights?: Partial<Record<EndpointClass, number>>;  // owner override multipliers
  goals?: { intent: IntentClass; text: string }[];           // user goals (override generated)
  budgets: { states: 25 | 40 | 80; jevRequests: 720; geminiCalls: 2; verifyRuns: 12 };
}
```

**Finding linkage.** Every v3 finding carries metric provenance in `description` (or in a future `metric` field):

```
{ metric: "folds-to-endpoint", value: 4, threshold: 2, endpointId, goalId, krugPrinciple }
```

**Spec grouping.** Each `SpecChange` adds `intent?: IntentClass` and `endpointId?: string`. `specToMarkdown` groups changes as `## RFI / ## RFQ / ## RFP → ### <endpoint>`, keeping severity order within each group.

## 10. Module layout (proposed)

```
src/lib/intent/
  taxonomy.ts      enums, class→intent defaults, goal templates
  detect.ts        Tier 0 endpoint + archetype rules
  priors.ts        intentShare, archetypePrior, importance()
  scan.ts          visualWeight, positionalPrior, scanPattern, prominence, trunk scoring
  sweep.ts         fold expansion, Jev batching + cache, persona shaping
  reach.ts         absorbing-chain solve, k-shortest, MC fallback
  metrics.ts       scorecard + thresholds → findings
```

Each file gets unit tests. The eval files are `intent.eval.ts`, `layout.eval.ts`, and `sweep.eval.ts`; they must be listed in `.devin/skills/rehearsal-testing/SKILL.md` in the commit that adds them.
