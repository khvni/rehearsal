# Rehearsal

**Rehearse your website before users do.** Point Rehearsal at a public URL + a visitor goal;
it maps the interface into a decision graph, simulates user journeys, verifies the risky ones
in real browsers, applies a fix to an isolated variant, re-verifies it — and hands you a
**spec of everything to change plus a rebuild plan**, grounded in Steve Krug's
*Don't Make Me Think, Revisited* (`docs/krug-principles.md`).

Demo target: https://ai.engineer/code/2026

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 16 + React 19 + TypeScript |
| Graph | @xyflow/react |
| Browser | Playwright (local or Bright Data Browser API over CDP) |
| Page fetch | Bright Data Web Unlocker → fetch fallback |
| Decisions | Jev System One (`typesafe/jev-1.13` via OpenRouter decisions API) |
| LLM | Gemini — `gemini-4-hydrogen` (fast) + `gemini-4-argon` (deep) |
| Persistence | JSON files → Tiger Data (`DATABASE_URL`) |
| KB (optional) | Snowflake Cortex Search |
| Observability | Sentry (DSN-gated) + JSONL event log |
| Deploy | Terraform: `terraform/digitalocean` (demo host) + `terraform/cloudflare` |
| Evals/CI | Vitest eval suite w/ thresholds, skill-sync gate, Playwright e2e, tf validate |

**Every integration is an adapter that no-ops without keys** — the full pipeline runs
offline on recorded fixtures (`tests/evals/fixtures/aie-code-2026.html`).

## Quickstart

```bash
npm ci
cp .env.example .env        # fill in keys when you have them — all optional
npm run check               # lint + typecheck + unit + evals + skill-sync
npm run dev                 # http://localhost:3000
```

Then: paste the target URL + goal → Rehearse → watch the stages → open `spec.md`.

## Pipeline

`discover` → `simulate` → `verify` → `analyze` → `compare` → `spec`
(`PIPELINE_STAGES` in `src/lib/orchestrator.ts`; documented in
`.devin/skills/rehearsal-testing/SKILL.md` — CI-enforced sync.)

## API

`POST /api/experiments` `{targetUrl, goal}` → `POST /api/experiments/:id/{discover|simulate|verify|analyze|compare|spec|run}` → `GET /api/experiments/:id` → `GET /api/experiments/:id/spec` (markdown).

## Engineering practices

- **Evals as a gate**: `npm run eval` runs golden-fixture cases with thresholds in
  `tests/evals/evals.config.json`; fails the build below thresholds.
- **Skill sync**: `npm run check:skill-sync` fails if pipeline stages or eval files land
  without matching docs — testing skills stay updated *with* the commit.
- **Contracts**: every module boundary is a zod-validated schema (`src/lib/contracts`).
- **Determinism**: seeded RNG (mulberry32); same seed ⇒ identical trajectories.
- **Safety**: SSRF guards (public http(s) only, no private IPs/metadata), robots.txt
  honoring, ≤1 req/2s per host, no form submission, variants never touch the live site.

## Docs

- `docs/PRD.md` — product spec (v2.0)
- `docs/krug-principles.md` — the eval rubric
- `docs/architecture.md` — module map
- `docs/demo-script.md` — the 60-second demo
- `terraform/README.md` — deployment

## Honesty contract

Findings are labeled `verified-failure` | `reproducible-concern` | `hypothesis`.
Simulated journeys are hypotheses about behavior, **not** predictions of human
conversion — never quote them as such.
