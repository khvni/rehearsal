---
name: rehearsal-testing
description: Rehearsal pipeline stages, eval cases, and how to keep tests in sync with the code. Updated with every commit — enforced by npm run check:skill-sync.
---

# Rehearsal testing skill

This document is the contract between the pipeline implementation and the test/eval
suite. **It must be updated in the same commit as any change to pipeline stages or
eval cases.** `npm run check:skill-sync` fails the build otherwise.

## Pipeline stages (src/lib/orchestrator.ts, PIPELINE_STAGES)

- `discover` — fetch + browser runner (Bright Data → Stagehand → local Playwright) open page, extract elements, build deduplicated state graph
- `simulate` — Jev scores actions per state; seeded sampler produces ≥500 trajectories
- `verify` — risk-ranked trajectories executed in real desktop/mobile browsers; assertions checked
- `analyze` — rule-based + Gemini findings, each classified by evidence type + Krug principle
- `compare` — DOM-patch variant applied in isolated context; baseline vs variant deltas
- `spec` — SpecReport generated; spec.md written under data/experiments/<id>/

## Eval cases (tests/evals/, gated by evals.config.json thresholds)

- `core.eval.ts` — extraction coverage, simulation determinism/scale, Jev mapping validity, rubric coverage, stale-date finding (Scenario B), spec completeness, variant idempotency, SSRF guards
- `invariants.eval.ts` — behavioral invariants on fixture HTML + fixture adapters:
  - profile shaping — on a journey graph (AIE home → schedule hub → day pages, every other action a detour leaf), `impatient` mean actions-to-goal ≤ `exploratory`, pooled over seeds 1337/2026/7 (`maxImpatientToExploratoryStepRatio`, `minGoalReachedPerProfile`, `profileTrajectoriesPerSeed`). The file mocks `randomUUID` with a counter because FixtureJevClient's tiebreak jitter is keyed by actionId — without it outcomes drift run to run
  - verification ranking — `rankForVerification` keeps every trajectory incl. goal-reached; `selectTrajectories` keeps ≥1 goal-reached for every N on an adversarial pool and a simulated pool, and never fabricates one (`minGoalRetentionRate`)
  - spec ordering — `generateSpec` orders changes by severity desc (stable within a tier), critical/high changes land in phase 1, markdown emits `## Rebuild plan` with one `### <phase>` per phase (`minRebuildPhases`)
  - graph dedup — `GraphBuilder` collapses identical-stateHash states (same page, reordered/recased actions) into one node; viewport change makes a new node (`maxStatesPerStateHash`)
  - vague labels — finding on `fixtures/vague-labels.html` names exactly the vague labels found; no finding on the AIE fixture (`minVagueLabelsDetected`)
  - stale date — finding description cites every detected past date; no finding before the event ends (`minPastDatesDetected`, `requireStaleDateEvidence`)
- `intents.eval.ts` — RFX intents (information / quotation / proposal) + endpoint discovery; thresholds are local constants in the file:
  - AIE fixture — `detectSiteType` = event; `discoverEndpoints` finds ≥1 `schedule-event` ("Explore all 50 sessions", "Schedule") and ≥1 `signup` whose label says apply; top endpoint weight ≥ 0.75; weights deterministic and in [0,1]; `defaultIntentsForSite` yields one goal per category; "find the conference schedule" → information targeting `schedule-event`; no endpoint findings when CTAs sit on the start page
  - synthetic journeys — orphaned /signup → `endpoint-unreachable` (navigation); pricing 4 clicks deep → `endpoint-deep` (mindless-choices, median 4, sample path recorded); absent expected class → `missing-endpoint-class`; `endpointJourneys` deterministic per seed
  - orchestrator wiring — fixture runner/store/adapters: `discover` stores `intents` + `endpoints`, endpoint class assertions (`endpointGoalAssertions`) make reaching /talks satisfy `goalSatisfiedInState`, `analyze` stores `journeys`, and the experiment round-trips through the `Experiment` contract (what GET /api/experiments/[id] serializes)
- `questions.eval.ts` — unanswered visitor questions (`visitorQuestions` = bank + start-page context questions → answer detection) on the AIE fixture, thresholds in evals.config.json (`minQuestionBankSize`, `minAieQuestions`, `requiredAnsweredQuestions`, `requiredUnansweredQuestions`, `maxAieUnansweredRatio`):
  - answered with cited start-state evidence — homepage what/do/start, `when-where` (Nov 10-12 + //LOCATION/venue), `attend` (apply CTA), `agenda`, `speakers`, `recordings`
  - unanswered — `cost` (application-only, no price anywhere), `ctx-apply-criteria` (copy says "by application only" but never says who gets in or when), `contact` (the only contact-form CTA is sponsorship, which answers `sponsor` instead)
  - `questionFindings` emits one `unanswered-question` finding per gap + an "N of M" summary, start screenshot as evidence; deterministic across runs with the fixture LLM
  - orchestrator wiring — fixture adapters: `analyze` stores `questions` on the experiment, adds the `unanswered-question` findings, and the experiment round-trips through the `Experiment` contract

- `metrics.eval.ts` — page metrics (`src/lib/browser/metrics.ts` `measurePage`) on the AIE fixture in hermetic local Chromium (loopback server, all other requests aborted, `networkidle` so layout settles): repeat measurements are identical; homepage fold ratio ≥ `metricsMinHomepageFoldRatio` with scroll time = screens × 1.5s; exactly `metricsExpectedH1Count` h1 and it is the largest text; ≥ `metricsMinNavItems` primary-nav items, ≥ `metricsMinCtas` CTAs, `primaryCtaAmbiguity` ≤ `metricsMaxPrimaryCtaAmbiguity`, ≥ `metricsMinFontSizeBuckets` font sizes; the HTML-only fallback matches the DOM facts and nulls layout fields; `metricFindings` emits every rule in `metricsRequiredRules`, no CTA-ambiguity finding, each with a Krug key + screenshot evidence
- `findings-dedup.eval.ts` — cross-state finding dedup (`src/lib/analysis/dedupe.ts` `collapseFindings`, called by `analyze`): on four AIE fixture states + two browser runs failing the same assertion, raw `ruleFindings` repeats per state, collapsed output has one finding per (Krug principle + title) whose affected states/actions/evidence paths are the union of the group, severity = max, first findingId kept, title suffixed `(N of M pages)` (pages counted by URL, so desktop + mobile states of one URL are one page) / `(N of M runs)`; verified failures with different assertions stay distinct; orchestrator `spec` on a multi-page fixture site (clock pinned after the event) emits each finding and spec change once

## Unit tests (tests/unit/)

- `metrics.test.ts` — `measurePage` via `PlaywrightRunner.openPage` on synthetic pages served from loopback (scroll, CTA prominence ties, heading skips/multiple h1, nav count, font buckets, trunk test), `metricsFromHtml` fallback, and each `metricFindings` rule (grouping, severity, evidence)
- `core.test.ts` — contract parsing, extractor, graph dedup, mulberry32 determinism, profile shaping, fixture Jev scoring, patch compilation, rule findings, spec markdown
- `questions.test.ts` — question bank shape, homepage-first ordering, context-derived questions, answer detection (endpoint class / URL / text, start-only homepage questions, endpoint label filters, re-answering stored questions), LLM refinement skip + keyword questions, `unanswered-question` findings + summary
- `egress-guard.test.ts` — SSRF: `resolvePublicHost` rejects private/link-local/metadata/unspecified hosts; the loopback egress proxy (`src/lib/fetch/egress-proxy.ts`) refuses CONNECT + plain-HTTP to private IPs; a real Chromium behind it gets 403 on redirect hops to 169.254.169.254 / loopback and on internal subresources, and `assertPublicPage` rejects the blocked final URL
- `access.test.ts` — `REHEARSAL_ACCESS_TOKEN` gate (`hasAccess` Bearer/Basic, `src/proxy.ts` 401 on every route only when set) and the `withRunSlot` concurrency cap (`REHEARSAL_MAX_CONCURRENT_RUNS`, slot freed on error)
- `orchestrator-lock.test.ts` — per-experiment run lock: a second concurrent `discover`/`spec`/`runAll` on the same experiment throws `StageInProgressError` (route → 409) without calling the runner again; other experiments run in parallel; the lock is released after success and failure
- `agent-activity.test.ts` — `ActivityEvent` contract, `JsonFileStore.appendActivity`/`activity` (order, per-experiment isolation, `ACTIVITY_EVENT_LIMIT` cap, hostile-id safety), orchestrator emission during discover/verify/markFailed, and `GET /api/experiments/:id/activity` (feed + 404)
- `intents.test.ts` — `classifyGoal` keyword heuristics, LLM refinement fallback, endpoint label/path classification, `discoverEndpoints`/`weightEndpoints` determinism + overrides, optional Experiment fields

## Browser tests (tests/e2e/)

- `discovery.spec.ts` — hermetic: serves the AIE fixture over localhost, verifies real-browser extraction + the stale-CTA precondition. Requires `REHEARSAL_ALLOW_PRIVATE=1` (set inside the spec).

## Layer 1 facts (scripts/verify-facts.ts)

`npm run check:facts` checks deterministic facts so neither an LLM nor a reviewer has to (docs/verification.md): stored experiments (`data/experiments/**`, `tests/fixtures/experiments/**`, `docs/runs/**/summary.json`) parse with the `Experiment`/`SpecReport` contracts with no unknown keys; every env var read in src/ is in `.env.example` and README/docs (and vice versa), and the terraform stacks declare + map the deploy subset (`DEPLOYED_ENV`, exemptions listed in the script); Krug principle slugs/K-ids in `src/lib/analysis` + `src/lib/intents` exist in docs/krug-principles.md and the contract enum; every stable finding rule id (`f_<rule>_…`, metric `finding("<rule>")`) is referenced by a test; every `src/app/api/**` route + method is in docs/api.md. `--json` prints machine-readable results. After changing the pipeline output shape, regenerate the stored fixture with `npx tsx scripts/verify-facts.ts --write-fixtures` (hermetic run on `aie-code-2026.html`, mocked ids + clock, byte-identical across runs).

## Spec delta (PR comment, informational)

- `npm run spec:delta` (`scripts/spec-delta.ts`) runs the full pipeline (`discover` → `spec`) on `tests/evals/fixtures/aie-code-2026.html` served from loopback (other same-origin paths get a deterministic stub page; every non-loopback request is aborted), with fixture Jev/LLM, seed 1337, maxStates 12, 200 trajectories, verifyCount 2, desktop only. `randomUUID` is replaced with a counter so ids — and the Jev tiebreak jitter keyed by them — are stable. Writes `data/spec-delta/{summary.json,delta.json,comment.md}`; `--screenshot` also starts `next start` (or `next dev` without a build) and captures `/experiments/<id>` to `dashboard.png`.
- The summary (counts, findings grouped by digit-normalized title + Krug principle with max severity, endpoint classes with reached/discovered + top weight, spec headings) is diffed against `tests/golden/aie-code-2026.summary.json`. `.github/workflows/spec-delta.yml` posts/updates one sticky comment ("Rehearsal spec delta", marker `<!-- rehearsal-spec-delta -->`) and uploads the screenshot as the `rehearsal-spec-delta` artifact. Deltas never fail the job; a crash or an empty graph/spec does.
- Update the golden with `npm run spec:delta -- --update-golden` and commit it in the same PR whenever a delta is intended: changes to findings rules/severity/titles, endpoint classification or weights, simulation/verification selection, spec generation, crawl limits, or the fixture itself. Don't update it to silence an unexplained delta — investigate first. If CI and local disagree (fonts/layout), regenerate from the CI artifact's `summary.json`.

## How to run

- `npm run test` — unit tests
- `npm run eval` — eval suite (CI gate; threshold-driven)
- `npm run test:e2e` — Playwright hermetic browser tests (needs `npx playwright install chromium`)
- `npm run check:skill-sync` — this file vs. PIPELINE_STAGES + eval files
- `npm run check:facts` — Layer 1 drift checks (above)
- `npm run check` — everything
- `npm run spec:delta` — hermetic full-pipeline summary vs. golden (`-- --update-golden`, `-- --screenshot`)

## Rules

- Every new pipeline stage → add to PIPELINE_STAGES, this file, and ≥1 eval.
- Every new eval file → list it here (filename must appear verbatim).
- Determinism is a feature: never add wall-clock or network dependence to evals.
- Findings must cite a Krug principle key from docs/krug-principles.md.
