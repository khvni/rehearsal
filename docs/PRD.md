# Rehearsal — Product Requirements Document

**Version:** 3.0 — intent-driven journey audit
**Date:** November 13, 2026
**Status:** Replaces PRD v2.0. The v2.0 loop, adapters, safety rules and CI gates stay. This version changes *what* gets modeled and *how cheaply* it is swept.
**Targets:** any public marketing or product site. Reference corpus: keysight.com, mtc.so, brightdata.com, devpost.com, mlh.io, tigerdata.com, sentry.io, snowflake.com, digitalocean.com, hyperframes.studio, heygen.com, plus ai.engineer/code/2026 (the v2.0 fixture).
**Primary output:** still `spec.md`, the list of changes. It is now grouped by visitor intent and endpoint, and each change links to a measured journey cost or a verified browser run.
**Engineering reference:** [`docs/intent-model.md`](./intent-model.md) has the schemas and algorithms to build from.

---

## 0. What changed from v2.0, and why

v2.0 works end to end, but only on one page with one goal. The code shows why:

- **Run setup:** you type one free-text goal.
- **Discovery:** breadth-first crawl over regex-parsed HTML. Links are ranked by goal-keyword overlap.
- **Success check:** text overlap with 2–3 assertions that an LLM compiled from the goal. The sample spec's top "verified failure" is `url-matches "schedule"`. That is an assertion artifact, not a usability problem.
- **Simulation:** 1,000 random walks over ≤30 states.
- **Compare stage:** hard-coded to the stale-CTA finding (`/post-event|stale/`).

None of this works on sentry.io or devpost.com. Here is what v3.0 changes.

| # | v2.0 issue | v3.0 change |
|---|-----------|-------------|
| 1 | **One free-text goal per run.** Success depends on how the goal is worded. The LLM-compiled assertions are brittle: `url-matches "schedule"` failed and was reported as a verified failure. | **Intent taxonomy (RFI / RFQ / RFP).** Each run audits all three intent classes. Goals are *generated* from the site's endpoints, and the user can override them. Success means **an endpoint was reached**: a typed, located page/element such as a pricing table, signup form, or demo video. Free-text matching is no longer the test (§3). |
| 2 | **No notion of what matters on a site.** All states and actions have equal weight. Findings like "407 links" have no priority. | **Endpoint discovery + weighting.** Endpoints are classified into 12 classes. Each class gets an importance weight from (a) site archetype priors (SaaS / devtool / enterprise / event / community / agency / creative tool) and (b) owner overrides. Importance is kept **separate from prominence**, and the gap between them is itself a finding (§4). |
| 3 | **Graph has no geometry.** `extractPage` regex-parses HTML, so there is no fold, no scroll height, no visual weight, and nothing to support hierarchy or scan claims. | **Rendered layout snapshot per state.** We record bounding boxes, fold index, and computed visual weight for every action and heading. Scroll becomes an explicit action in the graph, and the scan model (F-pattern / layer-cake / spotted) runs on real geometry (§5, §7). |
| 4 | **"Decision tree" was implicit.** The state graph stores states + edges. Trajectories are sampled from it, and the tree is never materialized or costed. | **Journey ontology.** `Intent → Goal → Endpoint → JourneyTree`. The tree is unrolled from the graph per intent and persona. Each edge carries a cost vector: clicks, scroll px, modeled scan fixations, words read, decision entropy. The tree is what the dashboard shows and what the spec cites (§5). |
| 5 | **1,000 Monte Carlo walks over ≤30 states.** Most samples repeat, and results are noisy at any seed. | **Exact sweep.** Jev distributions become transition probabilities. Reach probability and expected cost per (intent, endpoint, persona) are computed **exactly** by dynamic programming over the absorbing chain. Monte Carlo stays only as a cross-check (eval) and for graphs above the exact-solve cap (§6). |
| 6 | **Jev asked one generic question per state.** The fixture is token overlap. Gemini usage per run was unbounded: assertion compile + findings + spec, plus Stagehand `act()` on every heal. | **Explicit cost tiers (§6.3).** Tier 0 is deterministic code (classification rules, layout, trunk test, scan model, DP). Tier 1 is Jev, with typed `choice`/`noul`/`score` questions cached by `(stateHash, intent, persona)`. Tier 2 is Gemini: **≤2 calls per run by default** (archetype tie-break if needed + spec narrative). It is never inside the per-state loop. |
| 7 | **Krug metrics were rule-of-thumb.** `ruleFindings` = stale dates, vague labels, link count, missing identity. | **Krug-grounded metric set (§7).** Trunk-test score (6 checks), four-questions-above-fold, hierarchy alignment (rank correlation of importance vs prominence), folds-to-endpoint, modeled scan time, competing primary CTAs, words above fold. Each metric has a threshold → finding → Krug key. |
| 8 | **Hard-coded to the AIE page.** Compare targets the stale finding by regex. Date rules assume an event site. Budgets (30 states / depth 3) are too small for mega-menu sites like snowflake.com. | **Works on any site.** Archetype-gated rules (stale-date only fires for `event`). The variant generator chooses a patch from the top finding's *type* (promote CTA, relabel, add nav marker), not from regex on its title. Budgets are per-intent and endpoint-seeking (§6.1). The 12-site corpus is the eval set (§9). |
| 9 | **Comparison had a bug and weak deltas.** `backtracks` delta is populated from `steps.length`. Deltas are click counts only. | Deltas are re-expressed as **journey deltas**: Δ reach probability, Δ expected cost, Δ trunk score, Δ hierarchy alignment per affected endpoint. The `backtracks` bug is listed as a v3 fix item (§8 Phase 0). |
| 10 | **Spec grouped by severity only.** | Spec is **grouped by intent → endpoint**: "RFQ: pricing is 3.2 folds + 2 clicks deep and below 9 competing CTAs." Severity ordering still applies within each group. Each change states the journey delta it is expected to produce, and the verified ones show the measured delta. |

Kept from v2.0: adapters that no-op without keys, the evidence classes, Krug citations, the safety rules (public pages, politeness, **no form submission**), Terraform deploy, evals in CI, and skill-sync.

## 1. Product thesis (revised)

Every site exists to move visitors to a small number of **endpoints**: the pricing table, the signup form, the demo video, the answer, the "next steps." Visitors arrive with one of three intents. Rehearsal:

1. finds those endpoints and weights them,
2. builds the decision tree visitors traverse to reach them, costed in clicks, scrolling, and scanning,
3. sweeps that tree with a cheap typed decision model (Jev) instead of an LLM agent,
4. verifies the paths that matter in real browsers,
5. writes a spec of what to change.

It does this on any public site, at a cost per site that allows auditing hundreds of sites, not one.

**Pitch:** *Rehearsal maps what your visitors came for, measures how hard it is to get there, and hands you the spec to fix it.*

**Why not just point an LLM browser agent at the site?** Three reasons:

- **Cost scales badly.** An LLM agent is one expensive, slow, non-reproducible sample per journey.
- **Results don't reproduce.** Two runs of the same agent on the same site give different journeys.
- **It doesn't model scanning.** An agent reads the whole DOM; humans don't. The scan model in §5 is what makes findings human-shaped.

Rehearsal's sweep is deterministic, cached, and exhaustive over the tree, and it uses LLMs only at the edges.

## 2. Grounding: Don't Make Me Think (unchanged canon, new measurements)

`docs/krug-principles.md` stays the canon (K1–K9, 10 rubric dimensions). v3.0 adds **measurable proxies** for the principles that v2.0 only cited (§7). Krug's satisficing model ("users glance, pick the first reasonable option, and muddle through") is the explicit behavioral model behind the scan model and the Jev persona prompts.

## 3. Intent taxonomy: RFI / RFQ / RFP

The categories borrow procurement terms (RFX). In procurement, a buyer moves from *learning what exists* (RFI), to *pricing a known need* (RFQ), to *asking for a proposal and committing to an engagement* (RFP). Site visitors follow the same arc. Each intent is defined by **what the visitor needs to leave with**.

| Intent | Visitor question | Leaves with | Example goals (per site type) | Primary endpoint classes | Secondary |
|---|---|---|---|---|---|
| **RFI — Information** | "What is this, does it do X, can I trust it?" | An answer | SaaS: "Does Sentry support session replay for React Native?" · Event: "When and where is AI Engineer Code?" · Community: "What is MTC and who is it for?" · Enterprise: "Does Keysight make a 6G channel emulator?" | `answer`, `docs`, `video`, `case-study` | `contact` (ask a question) |
| **RFQ — Quotation** | "What will it cost me, which option fits?" | A number or a fit decision | SaaS: "How much is Tiger Data for 500 GB?" · Cloud: "What does a 4 GB DigitalOcean droplet cost?" · Event: "How much is a ticket?" · Hackathon: "Is MLH free / am I eligible?" · Enterprise: "Request a quote for an oscilloscope" | `pricing`, `plan-compare`, `calculator`, `quote-form` | `contact-sales`, `docs` (limits/quotas) |
| **RFP — Proposal** | "I'm ready. How do I start, or talk to someone?" | A committed next step | SaaS: "Start a free trial" · Enterprise: "Book a demo with sales" · Hackathon platform: "Submit a project on Devpost" · Event: "Register / apply" · Agency/community: "Get involved / partner with us" | `signup`, `demo-booking`, `contact-sales`, `register`, `next-steps` | `quote-form`, `download` |

**RFQ without prices.** On sites that don't sell (community, open-source tool, free hackathon), RFQ is the *cost to participate*: money, time, eligibility, requirements. "Is it free? Am I eligible? What do I need?" Its endpoints are eligibility/FAQ/requirements content, classed as `pricing` with `priceKind: "free" | "eligibility"`. This keeps the three-way split usable on every archetype (open question Q1).

**RFP endpoints are forms, and we never submit them.** An RFP endpoint counts as **reached** when:

- the form or booking widget renders,
- its required fields are visible and enabled, and
- the submit control is present.

Submission is never attempted (v2.0 §11 stands). For third-party schedulers (Calendly, HubSpot meetings) that sit in an iframe or open off-site, "the embed or redirect is present" counts as reached.

**Goal generation.** Each run gets ≤3 goals per intent, generated deterministically from endpoints. Template: `"{intent verb} {endpoint subject}"`, e.g. "Find the price of {product}". The product noun is taken from the homepage H1/title. The user can replace or add goals in free text. A free-text goal is mapped to an intent and target endpoint classes by **one Jev `choice` call**, not an LLM.

## 4. Endpoint discovery and weighting

### 4.1 Endpoint classes

The 12 classes are `answer | docs | video | case-study | pricing | plan-compare | calculator | quote-form | signup | demo-booking | contact-sales | register | next-steps | download`. `answer` and `next-steps` are deliberately broad catch-alls; definitions and detectors are in intent-model.md §2.

### 4.2 Detection (cheap first)

1. **Tier 0 rules, about 80% of cases.** The rules look at URL path tokens, nav/footer labels, element semantics, and embeds:
   - path tokens: `/pricing`, `/plans`, `/signup`, `/register`, `/contact`, `/demo`, `/docs`
   - element semantics: a `<form>` with an email + password field means `signup`; a `<video>` or an embed of YouTube/Vimeo/Wistia/Mux means `video`
   - currency regex near plan headings means `pricing`
   - the known embed hosts Calendly/Chili Piper/HubSpot mean `demo-booking`

   Each rule emits `(class, confidence)`.
2. **Tier 1 Jev**, only when Tier 0 confidence is below 0.7 or two classes tie. One `choice` question per candidate: the options are the endpoint classes plus `none`, and the state is the page title, H1, above-fold text (≤600 chars), and form-field labels.
3. **Tier 2 Gemini: none by default.** It is only allowed for the archetype tie-break (§4.3).

### 4.3 Site archetype

Archetype ∈ `devtool-saas | b2b-saas | enterprise-hardware | cloud-infra | creative-saas | event | community | hackathon-platform | agency-services | open-source-tool`. It is chosen by Tier 0 signals plus one Jev `choice` over archetypes using homepage title/H1/nav labels/meta description. The signals:

- has `/pricing` with tiers
- has a `/docs` subdomain
- has date ranges plus "register"/"apply"
- has "hackathons" plus a submission flow
- has "request a quote" plus a product catalog
- has a GitHub star badge

If Jev's top-2 margin is < 0.15, there is **one** `gemini-4-hydrogen` call. The archetype also gates archetype-specific rules (e.g. stale-date only for `event`).

Expected archetypes for the corpus are to be confirmed by hand-labeling (part of the eval set in §9):

| Site | Expected archetype |
|---|---|
| sentry.io | devtool-saas |
| tigerdata.com | devtool-saas |
| digitalocean.com | cloud-infra |
| snowflake.com | b2b-saas |
| brightdata.com | b2b-saas |
| heygen.com | creative-saas |
| hyperframes.studio | open-source-tool or creative-saas (unverified) |
| keysight.com | enterprise-hardware |
| devpost.com | hackathon-platform |
| mlh.io | community / hackathon-platform |
| mtc.so | community |
| ai.engineer | event |

### 4.4 Importance weighting

```
importance(e) = archetypePrior[archetype][e.class] × intentShare[archetype][e.intent] × instanceFactor(e)
```

normalized to sum to 1 per site. The parts:

- `archetypePrior` and `intentShare` are checked-in, reviewable tables (intent-model.md §3). Examples:
  - devtool-saas: RFI 0.40 / RFQ 0.25 / RFP 0.35; `docs` and `signup` high
  - enterprise-hardware: `quote-form` and `contact-sales` high, `signup` near 0
  - event: `register` and `answer(when/where)` dominate
- `instanceFactor` breaks ties among endpoints of the same class. Canonical beats duplicate: the primary `/pricing` beats a footer "pricing FAQ."
- Owners can override any weight per site (`ExperimentConfig.endpointWeights`).

**Importance ≠ prominence.** Importance comes only from the archetype tables and owner overrides, never from how loudly the site displays something. Prominence is *measured* from the layout (§5.3). The audit's central signal is the **gap**: a high-importance endpoint with low prominence and high journey cost. If importance were inferred from the page's own emphasis, the audit would only confirm whatever the site already does.

## 5. Journey ontology (the decision tree)

Full schemas are in intent-model.md §4–§6. The shape:

```
Site ─ archetype
 ├─ Intent (RFI | RFQ | RFP) ─ share
 │   └─ Goal ─ targets: EndpointClass[]
 │       └─ JourneyTree (per persona)
 │           nodes = (State, scrollFold) decision points
 │           edges = Action | Scroll | Back | GiveUp, each with p (Jev) and cost vector
 │           leaves = Endpoint reached | dead-end | give-up | budget
 └─ Endpoint ─ class, intent, importance, anchor(stateId, selector, bbox), reachedPredicate
StateGraph (v2, extended)
 └─ SiteState + LayoutSnapshot { scrollHeight, folds, elements[bbox, foldIndex, visualWeight, scanRank] }
```

### 5.1 Graph vs tree

- The **StateGraph** is site-level, deduplicated by `stateHash`, and shared across intents. Discovery builds it once.
- A **JourneyTree** is the per-(goal, persona) unrolling of the graph from the entry state. Depth is capped, cycles become `back`/`repeat` leaves, and pruning keeps only edges with `p ≥ pMin` (default 0.02) or edges on a shortest path to a target endpoint.

The tree is the "decision tree" users see; the graph is the storage form.

### 5.2 Scroll as a decision

v2.0 treated a page as one decision. Krug's satisficing visitor decides per screenful, so v3.0 splits each page state into **fold sub-states** `(stateId, fold k)`. At each fold the visitor can:

- act on something visible in folds ≤ k, weighted toward fold k and toward high scan rank,
- scroll to fold k+1, or
- go back / give up.

This makes "the pricing link is in the footer, 7 folds down" a measurable cost instead of an invisible one. Fold count is capped per state (default 6). Content below the cap is reachable only via a `scroll-deep` edge with a high fixed cost.

### 5.3 Visual hierarchy and scan pattern

All of this is Tier 0, deterministic, and computed from the layout snapshot.

- **Visual weight** per element: size, contrast, font weight, saturated background (button-ness), isolation (whitespace), and position. The formula is in intent-model.md §5.
- **Scan pattern** per state is classified from the layout:
  - `F-pattern`: text-dense, left-aligned columns
  - `layer-cake`: heading-dominant, short sections
  - `spotted`: sparse, CTA-led
  - `z-pattern`: hero with a few elements

  The pattern sets the positional prior used in scan order.
- **Scan rank** = elements ordered by `visualWeight × positionalPrior(pattern)`. Expected fixations to find a target ≈ the target's scan rank among the *competing candidates* in its fold.
- **Prominence(endpoint entry)** = visual weight × above-fold bonus × (1 / scan rank) of the best entry point on the entry page.

These are **model estimates**, labeled as such in every finding (evidence class `reproducible-concern` when computed from a rendered layout, never `verified-failure`). They are not human measurements. The constants (250 ms/fixation, 1,000 px/s scroll) are documented defaults pending calibration (Q5).

### 5.4 Cost vector per edge

| Field | Meaning |
|---|---|
| `clicks` | number of clicks |
| `scrollPx` | pixels scrolled |
| `fixations` | modeled scan fixations |
| `wordsRead` | words read |
| `entropy` | Jev choice entropy at the decision |
| `latencyMs` | measured, from discovery |

A journey's scalar cost (in modeled seconds) = `0.25·fixations + scrollPx/1000 + wordsRead/4 + 1.0·clicks + 2.0·entropy + latencyMs/1000`. The vector is reported in full and the scalar is used only for ranking.

## 6. The sweep: Jev + browser automation, not LLM agents

### 6.1 Discovery (browser, Tier 0)

Discovery is **endpoint-seeking best-first search**, not breadth-first. Link priority comes from:

- the Tier 0 endpoint-class score of label/href,
- the nav region (header/primary nav > footer > body), and
- the intent coverage still missing.

Budgets: ≤40 states per site (v1: 80), depth ≤4, and ≤6 folds per state.

For each state we use one browser session: navigate once, wait for load, then run a single `page.evaluate` that returns DOM + layout (`LayoutSnapshot`) and a screenshot per fold. This keeps the Bright Data rule "one session, one navigation per captured state." Desktop is the default and mobile is a second pass (Phase 1).

**Discovery stops early** once every intent has at least one endpoint at confidence ≥ 0.7, or the budget is hit.

### 6.2 Sweep (Jev, Tier 1)

For each fold sub-state, intent, and persona, send **one batched Jev request** with three typed questions:

- `choice` **next_move**: options = top-K candidate actions by scan rank (K ≤ 12) + `scroll` + `back` + `give_up`. Instructions are persona- and intent-specific (e.g. "You want the price. You scan; you don't read.").
- `noul` **endpoint_here**: "does what's visible satisfy the goal?" Run only when a candidate endpoint is anchored in this fold, so Tier 0 rules still decide where to ask.
- `score` **ambiguity**: 0 / 0.5 / 1.

**Caching.** Cache key = `(stateHash, fold, intent, persona, candidateSetHash)`. Identical states across sites and runs hit the cache. With 40 states × ~3 folds × 3 intents × 2 personas, that is ≤720 Jev requests before caching. Pruning (skip folds with no candidate within 2 scan ranks of a target-class link; skip intents already resolved on entry) typically cuts this 3–5× (target; measured in eval §9).

**Personas.** Each persona is a Jev instruction preamble plus a deterministic reshape of the distribution (the v2.0 `applyProfile` idea, generalized):

| Persona | Behavior |
|---|---|
| `scanner` | Krug default: satisfices on scan rank, impatient |
| `searcher` | Krug's farmer: prefers search and nav |
| `evaluator` | reads more, tolerates depth |

The demo uses `scanner` only.

**Exact reach.** The Jev distributions become transition probabilities on the fold-expanded graph. For each goal we solve the absorbing chain by DP / linear solve over ≤ ~250 sub-states. This gives:

- `P(reach endpoint)`
- `E[cost | reach]`
- the top-N most probable paths per endpoint (k-shortest by −log p)

Above the cap we fall back to seeded Monte Carlo (the v2.0 sampler) with confidence intervals.

### 6.3 Where each model is used (the cost contract)

| Step | Tier 0 (code) | Tier 1 (Jev) | Tier 2 (Gemini) |
|---|---|---|---|
| Layout, visual weight, scan rank, folds | ✓ | | |
| Endpoint classification | rules first | if conf < 0.7 | — |
| Archetype | signals | `choice` | 1× `hydrogen` only if Jev margin < 0.15 |
| Free-text goal → intent/endpoints | — | `choice` | — |
| Next-move distribution per fold | candidate set | ✓ | — |
| Endpoint satisfied? | anchor present | `noul` | — |
| Four homepage questions (K7) | above-fold text | 4× `noul` | — |
| Reach probability, expected cost, paths | ✓ (DP) | | |
| Trunk test, hierarchy alignment, metrics | ✓ | | |
| Browser verification replay | ✓ (Playwright locators) | | Stagehand `act()` only on locator miss, ≤3 per run |
| Findings | metric thresholds | | — (optional `argon` rewording behind a flag) |
| Spec narrative + rebuild plan | change list assembled in code | | 1× `argon` |

**Budget per site.** Defaults:

| Resource | Budget |
|---|---|
| Gemini calls | ≤2 (0 when Jev is confident; 1 for the spec) |
| Jev requests | ≤720 uncached |
| Browser sessions | ≤40 discovery + ≤12 verification |

Every run logs actual counts and a cost estimate in `RunCost`. The dashboard shows it and evals assert the caps. We do not quote per-call prices in this PRD; they come from the live adapters' logs (Q4).

### 6.4 Verification (browser, Tier 0)

For each high-importance endpoint we replay three paths in a real browser:

- the **most probable path**,
- the **cheapest path**, and
- the **most probable failing path** (highest-probability path that ends in dead-end or give-up).

The replay re-measures fold positions and checks `reachedPredicate` (intent-model.md §2). The outcomes:

- **verified-failure**: the endpoint is unreachable along a path the model rated likely, or the entry point is broken (404, element missing, blocked by an overlay).
- **verified-success with cost**: the measured cost replaces the modeled one.

Default cap: 12 runs per site.

## 7. Krug-grounded metrics

All metrics are Tier 0 except where noted. Each has a finding threshold, and every finding cites the Krug key. Thresholds are defaults in `evals.config.json`-style config, tunable per archetype.

| Metric | Definition | Krug | Finding when | Evidence class |
|---|---|---|---|---|
| **Reach probability** `P_reach(g)` | DP over the Jev-weighted tree | K4, K9 | `< 0.5` for an endpoint with importance ≥ 0.1 | hypothesis (model) → verified-failure if replay fails |
| **Folds to endpoint** | scroll folds on the best path | K2, K7 | primary RFQ/RFP entry > 2 folds on the homepage | reproducible-concern |
| **Clicks to endpoint** | clicks on the best path | K4 | > 3 for importance ≥ 0.1 (Krug: effort and confidence, not raw count, so it is paired with entropy) | reproducible-concern |
| **Modeled scan time** | Σ cost-model seconds on the best path | K2 | > 15 s modeled for a primary endpoint | reproducible-concern (labeled "modeled") |
| **Decision entropy** | mean Jev `next_move` entropy along the best path | K1, K4 | > 1.5 bits at any step | reproducible-concern |
| **Hierarchy alignment** | Kendall τ between endpoint importance and entry-point prominence on the entry page | K2, K7 | τ < 0.3 | reproducible-concern |
| **Competing primary CTAs** | above-fold elements with button-ness and weight ≥ 0.7× the max | K2, K4 | > 2 | reproducible-concern |
| **Words above fold** | visible words in fold 0, and the share that is happy talk (Tier 0 lexicon) | K5 | > 120 words or happy-talk share > 30% | reproducible-concern |
| **Four questions** | 4 Jev `noul` calls on fold-0 text: what is it / what do they have / what can I do / why here | K7 | any `p(true) < 0.5` | hypothesis |
| **Trunk test** | 6 checks per non-home state: site ID (logo linking home, in header), page name (H1 present and consistent with title/nav), sections (persistent primary nav), local nav, you-are-here (`aria-current` / active style), search (`role=search` / `input[type=search]` / search trigger) | K6, K8 | score ≤ 3/6 on any state, or a site mean < 4.5 | reproducible-concern |
| **Vague labels** | v2.0 rule, kept | K1 | any on a best path | reproducible-concern |
| **Stale claims** | v2.0 rule, gated to `event` | K5 | past dates + active register/apply CTA | reproducible-concern |
| **Dead-ends** | states on endpoint paths with no forward action | K6 | any | verified-failure if replay confirms |

The per-site scorecard is one row per (intent, top endpoint) with `P_reach`, clicks, folds, modeled seconds, and entropy, plus site-level trunk, alignment, and four-questions. This row is the cross-site comparison unit ("Sentry vs Tiger Data on RFQ").

## 8. Phased build plan and scope cuts

### Phase 0 — demo (a few hours)

Goal: the intent audit runs end-to-end on **3 live sites + the AIE fixture**. Proposed sites: sentry.io, devpost.com, keysight.com, which cover three different archetypes. It must run offline on recorded fixtures.

**In scope:**

1. Contracts: `IntentClass`, `EndpointClass`, `Endpoint`, `LayoutSnapshot`, `JourneyEdgeCost`, `IntentScorecard`, as in intent-model.md. Extend `SiteState` with an optional `layout`, extend `Experiment` with `endpoints`, `scorecard`, `runCost`.
2. Layout capture in `openPage` via one `page.evaluate`. Desktop only, ≤4 folds per state.
3. Tier 0 endpoint rules + archetype signals + the archetype prior table, with a Jev fallback for low confidence.
4. Endpoint-seeking discovery: ≤25 states, depth ≤3.
5. Fold-expanded Jev sweep with the `scanner` persona only, plus exact DP reach.
6. Metrics: reach, folds, clicks, hierarchy alignment, trunk test, competing CTAs.
7. Verification of the most-probable path per top endpoint (≤6 runs).
8. Spec grouped by intent → endpoint, with 1 Gemini call.
9. Dashboard: intent tabs; the tree view colored by p and cost; scorecard table.
10. Fix the `backtracks` delta bug.

**Cut from Phase 0 (deliberately):**

- mobile pass
- `searcher`/`evaluator` personas
- four-questions
- modeled scan *time* (show folds + fixations only)
- variant loop on arbitrary sites (the variant demo stays on the AIE fixture)
- Monte Carlo fallback
- calibration
- owner weight overrides UI (config file only)
- the full 12-site corpus

### Phase 1 — v1

1. All 12 corpus sites recorded as hermetic fixtures (rendered HTML + layout JSON + screenshots). Live runs are scheduled, and the evals run on fixtures.
2. Mobile pass, all three personas, four questions, scan time, words-above-fold / happy-talk.
3. Variant generator keyed by finding type:

   | Finding type | Patch |
   |---|---|
   | promote buried endpoint | `reorder` + `setStyle` |
   | relabel ambiguous | `relabel` |
   | add you-are-here | `setAttribute aria-current` + style |
   | trim above-fold words | `replaceText` |

   Each variant is re-swept, so Δ`P_reach`/Δcost are computed for every variant, not just one.
4. Cross-site benchmark view: scorecards side by side, with percentile per archetype.
5. Monte Carlo fallback above the exact-solve cap. Budgets: 80 states, depth 4.
6. `RunCost` dashboard and budgets enforced as hard stops.
7. Owner overrides for endpoint weights and custom goals in the UI.
8. Calibration hook: import real funnel/heatmap data (e.g. PostHog) to fit the scan constants per archetype, behind a flag.

### Later (v2+, not committed)

- Authenticated flows (explicitly still out of scope).
- Continuous monitoring with regression alerts on scorecard deltas.
- Auto-PR of DOM patches to a site repo.
- Learned archetype priors from the corpus.

## 9. Evaluation criteria per capability

The labeled corpus is `tests/evals/fixtures/sites/<host>/`. Each site has recorded states, layout JSON, and a hand label file with archetype, endpoints (class, intent, anchor URL/selector), and trunk-test answers for 3 deep states.

| Capability | Eval | Phase 0 threshold | v1 threshold |
|---|---|---|---|
| Archetype classification | accuracy vs labels | 4/4 (3 sites + AIE) | ≥ 11/12 |
| Endpoint detection | precision / recall per class, micro-avg, on labeled endpoints | P ≥ 0.80, R ≥ 0.70 | P ≥ 0.90, R ≥ 0.85 |
| Intent mapping | endpoint → intent matches the label | ≥ 0.90 | ≥ 0.95 |
| Free-text goal → intent | 30 labeled goals | — | ≥ 0.90 |
| Layout capture | every action on fold-0 has a bbox; fold index matches a recorded screenshot crop | 100% on fixtures | 100% |
| Visual weight sanity | on synthetic fixtures, a promoted CTA (bigger, higher contrast, above fold) strictly gains prominence; demoting strictly loses | pass | pass |
| Hierarchy alignment | monotonic under the promote/demote patch pair | pass | pass |
| Trunk test | per-check agreement with labels | ≥ 0.80 | ≥ 0.90 |
| Exact reach | DP `P_reach` within ±0.03 of 20k-sample Monte Carlo on 3 fixture graphs; identical input → identical output | pass | pass |
| Sweep determinism | same fixtures + FixtureJev → byte-identical scorecard | pass | pass |
| Model vs reality | share of verification replays whose reached/not-reached outcome matches the model's top-path prediction | ≥ 0.70 | ≥ 0.80 |
| Cost caps | Gemini calls ≤ 2, Jev uncached requests ≤ budget, browser sessions ≤ budget; asserted from `RunCost` | pass | pass |
| Cache efficacy | second run on the same fixtures: Jev cache hit rate | ≥ 0.95 | ≥ 0.95 |
| Variant delta | promote-endpoint patch on a buried-pricing fixture raises `P_reach` and lowers folds | — | pass |
| Findings | every finding cites a Krug key and a metric value; no `verified-failure` without a browser run id | pass | pass |
| Spec | grouped by intent; every change traces to a finding + metric + evidence path | pass | pass |

New eval files must be listed in `.devin/skills/rehearsal-testing/SKILL.md` (`npm run check:skill-sync`). Proposed: `intent.eval.ts` (classification + mapping), `layout.eval.ts` (visual weight, alignment, trunk), `sweep.eval.ts` (DP vs MC, determinism, cost caps).

## 10. Pipeline stages (proposed v3 order)

`discover → classify → sweep → verify → analyze → compare → spec`

| Stage | What it does |
|---|---|
| `discover` | endpoint-seeking, with layout snapshots |
| `classify` (new) | archetype, endpoints, importance, goals |
| `sweep` (replaces `simulate`) | Jev fold-level distributions, exact reach, journey trees |
| `verify` | replay of selected paths per top endpoint |
| `analyze` | Tier 0 metrics → findings |
| `compare` | finding-typed variant, re-sweep + replay |
| `spec` | intent-grouped spec |

Renaming `simulate` → `sweep` touches the API route, the dashboard, and SKILL.md in one commit (skill-sync gate).

## 11. Integrations, safety, non-functional

- **Integrations:** v2.0 §10 is unchanged. Jev is now the main model spend, and Gemini is bounded to ≤2 calls per run.
- **Safety:** v2.0 §11 is unchanged, with one addition: endpoint "reached" checks are **read-only**. They never fill, focus-type into, or submit forms, and never click a submit control.
- **Politeness:** ≤1 request / 2 s per host applies per site. Cross-site batches run sites in parallel, never pages of one site in parallel.
- **Non-functional:** a Phase 0 per-site run should finish in ≤10 min on live vendors and ≤60 s on fixtures. Partial results stay distinguishable: the scorecard marks an intent `unresolved` when no endpoint was found within budget, and never reports `P_reach = 0` for it.

## 12. Definition of done (Phase 0)

- [ ] Intent audit completes on 3 live sites (different archetypes) and the AIE fixture, with keys present.
- [ ] The same runs complete on recorded fixtures with keys absent.
- [ ] Each site: archetype, ≥1 endpoint per intent (or `unresolved`), a scorecard row per intent, and a journey tree view.
- [ ] ≥1 verified finding per site traced to a metric and a browser run.
- [ ] Gemini calls ≤ 2 per run, asserted from `RunCost`.
- [ ] `spec.md` grouped by intent → endpoint.
- [ ] `npm run check` green with new evals listed in SKILL.md.

## 13. Demo script (60s)

1. Paste `sentry.io`. The archetype badge reads *devtool-saas*.
2. Three intent tabs fill in. RFQ shows: "Pricing: P_reach 0.92, 1 click, fold 0." RFP shows: "Start trial: 0.88."
3. Switch to `keysight.com`. RFQ shows: "Request quote: P_reach 0.41, 3 clicks, 4 folds, trunk 3/6." The tree view shows where scanners peel off.
4. The verified replay confirms it.
5. Open `spec.md`, grouped by intent.
6. Point at the run-cost line: "0 LLM calls in the sweep, 1 for this write-up."

Close: *"Don't argue about your site. Rehearse it."*

The numbers above are illustrative placeholders, not measurements. The demo uses whatever the run produces.

## 14. Open questions for the owner

1. **RFQ on non-commercial sites.** Is "cost to participate" (free / eligibility / requirements) the right reading of Quotation for mlh.io, mtc.so, and events? Alternative: allow an intent to be `n/a` for an archetype.
2. **Who defines importance?** Should archetype priors be the default, with owner overrides per site? Or does the owner want to specify their top endpoint ("our #1 goal is demo bookings") as a required run input?
3. **Goals: generated vs supplied.** Is auto-generating ≤3 goals per intent acceptable as the default, with free text as an override? Or should free text stay primary?
4. **Jev access and budget.** Is a live Jev key (OpenRouter `typesafe/jev-1.13`) available? What per-site spend ceiling should the ≤720-request budget map to?
5. **Calibration.** Is it acceptable to ship uncalibrated scan-time constants labeled "modeled"? Or is there real data (PostHog heatmaps/funnels, eye-tracking) to calibrate against in v1?
6. **Demo centerpiece.** Should the demo lead with the cross-site intent audit, as proposed in §13, or keep the AIE stale-CTA variant loop as the lead and show cross-site as a second beat?
7. **Corpus permissions.** Is it acceptable to record and commit rendered HTML/layout/screenshots of the 12 corpus sites as hermetic fixtures? Alternative: keep them in an untracked cache with only hand labels committed.
