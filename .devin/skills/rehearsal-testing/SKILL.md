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

## Unit tests (tests/unit/)

- `core.test.ts` — contract parsing, extractor, graph dedup, mulberry32 determinism, profile shaping, fixture Jev scoring, patch compilation, rule findings, spec markdown
- `intents.test.ts` — `classifyGoal` keyword heuristics, LLM refinement fallback, endpoint label/path classification, `discoverEndpoints`/`weightEndpoints` determinism + overrides, optional Experiment fields

## Browser tests (tests/e2e/)

- `discovery.spec.ts` — hermetic: serves the AIE fixture over localhost, verifies real-browser extraction + the stale-CTA precondition. Requires `REHEARSAL_ALLOW_PRIVATE=1` (set inside the spec).

## How to run

- `npm run test` — unit tests
- `npm run eval` — eval suite (CI gate; threshold-driven)
- `npm run test:e2e` — Playwright hermetic browser tests (needs `npx playwright install chromium`)
- `npm run check:skill-sync` — this file vs. PIPELINE_STAGES + eval files
- `npm run check` — everything

## Rules

- Every new pipeline stage → add to PIPELINE_STAGES, this file, and ≥1 eval.
- Every new eval file → list it here (filename must appear verbatim).
- Determinism is a feature: never add wall-clock or network dependence to evals.
- Findings must cite a Krug principle key from docs/krug-principles.md.
