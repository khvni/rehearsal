# API

REST surface under `src/app/api/` (Node runtime, `force-dynamic`). Every route below is
checked against the code by `npm run check:facts` — add a row in the same commit as a new
route or method.

With `REHEARSAL_ACCESS_TOKEN` set, every route except `/api/hooks/*` needs
`Authorization: Bearer <token>` (or Basic auth with the token as the password) and returns
401 otherwise. `POST /api/experiments/:id/:stage` returns 429 (`Retry-After: 30`) when
`REHEARSAL_MAX_CONCURRENT_RUNS` stage requests are already running.

| Method | Path | Body / params | Returns |
|---|---|---|---|
| POST | `/api/experiments` | `{targetUrl, goal?, config?, idempotencyKey?}` (`url` accepted as an alias of `targetUrl`; `goal` optional — a first-page probe infers goal + `personas` when omitted; `Idempotency-Key` header accepted as the dedupe key) | the `Experiment` (status `queued`; the pipeline runs as a background job that survives the request). A repeat `idempotencyKey` or a previously scanned normalized site returns the existing record with `dedupe: "idempotency"\|"site"` and never consumes the daily-create budget; 400 if `targetUrl` missing, over 2048 chars, or fails `assertPublicUrl`, or `goal` is over 500 chars (`EXPERIMENT_INPUT_LIMITS`) |
| GET | `/api/experiments` | — | `[{id, targetUrl, goal, status, createdAt}]` |
| GET | `/api/experiments/:id` | — | the full `Experiment` (contract in `src/lib/contracts`); 404 if unknown |
| GET | `/api/experiments/:id/activity` | — | `ActivityEvent[]` (contract in `src/lib/contracts`), chronological, capped at `ACTIVITY_EVENT_LIMIT`; 404 if unknown |
| POST | `/api/experiments/:id/:stage` | `:stage` = a pipeline stage or `run` | the updated `Experiment`; 400 on an unknown stage, 409 `{error, runningStage}` while another stage or `run` of the same experiment is in progress, 429 at the concurrency cap or once the daily run budget is spent (`RUN_PER_IP_PER_DAY` per caller, IPv6 keyed by /64; `RUN_PER_EXPERIMENT_PER_DAY` per experiment), 403 on an already `complete` experiment, 500 on a stage error. The access token (`REHEARSAL_ACCESS_TOKEN`, Bearer or Basic) skips the 403 and the daily budget |
| POST | `/api/experiments/:id/rescan` | `{goal?}` | the `Experiment` plus `rescan: RescanReport`. Probes the pages discover stored via the plain fetcher and compares content signatures: changed → artifacts reset + the pipeline re-runs as a background job (202); unchanged → no-op (200); a new `goal` regenerates goal-derived artifacts on the kept graph without a recrawl (202); 404 unknown, 409 while a run is in progress, 400 if `goal` is over 500 chars, 429 once the daily run budget it shares with the stage route is spent |
| POST | `/api/hooks/sentry` | Sentry webhook (raw JSON), headers `Sentry-Hook-Signature` + `Sentry-Hook-Resource` (`event_alert` or `issue`) | `{ok, issueId, action: created\|updated\|reopened\|skipped, number?}`; `{ok, ignored}` for other resources/actions; 401 bad signature, 503 without `SENTRY_WEBHOOK_SECRET`. See docs/telemetry.md |
| GET | `/api/experiments/:id/:stage` | `:stage` = `spec` only | `spec.md` as `text/markdown`; 404 before the spec stage ran |

`:stage` values accepted by `POST /api/experiments/:id/:stage`: `discover`, `simulate`,
`verify`, `analyze`, `compare`, `spec`, `rebuild` (`PIPELINE_STAGES`), and `run` (all stages in order).
A stage runs any missing earlier stages first; one run per experiment at a time (per server process).

`rebuild` output is also served outside `/api` (dashboard routes, not REST): `GET /experiments/:id/rebuild`
is the dashboard page (brand, inferred goals, pages), and `GET /experiments/:id/rebuild/:slug` returns one
rebuilt page as the raw self-contained HTML document (`text/html`, `no-store`); 404 `{error}` for an unknown
experiment, no rebuild yet, or an unknown slug.

The `spec` stage's mockup is served the same way under `preview`: `GET /experiments/:id/preview/`
redirects to the mockup's index page, `GET /experiments/:id/preview/:slug` returns one mockup page as raw
self-contained HTML (`text/html`, `no-store`) — every internal link stays under that directory, and no page
fetches a third-party resource. `GET /mockups` lists experiments that have one. 404 `{error}` for an unknown
experiment, no mockup yet, or an unknown slug.

`config` is an optional `ExperimentConfig`: `seed` (1337), `maxStates` (30), `maxDepth` (3),
`trajectories` (1000), `verifyCount` (8), `viewports` (`["desktop","mobile"]`). These budgets
are per experiment; there are no env overrides. Upper bounds (`EXPERIMENT_LIMITS`): `maxStates` ≤ 50,
`maxDepth` ≤ 5, `trajectories` ≤ 5000, `verifyCount` ≤ 16, `viewports` at most 2 distinct values.
A config outside these bounds gets a 400 `{error: "invalid config", issues}`.
Stored experiments created before these bounds still load, with each budget clamped to its limit.
