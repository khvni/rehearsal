# Rehearsal: AIE x MLH Hackathon @ Code Summit submission

Event: [AIE x MLH Hackathon @ Code Summit](https://www.mlh.com/events/aie-x-mlh-hackathon-code-summit) · Repo: [khvni/rehearsal](https://github.com/khvni/rehearsal)

## Pitch

**Rehearsal tries the journeys visitors take on a public site, before real visitors take them.** A visitor comes with one of three intents, named after procurement documents: **Information** (RFI, "what is this?"), **Quotation** (RFQ, "what will it cost?") or **Proposal** (RFP, "how do I start?"). Rehearsal finds the pages that answer them (pricing table, signup form, docs, demo booking), weights them by the kind of site, and builds the tree of choices a visitor makes to get there. Jev, a cheap typed decision model, scores that tree. A real browser then checks the journeys that matter. Each finding gets an evidence label and cites a principle from Steve Krug's *Don't Make Me Think*. The output is `spec.md`: a ranked list of changes and a phased rebuild plan. LLMs run a few times per run, never once per page state.

## What it does

Pipeline (`PIPELINE_STAGES` in `src/lib/orchestrator.ts`): `discover` → `simulate` → `verify` → `analyze` → `compare` → `spec`.

| Stage | What happens | Code |
|---|---|---|
| discover | Crawl public pages, dedupe states by `stateHash`, build the state graph; classify endpoints into intent classes and weight them | `src/lib/graph`, `src/lib/intents/{endpoints,patterns,classify}.ts` |
| simulate | Jev scores every action in every state; seeded journeys across behavioral profiles; endpoint journeys per intent | `src/lib/decisions/jev.ts`, `src/lib/simulation`, `src/lib/intents/journeys.ts` |
| verify | Real-browser runs (desktop + mobile) with assertions, screenshots and layout metrics (fold, CTA prominence, trunk test) | `src/lib/browser/*` |
| analyze | Rule, metric and unanswered-visitor-question findings, each labeled `verified-failure` / `reproducible-concern` / `hypothesis` and citing K1–K9 from `docs/krug-principles.md` | `src/lib/analysis/*`, `src/lib/intents/questions.ts` |
| compare | Applies a constrained `DomPatch` variant in an isolated Playwright context and re-runs the same assertions | `src/lib/variants` |
| spec | Turns findings into ranked changes and a rebuild plan (truth pass → hierarchy pass → verification loop) | `src/lib/analysis/spec.ts` |

### Demo outcome: ai.engineer/code/2026

The demo ([docs/demo-script.md](demo-script.md)) runs on the AI Engineer Code Summit page. [docs/sample-spec.md](sample-spec.md) is the real output from that run: 10 browser runs, 1 verified failure and 2 reproducible concerns, mapped to 3 changes. The headline finding is **"Post-event page still invites registration"**. After the event, the page still shows NOV 10–12, 2026 next to apply and register buttons (Krug: `omit-words`). The run also found 407 distinct links on the page (`scanning-not-reading`).

That run also produced a bad finding. The top "verified failure" was `url-matches "schedule"`. That came from an assertion an LLM wrote, not from a usability problem. PRD v3.0 ([docs/PRD.md §0](PRD.md)) was written because of it. It replaces free-text goals with the RFI/RFQ/RFP intent model ([docs/intent-model.md](intent-model.md)), so success means *an endpoint was reached*. Endpoint discovery and weighting, endpoint journeys, page metrics and visitor questions shipped in PRs #7–#9.

### 11-site sweep

`npm run site -- --all` runs the headless `Orchestrator.runAll` against the live reference corpus on the **keyless** stack (local Playwright, fixture Jev/LLM). Budget: 15 states, 300 trajectories, 4 verify runs, desktop, seed 1337. The full table and the per-site `summary.json` + `spec.md` are in `docs/runs/README.md` on that branch.

| Site | Goal | Status | States | Edges | Findings c/h/m/l | Total s |
|---|---|---|---|---|---|---|
| brightdata.com | find pricing for the Web Unlocker | complete | 15 | 191 | 0/1/2/0 | 123 |
| devpost.com | find an upcoming hackathon to join | complete | 15 | 110 | 0/2/1/0 | 62 |
| digitalocean.com | find droplet pricing | complete | 15 | 321 | 0/2/8/0 | 73 |
| heygen.com | find pricing and sign up | complete | 15 | 255 | 0/1/2/0 | 62 |
| hyperframes.studio | understand what the product does and request a demo | **blocked** (renderer unresponsive in headless Chromium) | 0 | 0 | 0/0/0/0 | 100 |
| keysight.com | find pricing or request a quote for an oscilloscope | **blocked** (Cloudflare challenge) | 1 | 0 | 0/1/0/0 | 54 |
| mlh.io | find the upcoming hackathon schedule | complete | 13 | 122 | 0/1/1/0 | 82 |
| mtc.so | find how to join or start a chapter | complete | 15 | 308 | 0/2/1/0 | 136 |
| sentry.io | find pricing and start a trial | complete | 15 | 274 | 0/1/4/0 | 74 |
| snowflake.com | start a free trial | complete | 15 | 143 | 0/2/2/0 | 57 |
| tigerdata.com | find pricing and sign up | complete | 15 | 136 | 0/2/3/0 | 41 |

9 of 11 sites completed with no keys. The 2 blocked sites need a real browser network, which is what the Bright Data Browser API is for (below). No site had any of its 4 verify runs count as "fully successful". That bar is strict: it also needs zero page and console errors. On live third-party sites, read it as a signal, not a pass rate.

## Prize categories

Every module named here exists on `main` unless marked otherwise. Every vendor adapter is env-gated and falls back to a deterministic implementation (AGENTS.md rule 4).

### Best Use of Gemini API

- `src/lib/analysis/gemini.ts`: `GeminiClient` calls the `generativelanguage` REST API directly. It has two tiers: `gemini-4-hydrogen` (`GEMINI_MODEL_FAST`) for cheap structured JSON calls and `gemini-4-argon` (`GEMINI_MODEL_DEEP`) for findings and spec writing. `FixtureLlmClient` is the keyless stand-in, and `selectLlm()` picks between them.
- Call sites: assertion compile (`orchestrator.ts`, fast), intent classification (`intents/classify.ts`, fast), visitor-question refinement (`intents/questions.ts`, fast), Krug-rubric findings (`analysis/findings.ts`, deep), spec narrative (`analysis/spec.ts`, deep). Every call asks for JSON and falls back to the deterministic result on any parse failure.
- **Design budget vs. today:** PRD v3.0 §6.3 sets a target of **≤2 Gemini calls per run**, and Gemini is never called inside the per-state loop. That second rule holds today. The first doesn't yet: the current code makes up to **5** calls per run (3 fast + 2 deep), all once per run. Cutting assertion compile and classification down to deterministic code is the remaining v3 item.

### Best Use of System One Models (Jev)

- `src/lib/decisions/jev.ts`: `HttpJevClient` calls the OpenRouter decisions API (`JEV_BASE_URL`, model `typesafe/jev-1.13`). `FixtureJevClient` is the deterministic offline path.
- `scoreActions()` asks two **typed** questions per state. One is a `choice` keyed by the real `actionId`s, so the model can't pick an action that doesn't exist. The other is a `score` for state ambiguity. The returned distributions become transition weights for the seeded journey simulator.
- Each discovered state is scored once (`orchestrator.ts`: "Score each state's actions once"). States are already deduped by `stateHash`, so Jev cost grows with unique page states, not with trajectories: 300–1,000 journeys reuse one decision per state. The PRD's `(stateHash, intent, persona)` cross-run cache is specified but not built yet.

### Best Use of Bright Data

- `src/lib/fetch/index.ts`: `BrightDataFetcher` uses Web Unlocker (`POST https://api.brightdata.com/request`, `BRIGHTDATA_API_KEY` + `BRIGHTDATA_ZONE`). It is first in `selectFetcher()`, ahead of Browserbase Fetch and plain fetch.
- `src/lib/browser/brightdata.ts` + `src/lib/browser/runner.ts`: `BrightDataBrowserRunner` uses the Browser API over CDP (`BRIGHTDATA_BROWSER_WS` or `_USER`/`_PASSWORD`) with one fresh session per page. It is first in `selectRunner()`. When Browserbase is also configured, `CompositeRunner` sends state capture to Bright Data and multi-step trajectories to Stagehand.
- Every outbound URL goes through `assertPublicUrl` (`src/lib/fetch/guards.ts`) before Bright Data sees it.
- Why it matters: in the keyless sweep, keysight.com hit a Cloudflare challenge and hyperframes.studio hung headless Chromium. Those are the sites the Bright Data path exists for.

### Sentry

- `src/lib/telemetry/index.ts`: `@sentry/nextjs` is lazily imported and initialized only when `SENTRY_DSN` is set (`SENTRY_TRACES_SAMPLE_RATE`, default 0.2). `withTrace()` wraps the `discover`, `simulate`, `verify` and `analyze` stages in Sentry spans, and `captureError()` reports stage failures. Every event is also written to a JSONL log under `data/events/`.
- Limits: server-side only. There are no `sentry.*.config` files and no client SDK. `SENTRY_DSN` is mapped into both Terraform stacks.

### Tiger Data

- `src/lib/storage/index.ts`: `TigerDataStore` implements the `ExperimentStore` contract on Postgres (`pg` is lazily imported). It is active when `TIGERDATA_URL` or `DATABASE_URL` is set. `selectStore()` falls back to `JsonFileStore`. `DATABASE_URL` is provisioned in the DigitalOcean Terraform stack.

### Snowflake

- `src/lib/storage/index.ts`: `SnowflakeCortex` queries the Cortex Search REST endpoint (`/api/v2/cortex/search:query`) for related past findings, using `SNOWFLAKE_ACCOUNT_URL`, `SNOWFLAKE_TOKEN` and `SNOWFLAKE_CORTEX_SERVICE`. With no config it returns `[]`.
- Limits: a thin adapter. It is **not yet called from the orchestrator or the dashboard**, and `scripts/verify-facts.ts` classifies `SNOWFLAKE_*` as "optional backends not provisioned yet".

### DigitalOcean

- `terraform/digitalocean`: a `digitalocean_droplet` with cloud-init (`cloud-init.yaml.tftpl`), plus `digitalocean_firewall` and a `digitalocean_record`. Outputs are `droplet_ip` and `app_url`. App env vars (`GEMINI_API_KEY`, `JEV_API_KEY`, `BRIGHTDATA_*`, `SENTRY_DSN`, `DATABASE_URL`) map from Terraform variables, and `check:facts` checks that mapping. `terraform fmt`/`validate` run in CI (PR #1). There is also a sibling `terraform/cloudflare` Workers stack. `terraform apply` is a human-only step (docs/verification.md, layer 3). It was run by hand for the live demo (see the table below).

### HyperFrames

- `demo/video/` is a HyperFrames composition, rendered with `hyperframes@0.9.42` to `demo/video/out/rehearsal-demo.mp4`. hyperframes.studio is also a sweep target (blocked in headless Chromium, PR #19).

### Cleanest Use of a Software Factory

Agents built this repo. The rules they work under are code in the repo too.

- **Orchestration:** 29+ PRs so far. Each was opened by a Devin SWE-2 Lightning subagent on its own file slice, and an orchestrator session (poteto-mode) fanned out the work and merged the PRs. All merged. #16 is an issue the factory filed itself (below).
- **Factory as code** ([docs/factory.md](factory.md), `factory/`): `branch-protection.json` (the exact rulesets-API body: PRs required, squash-only, linear history, required checks `check`, `terraform`, `Devin Review`), `review-policy.json`, `automations.yaml` (nightly corpus audit, hourly snapshot health, weekly factory report), `blueprint.yaml`. `npm run factory:check` diffs these files against the live ruleset, and `.github/workflows/factory-check.yml` runs it. `npm run factory:sync -- --apply` applies them.
- **Review policy** ([docs/review-policy.md](review-policy.md)): only `bug` and `security` findings block merge, with at most 2 review rounds. Feedback repeated twice becomes a lint rule or an eval. Devin Review left a review on 16 of the 19 PRs (#1–#15, #17).
- **Lint as back pressure** (`eslint-rules/`): `rehearsal/contracts-first` means no exported type or zod schema outside `src/lib/contracts`. Devin Review had flagged this on early PRs, and it became a rule in PR #10. `rehearsal/finding-cites-krug` means every Finding literal must set `krugPrinciple`. Lint also bans `any` and `console`, with `--max-warnings 0`. The rules have unit tests in `tests/unit/eslint-rules.test.ts`.
- **Layered verification** ([docs/verification.md](verification.md)): a script checks facts, an agent makes judgment calls, and a human does anything irreversible. `npm run check:facts` (`scripts/verify-facts.ts`) runs in under a second with no network. It checks drift between zod contracts and data, env vars across code, `.env.example`, docs and Terraform, the Krug catalog, and the API catalog against routes.
- **Skill sync:** `npm run check:skill-sync` fails a commit that adds a pipeline stage or eval file without updating `.devin/skills/rehearsal-testing/SKILL.md`. So the agents' testing skill stays current.
- **CI** (`.github/workflows/`): `ci.yml` runs lint, typecheck, unit, evals, skill-sync, facts and hermetic Playwright e2e. `spec-delta.yml` runs the full keyless pipeline on every PR, diffs `spec.md` against a golden, and posts a sticky PR comment with a dashboard screenshot. `snapshot-health.yml` rebuilds `main` from scratch every hour ([docs/snapshot-health.md](snapshot-health.md)).
- **It caught a real break:** the hourly rebuild found `main` red after a merge and filed issue #16 ("Snapshot health: main is red"). PR #17 is the fix (runner types moved into contracts).
- **Determinism:** seeded RNG, fixture adapters, and 5 eval suites with thresholds (`tests/evals/*.eval.ts`, `evals.config.json`). There are about 100 unit, eval and e2e cases, all hermetic.
- **Design check** (in CI): `docs/design-check.md` + `.github/workflows/design-check.yml` run an Impeccable design audit of the dashboard.
- **Security:** the orchestrator reports a Devin Security scan with 13 triaged findings. The results are not in the repo, so that number can't be checked here.

## What's real vs. wired

| Area | Status |
|---|---|
| Keyless deterministic pipeline (discover → spec, fixture Jev/LLM, local Playwright) | **Proven**: CI on every PR, hourly rebuild, spec-delta golden, 11-site live sweep |
| Intent model, endpoint weighting, page metrics, visitor questions, Krug-cited findings | **Proven** in evals and the sweep |
| Factory (rulesets, review policy, lint rules, check:facts, skill-sync, snapshot health) | **Proven**: running in CI. Applying the ruleset needs repo admin (`factory:sync -- --apply`) |
| **Gemini** `GEMINI_API_KEY` | **Live-verified** 2026-11-13: `gemini-4-hydrogen` returns findings on the real key. `gemini-4-argon` hits HTTP 429 (quota/billing) on the supplied key; the client falls back to hydrogen and logs the event (PR #24). `REHEARSAL_GEMINI_MAX_CALLS` caps calls per run |
| **Bright Data** `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE`, `BRIGHTDATA_BROWSER_WS` | **Live-verified**: zones `rehearsal_unlocker` + `rehearsal_browser` created via the Account Management API (admin key). Web Unlocker fetched keysight.com (200, the site local Playwright is blocked on); Browser API CDP session loaded ai.engineer in ~6s and the live AIE run used `brightdata-browser-api` for browser verification |
| **Tiger Data** `TIGERDATA_URL` | **Live-verified**: `TigerDataStore` connects and lists experiments (PostgreSQL 18.6 + TimescaleDB). Requires the `sslmode=require` handling in `src/lib/storage/index.ts` (PRs #26/#28) |
| **Sentry** `SENTRY_DSN` + `SENTRY_WEBHOOK_SECRET` | **Wired**: SDK `register()` + `onRequestError` in `src/instrumentation.ts`, stage spans, `POST /api/hooks/sentry` → `first-responder` GitHub issue (PR #21). Live telemetry needs the DSN deployed + the Sentry internal integration/alert rule configured (docs/telemetry.md) |
| **Jev** `JEV_BASE_URL`/`JEV_API_KEY` | **Fixture only**: the supplied key 401s against OpenRouter's decisions endpoint; needs the real Jev endpoint/model. Pipeline falls back to the deterministic fixture scorer |
| **Browserbase Stagehand** `BROWSERBASE_*` | **Wired, untested**: trajectory runner route; no key supplied |
| **Snowflake Cortex Search** | **Out of scope**: dropped. Postgres (Tiger Data) is the store for this build |
| **DigitalOcean** Terraform stack | **Live**: `terraform apply` completed 14:19 PST; app deployed at http://146.190.113.82 (droplet `s-2vcpu-4gb`, sfo3; cloud-init build ~10min). Secrets passed via env, written to `/etc/rehearsal/env` |
| **Cloudflare** Terraform stack | **Validated** (`fmt` + `validate` in CI); not applied |
| **HyperFrames** demo video | **Rendered**: `demo/video/out/rehearsal-demo.mp4` (1920×1080, ~83s, hyperframes@0.9.42); project in `demo/video/` |

## How to run

```bash
export PATH=$HOME/.local/node/bin:$PATH   # Node 22
npm ci
cp .env.example .env        # every key is optional; adapters fall back to fixtures
npm run check               # lint + typecheck + unit + evals + skill-sync + facts
npm run dev                 # http://localhost:3000
```

Paste `https://ai.engineer/code/2026` and a goal, click **Rehearse**, and open `spec.md` when the stages finish. API: `POST /api/experiments` → `POST /api/experiments/:id/run` → `GET /api/experiments/:id/spec` ([docs/api.md](api.md)). Hermetic browser tests: `npx playwright install chromium && npm run test:e2e`.

## DevRelay / MLH submission fields

- **Project name:** Rehearsal
- **short_description:** Tries real visitor journeys on a public site and returns a ranked rebuild spec, with evidence for each change.
- **description:** Rehearsal sorts visitor goals into Information, Quotation or Proposal, finds and weights the pages that answer them, builds the journey tree, checks it in real browsers, and writes spec.md: Krug-cited fixes plus a rebuild plan. See the README.
- **technologies:** TypeScript, Next.js 16, Playwright, Zod, Terraform, Gemini API (gemini-4-hydrogen/argon), Bright Data Web Unlocker + Browser API, Browserbase Stagehand, Jev (system-one decision model), Sentry SDK, Tiger Data (Postgres/TimescaleDB), DigitalOcean, HyperFrames.
- **ai_tools (what built it):** Devin (SWE-2 Lightning subagents + orchestrator) on Cognition's harness.
- **github link:** https://github.com/khvni/rehearsal
- **demo video:** `demo/video/out/rehearsal-demo.mp4` (in repo). Attach it in the form.
- **live demo:** http://146.190.113.82 (DigitalOcean droplet).
- **extra_links:** "11-site sweep" → docs/runs/README.md · "Factory as code" → docs/factory.md · "Telemetry" → docs/telemetry.md
- **sponsor_usage:** Gemini API: fast+deep models drive assertion compilation and rubric findings with deterministic fallback and per-run budget (REHEARSAL_GEMINI_MAX_CALLS); DigitalOcean: droplet stack in terraform/digitalocean deployed at the live demo URL; Tiger Data: experiments persist to Postgres/TimescaleDB via TigerDataStore (verified live); Bright Data: Web Unlocker fetches protected pages and Browser API sessions power state capture + verification (zones created via Account Management API); HyperFrames: the demo video is a HyperFrames composition (demo/video) rendered with hyperframes@0.9.42; Sentry: SDK wiring, stage spans, and a signed webhook that files first-responder issues; System One Models: Jev drives per-state action scoring in simulate; Software Factory: factory-as-code in factory/, contracts-first lint, spec-delta CI, hourly snapshot rebuilds, layered verification.
