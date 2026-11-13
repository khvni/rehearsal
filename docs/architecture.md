# Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Dashboard (Next.js App Router)                                   │
│  page.tsx — URL + goal input                                     │
│  experiments/[id] — React Flow graph, evidence, findings, spec   │
└───────────────┬──────────────────────────────────────────────────┘
                │ REST
┌───────────────▼──────────────────────────────────────────────────┐
│ /api/experiments[/:id/:stage]  →  Orchestrator (PIPELINE_STAGES) │
└──┬──────┬──────┬──────┬──────┬──────┬────────────────────────────┘
   │      │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼      ▼
 fetch  browser graph decisions simulation analysis variants storage
   │      │      │      │      │      │      │       │
   │      │      │      │      │      │      │       ├─ JsonFileStore (default)
   │      │      │      │      │      │      │       ├─ TigerDataStore (DATABASE_URL)
   │      │      │      │      │      │      │       └─ SnowflakeCortex (KB search)
   │      │      │      │      │      │      └─ DomPatch → addInitScript
   │      │      │      │      │      ├─ GeminiClient (hydrogen/argon) | FixtureLlmClient
   │      │      │      │      │      ├─ rubric.ts (Krug dimensions)
   │      │      │      │      │      └─ spec.ts → spec.md
   │      │      │      │      └─ mulberry32 seeded sampler, profiles, risk rank
   │      │      │      └─ JevClient (OpenRouter decisions) | FixtureJevClient
   │      │      └─ stateHash dedup, adjacency
   │      └─ selectRunner(): BrightDataBrowserRunner → StagehandRunner → PlaywrightRunner
   └─ BrightDataFetcher (Web Unlocker) → BrowserbaseFetcher → PlainFetcher + SSRF guards + politeness

telemetry: Sentry (SENTRY_DSN) + data/events/*.jsonl → /api/hooks/sentry → first-responder issue (docs/telemetry.md)
```

## Data flow

1. **discover**: fetch → render → extract actions → `GraphBuilder` dedups by `stateHash`
   (normalized URL + viewport + action signature + modal flag). Budget: 30 states / depth 3.
2. **simulate**: `scoreActions` asks Jev `choice` (best action per state) + `score` (ambiguity);
   weights → `simulateTrajectories` samples ≤1000 seeded paths across 3 behavioral profiles.
3. **verify**: `selectTrajectories` picks the riskiest ~8 (+always a goal-reached path if any);
   `runTrajectory` executes them in desktop (and mobile for the top path), checking assertions.
4. **analyze**: `ruleFindings` (always-on: stale dates + apply CTA, vague labels, nav density,
   missing identity, failed assertions) + `llmFindings` (gemini-4-argon, rubric-grounded JSON).
5. **compare**: variant (DomPatch set) applied via `addInitScript` in a fresh context;
   same assertions re-run; deltas recorded.
6. **spec**: `generateSpec` merges findings → ordered changes + rebuild phases → `spec.md`.

## Browser and fetch vendors

`src/lib/browser/runner.ts#selectRunner` picks a `BrowserRunner` from env (`runner.name` is
logged as the `browser-runner` telemetry event at the start of discover):

| Priority | Condition | State capture (`openPage`) | Trajectories (`runTrajectory`) |
|---|---|---|---|
| 1 | `BRIGHTDATA_BROWSER_WS` or `BRIGHTDATA_BROWSER_USER`+`_PASSWORD` | Bright Data Browser API | Stagehand on Browserbase if `BROWSERBASE_API_KEY`, else Bright Data |
| 2 | `BROWSERBASE_API_KEY` | Stagehand on Browserbase | Stagehand on Browserbase |
| 3 | no keys | local Playwright Chromium | local Playwright Chromium |

`REHEARSAL_BROWSER=brightdata|stagehand|stagehand-local|playwright` forces a backend (falls
back to local Playwright when its keys are missing). Evals and e2e never touch a vendor.

**Bright Data Browser API** (`brightdata.ts`) — Playwright `connectOverCDP` to
`wss://<user>:<pass>@brd.superproxy.io:9222`. Session limits: a session is pinned to one
domain (`navigate_domains_limit`), closes after 5 min idle, and has a hard max length (the
product docs say 60 min; Bright Data's agent best-practices guide says one initial navigation
and 30 min). We design for the stricter reading: **every captured state opens a new session
with exactly one navigation**, and each trajectory gets one session that navigates once and
then advances by clicking (same-origin `goto` is only a fallback). Navigation timeout is 120 s,
as Bright Data recommends for unlocking.

**Stagehand v4** (`stagehand.ts`) — `Stagehand.create({ browser: browserbase.launch(...) })`.
Each step tries a deterministic XPath locator for the action's label/role first; if the label
no longer matches it falls back to `act()` (natural language, `selfHeal: true`). `act()` needs
a model: `STAGEHAND_MODEL`, else our `GEMINI_API_KEY` as `google/$GEMINI_MODEL_FAST`, else the
Browserbase Model Gateway (Browserbase only; it does not serve local browsers). Stagehand can
also drive a local Chrome (`stagehand-local`), but it is not the zero-key default — local
Playwright stays the hermetic fallback. Stagehand cannot attach to a Bright Data CDP session
(its `localBrowser.connect` needs its extension loaded from a shared filesystem), so the two
vendors are combined by routing, not by sharing a browser.

**Fetch** (`src/lib/fetch`) — Bright Data Web Unlocker (`POST https://api.brightdata.com/request`
with `{ zone, url, format: "raw" }`) → Browserbase Fetch (`browserbase.fetch`) → plain `fetch`.
Every path runs `assertPublicUrl` + per-host politeness first. Bright Data SERP API and Web
Scraper API / datasets target search engines and prebuilt site scrapers, so they are not wired.

## Environment variables

All are optional. `.env.example` is the template. `npm run check:facts` fails if code reads
a variable that is missing here or in `.env.example`, or if `.env.example` lists one nothing reads.

| Variable | Read by | Effect when unset |
|---|---|---|
| `GEMINI_API_KEY` | `analysis/gemini.ts`, `browser/stagehand.ts` | `FixtureLlmClient`; Stagehand falls back to the Browserbase Model Gateway |
| `GEMINI_MODEL_FAST` / `GEMINI_MODEL_DEEP` | `analysis/gemini.ts` | `gemini-4-hydrogen` / `gemini-4-argon` |
| `REHEARSAL_GEMINI_MAX_CALLS` | `analysis/gemini.ts` | `2` Gemini calls per run (reset at discover), first come first served; a run makes up to 5 (assertions, goal intent, visitor questions, findings, spec), and calls past the cap use the deterministic fallback |
| `JEV_API_KEY` (or `OPENROUTER_API_KEY`) | `decisions/jev.ts` | `FixtureJevClient` |
| `JEV_BASE_URL` / `JEV_MODEL` | `decisions/jev.ts` | `https://openrouter.ai/api/alpha/decisions` / `typesafe/jev-1.13` |
| `BRIGHTDATA_API_KEY` + `BRIGHTDATA_ZONE` | `fetch/index.ts` | Web Unlocker skipped (both are required) |
| `BRIGHTDATA_BROWSER_WS`, or `BRIGHTDATA_BROWSER_USER` + `BRIGHTDATA_BROWSER_PASSWORD` | `browser/brightdata.ts` | Bright Data Browser API skipped |
| `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` | `fetch/index.ts`, `browser/runner.ts` | Browserbase Fetch + Stagehand on Browserbase skipped |
| `STAGEHAND_MODEL` / `STAGEHAND_MODEL_API_KEY` | `browser/stagehand.ts` | `google/$GEMINI_MODEL_FAST` with `GEMINI_API_KEY` |
| `STAGEHAND_CHROME_PATH` | `browser/runner.ts` | Stagehand's default Chrome lookup (`stagehand-local` only) |
| `REHEARSAL_BROWSER` | `browser/runner.ts` | `auto` |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` | `telemetry/index.ts` | Sentry off (JSONL event log still written) / `0.2` |
| `SENTRY_WEBHOOK_SECRET` | `app/api/hooks/sentry/route.ts` | `POST /api/hooks/sentry` returns 503 (webhook not configured) |
| `GITHUB_TOKEN` | `app/api/hooks/sentry/route.ts` | Sentry alerts are verified but not filed as GitHub issues (logged notice) |
| `TIGERDATA_URL` (or `DATABASE_URL`) | `storage/index.ts` | `JsonFileStore` under `data/experiments/` |
| `SNOWFLAKE_ACCOUNT_URL`, `SNOWFLAKE_TOKEN`, `SNOWFLAKE_CORTEX_SERVICE` | `storage/index.ts` | Cortex Search disabled |
| `REHEARSAL_ALLOW_PRIVATE` | `fetch/guards.ts` | SSRF guard enforced. `1` lets tests target localhost; never set it in a deployment |

Terraform provisions the deploy subset (`terraform/README.md`); `scripts/verify-facts.ts`
keeps that list and its documented exemptions in sync with `.env.example`.

## Why adapters

Each external system sits behind an interface picked by env vars. No key means a fixture
or plain version, so a missing key can't break the demo and CI evals need no network.
