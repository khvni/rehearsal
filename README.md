# Rehearsal

Hackathon submission (AIE x MLH @ Code Summit): [docs/submission.md](docs/submission.md)

Rehearsal tries your website the way visitors will, before they do. Give it a public
URL; a goal is optional — left blank, one is suggested from the page itself.
It maps the pages, simulates visitor journeys, replays the risky ones
in a real browser, and tests a fix on an isolated copy. Then it writes `spec.md`:
ranked changes plus a rebuild plan, each citing a usability principle
(`docs/krug-principles.md`).

Demo target: https://ai.engineer/code/2026

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 16 + React 19 + TypeScript |
| Graph | @xyflow/react |
| Browser | local Playwright (Browserbase Stagehand/Function via `REHEARSAL_BROWSER`) |
| Page fetch | plain fetch → Firecrawl (scrape/map) → Browserbase Fetch |
| Decisions | Jev System One via TypeSafe by default (`JEV_API_KEY`); offline fixture without the key |
| LLM | OpenRouter with `OPENROUTER_API_KEY`; otherwise direct Gemini with `GEMINI_API_KEY`, or the offline fixture without either key |
| Persistence | JSON files → Tiger Data (`DATABASE_URL`) |
| KB (optional) | Snowflake Cortex Search |
| Observability | Sentry (DSN-gated) + JSONL event log |
| Deploy | Cloudflare Workers via OpenNext (`rehearsal.alikhani.co`, `deploy-cloudflare.yml`) + `terraform/cloudflare`; `terraform/digitalocean` is an alternate |
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

Paste the URL (and optionally a goal), click Rehearse, watch the stages run, then open `spec.md`.

## Pipeline

`discover` → `simulate` → `verify` → `analyze` → `compare` → `spec`

`PIPELINE_STAGES` in `src/lib/orchestrator.ts`. CI fails if
`.devin/skills/rehearsal-testing/SKILL.md` drifts from it.

## Live-site runs

`npm run site -- <url> --goal "find pricing"` runs the pipeline without the Next server
and writes `docs/runs/<host>/{spec.md,summary.json}`. `npm run site -- --all` runs every
site in `docs/runs/sites.json` and rebuilds the table in `docs/runs/README.md`.
Flags: `--max-states 15 --trajectories 300 --verify 4 --max-depth 3 --viewports desktop --timeout-min 5 --agents 20 --agent-steps 8 --agent-concurrency 3` (the persona-swarm flags keep live-site load polite; the app default is 200 agents).
Sites that block local Playwright (bot wall, captcha, hung renderer) are recorded as
`blocked`, with the reason. `FIRECRAWL_API_KEY` adds a hosted fetch fallback for JS-heavy
pages; `REHEARSAL_BROWSER` opts into the hosted Browserbase backends.

## API

`POST /api/experiments` `{targetUrl, goal}` → `POST /api/experiments/:id/{discover|simulate|verify|analyze|compare|spec|run}` → `GET /api/experiments/:id` → `GET /api/experiments/:id/spec` (markdown). `GET /api/experiments` lists experiments. Full list: [docs/api.md](docs/api.md).

Environment variables: [docs/architecture.md#environment-variables](docs/architecture.md#environment-variables).

## Checks

- **Evals.** `npm run eval` runs fixture cases against thresholds in
  `tests/evals/evals.config.json`. The build fails below them.
- **Skill sync.** `npm run check:skill-sync` fails if a stage or eval file lands
  without a testing-skill update.
- **Contracts.** Every module boundary is a zod schema in `src/lib/contracts`.
- **Hooks.** Lefthook runs the static gates locally — oxlint + eslint + Impeccable detect +
  `terraform fmt` pre-commit, typecheck + skill-sync + function-lib + facts + diff-scoped vitest
  pre-push (`npm postinstall` installs them; `LEFTHOOK=0` skips). Hooks are bypassable, so CI's
  `check` job runs the same gates as the guaranteed pre-merge gate.
- **Facts.** `npm run check:facts` flags contracts, env vars, principle ids and API docs
  that drift from the code ([docs/verification.md](docs/verification.md)).
- **Determinism.** Seeded RNG (mulberry32). The same seed gives the same journeys.
- **Safety.** Public http(s) URLs only, robots.txt honored, at most 1 request per 2s
  per host, no form submission, and variants never touch the live site.

## Docs

- `docs/PRD.md`: product spec
- `docs/krug-principles.md`: the rubric (internal canon; findings show its plain-language titles)
- `docs/architecture.md`: module map
- `docs/demo-script.md`: the 60-second demo
- `terraform/README.md`: deployment

## What the labels mean

Each finding is `verified-failure`, `reproducible-concern` or `hypothesis`.
Simulated journeys are guesses about behavior, **not** predictions of conversion.
