# AGENTS.md — for coding agents working in this repo

## What this is

Rehearsal: a UX verification pipeline (see README.md + docs/PRD.md). Next.js 16 + TS.

## Non-negotiables

1. **Contracts first.** All shared types live in `src/lib/contracts/` (zod; siblings re-exported from `index.ts`).
   Never introduce a parallel type; extend the contract.
2. **Skill sync is enforced.** Adding a pipeline stage or eval file requires updating
   `.devin/skills/rehearsal-testing/SKILL.md` in the same commit (`npm run check:skill-sync`).
3. **Determinism.** No wall-clock/network dependence in tests or evals. Seeded RNG only.
4. **Adapters no-op without keys.** Never crash on a missing env var — fall back to
   fixture/plain implementations.
5. **Evidence classes.** Findings are `verified-failure` | `reproducible-concern` | `hypothesis`
   and must cite a Krug principle (`docs/krug-principles.md`). No fabricated metrics.
6. **Safety.** `assertPublicUrl` guards every outbound fetch/navigation; never submit
   forms on third-party sites; variants apply only inside isolated Playwright contexts.

## Review policy

Lint is the source of truth for repo rules (`eslint-rules/`). Only `bug`/`security` review findings block merge;
feedback repeated twice becomes a lint rule or eval. See [docs/review-policy.md](docs/review-policy.md).

## Commands

- `npm run check` — the gate: lint, typecheck, unit, evals, skill-sync
- `npm run test:e2e` — hermetic Playwright (fixture server, no external calls)
- `terraform fmt -check -recursive terraform/` + `terraform validate` per stack

## Layout

- `src/lib/{contracts,fetch,browser,graph,decisions,simulation,analysis,variants,storage,telemetry}` — pipeline modules
- `src/lib/orchestrator.ts` — stage sequencer (`PIPELINE_STAGES`)
- `src/app/api/experiments/` — REST surface
- `src/app/` + `src/components` — dashboard
- `tests/{unit,evals,e2e}` + `tests/evals/fixtures/` — quality gates
- `terraform/{cloudflare,digitalocean}` — deploy stacks
