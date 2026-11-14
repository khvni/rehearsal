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
- `verify` — risk-ranked trajectories executed in real desktop/mobile browsers; assertions checked. `REHEARSAL_VERIFY_AGENT` swaps scripted locators for an observe/act/extract agent loop (`browser/agent.ts`, runners with `supportsAgent`)
- `analyze` — rule-based + Gemini findings, each classified by evidence type + Krug principle
- `compare` — DOM-patch variant applied in isolated context; baseline vs variant deltas
- `spec` — SpecReport generated; spec.md written under data/experiments/<id>/
- `rebuild` — brand extraction from crawled states → goal inference from CTAs/nav/titles/endpoints → per-goal branded page generation (Gemini, deterministic template fallback); stored as experiment.rebuild, served at /experiments/:id/rebuild[/slug]

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
- `sandbox.eval.ts` — `CodeSandbox` (`src/lib/sandbox`): node worker executes agent-style assertions on the AIE fixture with console + `report()` output, deterministic repeat runs, non-throwing failure path; `selectSandbox` honours `REHEARSAL_SANDBOX` and falls back to `node-vm-worker` when no `Sandbox` binding exists; `agentVerifyEnabled` is opt-in and `selectRunner` backends declare `supportsAgent`
- `findings-dedup.eval.ts` — cross-state finding dedup (`src/lib/analysis/dedupe.ts` `collapseFindings`, called by `analyze`): on four AIE fixture states + two browser runs failing the same assertion, raw `ruleFindings` repeats per state, collapsed output has one finding per (Krug principle + title) whose affected states/actions/evidence paths are the union of the group, severity = max, first findingId kept, title suffixed `(N of M pages)` (pages counted by URL, so desktop + mobile states of one URL are one page) / `(N of M runs)`; verified failures with different assertions stay distinct; orchestrator `spec` on a multi-page fixture site (clock pinned after the event) emits each finding and spec change once
- `bench.eval.ts` — benchmark harness (see "Bench harness" below): manifest contract validation, an end-to-end fixture-site run, two-run determinism (identical reports with timing stripped), and scoring unit tests (ruleKey normalization, expected/tolerated/unexpected precedence, precision/recall edges)
- `rebuild.eval.ts` — rebuild-quality eval scaffold: validates the SpecReport + spec markdown the harness emits (changes by impact, rebuild phases), with `describe.todo`/`it.todo` placeholders naming the future rebuild-fidelity evals

## Bench harness (`npm run bench`, tests/evals/bench/)

`scripts/bench.ts` runs every `tests/evals/fixtures/*.manifest.json` site through the full pipeline hermetically and writes `data/bench/{report.json,report.md}` (gitignored — never commit reports). Contracts live in `src/lib/contracts/bench.ts` (`FixtureSiteManifest`, `BenchSiteReport`, `BenchReport`); the harness itself is `tests/evals/bench/{sites,runner,pipeline,score,report}.ts`.

- **Fixture sites**: a manifest declares `pages` (URL path → fixture HTML file under tests/evals/fixtures/), `mountPath`, `goal`, and what the pipeline should produce — `expectedEndpointClasses`, `expectedFindings` (must be produced), `toleratedFindings` (count toward precision, not recall), `unexpectedFindings` (false positives), `expectedSpecItems`, `budgetsMs`, `expectations` (metric floors). `stubMissing: true` serves a deterministic stub for unmapped subpaths.
- **Runners**: `FixtureSiteRunner` resolves pages from the manifest map in memory (trajectory verify walks action hrefs, assertions evaluate on the final page's extracted content); `HermeticSiteRunner` (`--browser`) uses local Chromium with every non-origin request aborted — same hermeticity as spec-delta.
- **Determinism**: seed 1337 default, counter `randomUUID` patched via `syncBuiltinESMExports` (also mocked per-file in evals — Jev tiebreak jitter is actionId-keyed), optional `referenceNow` pins the clock for stale-date heuristics; stage durations use `hrtime` so pinning doesn't zero them. Strip `durationsMs`/`overBudget`/`generatedAt` to compare two runs (`stripTiming`).
- **Scoring** (`score.ts`): findings group into rule keys (digit-normalized title + krugPrinciple); precision = (expected+tolerated matches)/produced, recall = expected-matched/expected; journey/state coverage from trajectories; endpoint coverage from `journeys`; spec item coverage = matched `expectedSpecItems`/`expected` total (1 when none declared). `expectationFailures` lists every violated floor — `--check` exits non-zero when any site has one.
- **Flags**: `--site <id>` one site, `--out <dir>` report dir, `--browser` chromium runner, `--seed`, `--check` gate mode.
- `rebuild-stage.eval.ts` — rebuild stage (`src/lib/rebuild`) with fixture adapters; thresholds are local constants in the file:
  - brand extraction — `brandSignalsFromHtml` on the AIE fixture returns the site name, ≥ 8 nav items (Apply to attend, Speakers, Program…) resolved against the page URL, and a cssVars record; `rollupBrand` over the fixture states is deterministic (two calls deep-equal)
  - goal inference — `inferGoals` on a fixture-built experiment returns ≥ 4 goals: the experiment goal first (source `experiment-goal`), ≥ 1 `cta`-sourced goal, unique url-safe slugs, weights in [0,1]
  - generated pages — `generateRebuild` with `FixtureLlmClient` yields one page per goal; no `<script>`, every `<img src>` on the audited origin, each page contains its goal's CTA label; byte-identical across two runs
  - orchestrator wiring — fixture runner/store/Jev/LLM: `rebuild` (chaining every earlier stage) stores `experiment.rebuild`, it round-trips through the `Experiment` contract, discover stores per-state `brand` signals, and `rebuild.llm` is the fixture adapter name

## Unit tests (tests/unit/)

- `metrics.test.ts` — `measurePage` via `PlaywrightRunner.openPage` on synthetic pages served from loopback (scroll, CTA prominence ties, heading skips/multiple h1, nav count, font buckets, trunk test), `metricsFromHtml` fallback, and each `metricFindings` rule (grouping, severity, evidence)
- `core.test.ts` — contract parsing (incl. `ExperimentConfig` budget upper bounds, clamping of over-limit stored configs), extractor, graph dedup, mulberry32 determinism, profile shaping, fixture Jev scoring, patch compilation, rule findings, spec markdown
- `questions.test.ts` — question bank shape, homepage-first ordering, context-derived questions, answer detection (endpoint class / URL / text, start-only homepage questions, endpoint label filters, re-answering stored questions), LLM refinement skip + keyword questions, `unanswered-question` findings + summary
- `egress-guard.test.ts` — SSRF: `resolvePublicHost` rejects private/link-local/metadata/unspecified hosts; the loopback egress proxy (`src/lib/fetch/egress-proxy.ts`) refuses CONNECT + plain-HTTP to private IPs; a real Chromium behind it gets 403 on redirect hops to 169.254.169.254 / loopback and on internal subresources, and `assertPublicPage` rejects the blocked final URL
- `access.test.ts` — `REHEARSAL_ACCESS_TOKEN` gate (`hasAccess` Bearer/Basic, `src/proxy.ts` 401 on every route only when set) and the `withRunSlot` concurrency cap (`REHEARSAL_MAX_CONCURRENT_RUNS`, slot freed on error)
- `orchestrator-lock.test.ts` — per-experiment run lock: a second concurrent `discover`/`spec`/`runAll` on the same experiment throws `StageInProgressError` (route → 409) without calling the runner again; other experiments run in parallel; the lock is released after success and failure
- `agent-activity.test.ts` — `ActivityEvent` contract, `JsonFileStore.appendActivity`/`activity` (order, per-experiment isolation, `ACTIVITY_EVENT_LIMIT` cap, hostile-id safety), orchestrator emission during discover/verify/markFailed, and `GET /api/experiments/:id/activity` (feed + 404)
- `experiments-route.test.ts` — `POST /api/experiments` returns 400 for configs over the budget bounds, before the rate limit, URL check or store write; in-bounds configs are capped to the demo `MAX_TRAJECTORIES`/`MAX_VERIFY_RUNS`
- `llm-output-validation.test.ts` — LLM output is checked against the contracts before it is stored: `compileAssertions` keeps only valid `Assertion`s (null selector = absent, keyword fallback when none survive), `llmFindings` drops non-`Finding` items, `generateSpec` ignores malformed summary/changes/phases, `JsonFileStore.save` rejects invalid experiments and `list()` skips unparseable documents
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
- `npm run bench` — benchmark harness over fixture sites; prints report.md + writes data/bench/ (`-- --site <id>`, `-- --browser`, `-- --check`)

## Rules

- Every new pipeline stage → add to PIPELINE_STAGES, this file, and ≥1 eval.
- Every new eval file → list it here (filename must appear verbatim).
- Determinism is a feature: never add wall-clock or network dependence to evals.
- Findings must cite a Krug principle key from docs/krug-principles.md.
