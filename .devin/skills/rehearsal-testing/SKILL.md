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

## Unit tests (tests/unit/)

- `core.test.ts` — contract parsing, extractor, graph dedup, mulberry32 determinism, profile shaping, fixture Jev scoring, patch compilation, rule findings, spec markdown

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
