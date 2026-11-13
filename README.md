# Rehearsal

Hackathon submission (AIE x MLH @ Code Summit): [docs/submission.md](docs/submission.md)

Rehearsal tries your website the way visitors will, before they do. Give it a public
URL and a goal. It maps the pages, simulates visitor journeys, replays the risky ones
in a real browser, and tests a fix on an isolated copy. Then it writes `spec.md`:
ranked changes plus a rebuild plan, each citing Steve Krug's
*Don't Make Me Think, Revisited* (`docs/krug-principles.md`).

Demo target: https://ai.engineer/code/2026

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 16 + React 19 + TypeScript |
| Graph | @xyflow/react |
| Browser | Bright Data Browser API (CDP) → Browserbase Stagehand → local Playwright |
| Page fetch | Bright Data Web Unlocker → Browserbase Fetch → fetch fallback |
| Decisions | Jev System One (`typesafe/jev-1.13` via OpenRouter decisions API) |
| LLM | Gemini: `gemini-4-hydrogen` (fast) + `gemini-4-argon` (deep) |
| Persistence | JSON files → Tiger Data (`DATABASE_URL`) |
| KB (optional) | Snowflake Cortex Search |
| Observability | Sentry (DSN-gated) + JSONL event log |
| Deploy | Terraform: `terraform/digitalocean` (demo host) + `terraform/cloudflare` |
| Evals/CI | Vitest evals with thresholds, skill-sync gate, Playwright e2e, tf validate |

No keys needed. Each integration falls back to a fixture, so the pipeline runs
offline on a recorded page (`tests/evals/fixtures/aie-code-2026.html`).

## Quickstart

```bash
npm ci
cp .env.example .env        # every key is optional
npm run check               # lint + typecheck + unit + evals + skill-sync + facts
npm run dev                 # http://localhost:3000
```

Paste the URL and goal, click Rehearse, watch the stages run, then open `spec.md`.

## Pipeline

`discover` → `simulate` → `verify` → `analyze` → `compare` → `spec`

`PIPELINE_STAGES` in `src/lib/orchestrator.ts`. CI fails if
`.devin/skills/rehearsal-testing/SKILL.md` drifts from it.

## Live-site runs

`npm run site -- <url> --goal "find pricing"` runs the pipeline without the Next server
and writes `docs/runs/<host>/{spec.md,summary.json}`. `npm run site -- --all` runs every
site in `docs/runs/sites.json` and rebuilds the table in `docs/runs/README.md`.
Flags: `--max-states 15 --trajectories 300 --verify 4 --max-depth 3 --viewports desktop --timeout-min 5`.
Sites that block local Playwright (bot wall, captcha, hung renderer) are recorded as
`blocked`, with the reason. The Bright Data runner is for those.

## API

`POST /api/experiments` `{targetUrl, goal}` → `POST /api/experiments/:id/{discover|simulate|verify|analyze|compare|spec|run}` → `GET /api/experiments/:id` → `GET /api/experiments/:id/spec` (markdown). `GET /api/experiments` lists experiments. Full list: [docs/api.md](docs/api.md).

Environment variables: [docs/architecture.md#environment-variables](docs/architecture.md#environment-variables).

## Checks

- **Evals.** `npm run eval` runs fixture cases against thresholds in
  `tests/evals/evals.config.json`. The build fails below them.
- **Skill sync.** `npm run check:skill-sync` fails if a stage or eval file lands
  without a testing-skill update.
- **Contracts.** Every module boundary is a zod schema in `src/lib/contracts`.
- **Facts.** `npm run check:facts` flags contracts, env vars, Krug ids and API docs
  that drift from the code ([docs/verification.md](docs/verification.md)).
- **Determinism.** Seeded RNG (mulberry32). The same seed gives the same journeys.
- **Safety.** Public http(s) URLs only, robots.txt honored, at most 1 request per 2s
  per host, no form submission, and variants never touch the live site.

## Docs

- `docs/PRD.md`: product spec
- `docs/krug-principles.md`: the rubric
- `docs/architecture.md`: module map
- `docs/demo-script.md`: the 60-second demo
- `terraform/README.md`: deployment

## What the labels mean

Each finding is `verified-failure`, `reproducible-concern` or `hypothesis`.
Simulated journeys are guesses about behavior, **not** predictions of conversion.
