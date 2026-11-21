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
   │      │      │      │      │      ├─ rubric.ts (rubric dimensions)
   │      │      │      │      │      └─ spec.ts → spec.md
   │      │      │      │      └─ mulberry32 seeded sampler, profiles, risk rank
   │      │      │      └─ JevClient (OpenRouter decisions) | FixtureJevClient
   │      │      └─ stateHash dedup, adjacency
   │      └─ selectRunner(): local Playwright by default; REHEARSAL_BROWSER opts into Browserbase backends
   └─ PlainFetcher → FirecrawlClient (hosted scrape/map fallback) → BrowserbaseFetcher + SSRF guards + politeness

telemetry: Sentry (SENTRY_DSN) + data/events/*.jsonl → /api/hooks/sentry → first-responder issue (docs/telemetry.md)
```

## Data flow

1. **discover**: plain fetch → extract actions (a page that looks like a JS shell retries via
   Firecrawl `/v1/scrape`; a seed with few links gets one `/v1/map` expansion bounded by
   `config.firecrawlMapLimit`) → `GraphBuilder` dedups by `stateHash` (normalized URL — hash and
   tracking params dropped, real query params kept sorted, so `?page=2` stays its own state —
   + viewport + action signature + modal flag). Budget: 30 states / depth 3, split fairly across
   viewport passes: each pass caps at `ceil((maxStates − states so far) / viewports remaining)`
   (`passStart` is persisted so a resumed pass keeps its share).
2. **simulate**: a bounded persona swarm (`maxAgents`/~200, `maxStepsPerAgent`, `maxConcurrentAgents`)
   walks the live site — one `runPersonaJourney` browser invocation per agent. The landing page
   is fetched once per run (`captureLandingPage`) and replayed into each agent's context along
   with its redirect-hop cookies, so robots.txt + politeness are paid once per swarm, not per
   agent; a failed capture falls back to per-agent fetches. Each step is one
   batched `jev.decide` scoring every candidate action plus a `__leave__` option; a seeded RNG
   samples the pick. Journeys are emergent and end `goal-reached` or `dropped-off` with a
   first-class reason; `PersonaSwarm` (journeys, drop-off distribution, state visits) persists on
   the experiment and journeys are also translated to `Trajectory`s for the dashboard heat map.
   Backends without `runPersonaJourney` fall back to the legacy seeded sampler (`scoreActions` →
   `simulateTrajectories`).
   Persona button labels follow accessible-name order (`aria-labelledby`, `aria-label`, text,
   then `value`) so role-based clicks target the same name. Form-owned submit buttons,
   including external `form="…"` controls, are excluded; a capture-phase guard also blocks
   submit events triggered by persona clicks before page submit handlers run.
3. **verify**: swarm mode replays `selectJourneys` — most-dropped + most-travelled journeys
   interleaved (≥1 goal-reached kept) — step-by-step through the recorded actions. Legacy mode
   uses `selectTrajectories` on the riskiest ~8 (+always a goal-reached path if any);
   `runTrajectory` executes them in desktop (and mobile for the top path), checking assertions.
   Verify and compare count goal success when all compiled assertions pass **or** a positive
   goal-endpoint alternative passes. Failed steps and runtime errors still fail the run;
   reaching an endpoint suppresses findings for the waived compiled-assertion mismatches.
4. **analyze**: `ruleFindings` (always-on: stale dates + apply CTA, vague labels, nav density,
   missing identity, failed assertions) + `llmFindings` (gemini-4-argon, rubric-grounded JSON).
   `llmFindings` splits the deduped pages into `LLM_FINDINGS_BATCH`-sized batches (5), each call
   bounded to the slice's remaining budget (`LLM_CALL_FLOOR_MS` floor, 5s) so a suspension lands
   its checkpoint instead of dying mid-await; finished batches persist as
   `runCheckpoint.analyze.llmFindingsBatches` and the next slice resumes mid-list. The same
   bounded `timeoutMs` covers goal classification and question refinement.
   LLM-only findings are always `unverified`, capped at `reproducible-concern`; a model reply
   cannot establish a `verified-failure`.
5. **compare**: variant (DomPatch set) applied via `addInitScript` in a fresh context;
   same assertions re-run; deltas recorded.
6. **spec**: `generateSpec` merges findings → ordered changes + rebuild phases → `spec.md`.
   The spec call is bounded to the slice's remaining budget, and `runCheckpoint.specRegenerated`
   marks a spec written during this run's slices so a resumed rerun never reuses a pre-rescan
   leftover (deliverables older than `rescannedAt` are stale). The spec-applied mockup is then
   built page by page; each page is forced through `enforceMockupWireframe` — grayscale palette,
   generic sans stack, site name rendered as "Preview" — whatever the model wrote.
   The dashboard and download preserve stored fix steps, order and rationale for surviving
   findings even without browser runs or after question filtering; only findings without a
   stored change get a recommendation-based fallback. Displayed ranks are renumbered.
7. **rebuild** (opt-in: a full run stops at spec; only `POST /api/experiments/:id/rebuild` runs it):
   plans the crawled pages as one site, then implements pages in durable batches →
   `experiment.rebuild.site`, served at `/experiments/:id/rebuild[/:slug]`.
   Planner metadata is server-owned; invalid optional fields do not discard a usable design.
   Unusable tokens/pages/blocks or a failed planning call fall back to a template plan, with
   a dashboard warning and the planner error. Page implementation may still use the LLM.
   Cloudflare-protected email links/text are decoded before rebuilding; undecodable email
   placeholders lose their href rather than becoming broken internal links. Non-page assets
   (PDF, Markdown, etc.) keep absolute original URLs instead of being rewritten as rebuilt pages.

## Browser and fetch vendors

`src/lib/browser/runner.ts#selectRunner` picks a `BrowserRunner` from env (`runner.name` is
logged as the `browser-runner` telemetry event at the start of discover):

| `REHEARSAL_BROWSER` | Backend |
|---|---|
| `auto` (default) | local Playwright Chromium (UnavailableRunner on workerd) |
| `browserbase-function` | published Browserbase Function (`BROWSERBASE_API_KEY` + `BROWSERBASE_FUNCTION_ID`) |
| `stagehand` | in-process Stagehand on Browserbase (`BROWSERBASE_API_KEY`) |
| `stagehand-local` | Stagehand on a local Chrome (`STAGEHAND_CHROME_PATH`) |
| `playwright` | local Playwright Chromium |

`auto` never spends hosted quota: discovery crawls with the plain fetcher (+ Firecrawl
fallback) and hosted backends run only when `REHEARSAL_BROWSER` names one. A forced
backend with missing keys falls back to local Playwright. Evals and e2e never touch a vendor.

**Stagehand v4** (`stagehand.ts`) — `Stagehand.create({ browser: browserbase.launch(...) })`.
Each step tries a deterministic XPath locator for the action's label/role first; if the label
no longer matches it falls back to `act()` (natural language, `selfHeal: true`). `act()` needs
a model: `STAGEHAND_MODEL`, else our `GEMINI_API_KEY` as `google/$GEMINI_MODEL_FAST`, else the
Browserbase Model Gateway (Browserbase only; it does not serve local browsers). Stagehand can
also drive a local Chrome (`stagehand-local`), but it is not the zero-key default — local
Playwright stays the hermetic fallback.

**Agent-driven verify** (`browser/agent.ts`) — `REHEARSAL_VERIFY_AGENT` swaps `runTrajectory`
for `runAgentTask`: an observe/act/extract loop (Stagehand v4 primitives) where each step
observes candidate elements in natural language and clicks the first safe one (click only,
never a form control or submit), instead of pinning to scripted locators. `BrowserRunner.supportsAgent` gates it; without a model (or on the
Playwright backend) verify falls back to `runTrajectory` — see docs/sandbox.md
for why this pattern (Vercel's agent-browser snapshot→refs→act model via Stagehand's API).

**Code sandbox** (`src/lib/sandbox`) — `CodeSandbox.run` executes agent-generated test code
against a fixture/rebuilt page or a live URL and returns assertions, console output and
errors. `REHEARSAL_SANDBOX=auto` picks the Cloudflare adapter (a `Sandbox` Durable Object
namespace with `getByName().run(script)` — the SDK 1.x DO pattern) when the binding exists,
else an isolated `node:worker_threads`+`vm` worker. Playwright cannot run on
workerd, so the node adapter is the CI/dev path and the container adapter carries the Workers
deploy — details and the binding setup in docs/sandbox.md.

**Fetch** (`src/lib/fetch`) — plain `fetch` first; Firecrawl (`POST
https://api.firecrawl.dev/v1/scrape` / `/v1/map`, `Bearer FIRECRAWL_API_KEY`) is the hosted
fallback for JS-shell pages and seed expansion; Browserbase Fetch (`browserbase.fetch`) remains
available as a fetcher when keyed. `selectFetcher()` picks Firecrawl → Browserbase → plain.
Every path runs `assertPublicUrl` + per-host politeness first. Plain fetches re-check every
redirect hop. On Workers, a fetch to an origin this deployment serves goes through the
`WORKER_SELF_REFERENCE` service binding instead — a Worker's `fetch` to its own Custom Domain
never reaches it (the edge answers a generated text/plain stub); self origins are learned from
each incoming request's URL plus `REHEARSAL_ORIGIN`. Local Chromium sends every request
(redirects and subresources too) through a
loopback egress proxy (`fetch/egress-proxy.ts`) that resolves each host, refuses non-public
IP ranges (including all IPv6 link-local `fe80::/10`, multicast and reserved ranges), and
connects to the IP it checked; IPv4-mapped IPv6 addresses are classified as IPv4, and
IPv4-compatible literals (`::/96`, hex or dotted) are classified by their embedded IPv4 —
`::7f00:1` (127.0.0.1) is refused, not treated as unicast. Runners also re-check
`page.url()` after each navigation.

Hosted browser runs keep the same contract caller-side: `BrowserbaseFunctionRunner` runs
`robotsAllows` + `politeDelay` before each Function invocation (each invocation is its own
process, so only the caller can space requests on one host apart), and `StagehandRunner`
gates `openPage`/`runPersonaJourney` the same way unless the caller already did
(`politenessHandledByCaller`).

## Environment variables

All are optional. `.env.example` is the template. `npm run check:facts` fails if code reads
a variable that is missing here or in `.env.example`, or if `.env.example` lists one nothing reads.

| Variable | Read by | Effect when unset |
|---|---|---|
| `GEMINI_API_KEY` | `analysis/gemini.ts`, `browser/stagehand.ts` | `FixtureLlmClient`; Stagehand falls back to the Browserbase Model Gateway |
| `GEMINI_MODEL_FAST` / `GEMINI_MODEL_DEEP` | `analysis/gemini.ts` | `gemini-4-hydrogen` / `gemini-4-argon` |
| `GEMINI_MODEL_MOCKUP` | `analysis/gemini.ts` | `GEMINI_MODEL_DEEP` — the generation model for spec-stage preview pages; retryable errors fall back to `GEMINI_MODEL_FAST` |
| `OPENROUTER_API_KEY` | `analysis/openrouter.ts` | unset: Gemini/fixture as above. Set: every LLM stage calls OpenRouter's chat completions API instead of Gemini; pages it writes carry `source: "openrouter"`. CI uploads it as a Worker secret from the Actions secret of the same name. Stagehand is unaffected (its model config has no base URL). Jev never reads it |
| `OPENROUTER_MODEL_FAST` / `OPENROUTER_MODEL_DEEP` / `OPENROUTER_MODEL_MOCKUP` / `OPENROUTER_MODEL_REBUILD` | `analysis/openrouter.ts` | `google/gemini-4-hydrogen` / `google/gemini-4-argon` / the deep model / `google/gemini-3.8-flash`; calls send OpenRouter a `models` fallback list ending in the fast model |
| `OPENROUTER_MODEL_REBUILD_PLANNER` | `analysis/openrouter.ts` | `anthropic/claude-opus-5.5`; one whole-site planning call with a 180s timeout; page implementation uses the rebuild model with 90s |
| `REHEARSAL_REBUILD_MAX_PAGES` | `rebuild/site.ts` | `40`; home-first unique crawled paths, with durable batches of six and a 700KiB total HTML cap |
| `REHEARSAL_REBUILD_GAP_MAX_PAGES` | `rebuild/gaps.ts` | `12` (0–100) successful additions total across at most four rounds; missing same-origin HTML pages are fetched two per step within 10 seconds, then built with the existing plan before recollection; failed/attempted paths are not retried, and over-cap links retain the not-rebuilt response |
| `REHEARSAL_GEMINI_MAX_CALLS` | `analysis/gemini.ts`, `analysis/openrouter.ts` | `10` LLM calls per run (reset at discover and at a standalone rebuild), first come first served; a run makes up to 6 plus one findings call per 5-page batch and one mockup call per spec-touched page (assertions, goal intent, visitor questions, findings × batches, spec, mockup × touched pages, rebuild), and calls past the cap use the deterministic fallback |
| `JEV_API_KEY` | `decisions/jev.ts` | `FixtureJevClient` |
| `JEV_BASE_URL` / `JEV_MODEL` | `decisions/jev.ts` | `https://api.typesafe.ai/v1/systemone` / `jev-latest` |
| `FIRECRAWL_API_KEY` | `fetch/firecrawl.ts`, `orchestrator.ts` | Discovery is plain-fetch only (no hosted fallback, no `/v1/map` expansion) |
| `FIRECRAWL_MIN_INTERVAL_MS` / `FIRECRAWL_429_RETRIES` / `FIRECRAWL_429_BACKOFF_MS` | `fetch/firecrawl.ts` | `5000` spacing between api.firecrawl.dev calls, shared across clients; a 429 retries `2` times honoring `Retry-After` (else `10000`ms base backoff, ≤20s total so a run slice still checkpoints), then the account no-ops for ~60s until the per-minute quota resets |
| `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` | `fetch/index.ts`, `browser/runner.ts` | Browserbase Fetch + Stagehand on Browserbase skipped |
| `STAGEHAND_MODEL` / `STAGEHAND_MODEL_API_KEY` | `browser/stagehand.ts` | `google/$GEMINI_MODEL_FAST` with `GEMINI_API_KEY` |
| `STAGEHAND_CHROME_PATH` | `browser/runner.ts` | Stagehand's default Chrome lookup (`stagehand-local` only) |
| `REHEARSAL_BROWSER` | `browser/runner.ts` | `auto` |
| `REHEARSAL_CHROMIUM_NO_SANDBOX` | `browser/sandbox.ts` | Local Chromium (Playwright, `stagehand-local`) runs with its sandbox on. `1` turns it off for hosts without unprivileged user namespaces; never set it in a deployment |
| `REHEARSAL_VERIFY_AGENT` | `browser/runner.ts`, `orchestrator.ts` | verify uses `runTrajectory` (scripted locators) |
| `REHEARSAL_SANDBOX` | `sandbox/index.ts` | `auto` — Cloudflare adapter when bound, node worker otherwise |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` | `telemetry/index.ts` | Sentry off (JSONL event log still written) / `0.2` |
| `SENTRY_WEBHOOK_SECRET` | `app/api/hooks/sentry/route.ts` | `POST /api/hooks/sentry` returns 503 (webhook not configured) |
| `GITHUB_TOKEN` | `app/api/hooks/sentry/route.ts` | Sentry alerts are verified but not filed as GitHub issues (logged notice) |
| `TIGERDATA_URL` (or `DATABASE_URL`) | `storage/index.ts` | `JsonFileStore` under `data/experiments/` |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | `app/layout.tsx` | alikhani.co's project key / `https://us.i.posthog.com` |
| `SNOWFLAKE_ACCOUNT_URL`, `SNOWFLAKE_TOKEN`, `SNOWFLAKE_CORTEX_SERVICE` | `storage/index.ts` | Cortex Search disabled |
| `REHEARSAL_ACCESS_TOKEN` | `proxy.ts` | No gate: every page and API route is open. Set it on any public host; browsers prompt for it (Basic auth, any username) and API clients send `Authorization: Bearer <token>` |
| `REHEARSAL_MAX_CONCURRENT_RUNS` | `access/index.ts` | `8` concurrent pipeline slots globally via D1 on Workers (per process without DB); extras queue or get 429 |
| `REHEARSAL_RUN_SLOT_TTL_MS` | `access/index.ts` | `90000` ms before an abandoned lease expires; active work renews every TTL/3 |
| `REHEARSAL_ALLOW_PRIVATE` | `fetch/guards.ts` | SSRF guard enforced. `1` lets tests target localhost; never set it in a deployment |

Terraform provisions the deploy subset (`terraform/README.md`); `scripts/verify-facts.ts`
keeps that list and its documented exemptions in sync with `.env.example`.

## Why adapters

Each external system sits behind an interface picked by env vars. No key means a fixture
or plain version, so a missing key can't break the demo and CI evals need no network.
