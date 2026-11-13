# Telemetry: Sentry → GitHub → Devin first responder

Forward pressure (agents shipping PRs) is balanced by back pressure from production: every
unhandled pipeline error lands in Sentry, Sentry calls `POST /api/hooks/sentry`, and that files a
GitHub issue the Devin first responder owns end to end (reproduce → fix → PR → regression eval).
The agent gets a job with a KPI, not a ticket.

```
pipeline stage ── span + captureException {stage, experimentId, targetHost}
      │
   Sentry issue alert rule ──► internal integration webhook (Sentry-Hook-Signature)
      │
POST /api/hooks/sentry ──► GitHub issue in khvni/rehearsal, labels first-responder + sentry,
      │                     body starts with <!-- sentry-issue:<id> --> (repeats update, not duplicate)
      ▼
Devin Automation (factory/automations.yaml `sentry-first-responder`) ──► PR "Fixes #N" + eval
```

## What is instrumented

`src/lib/telemetry/index.ts`, all no-ops without `SENTRY_DSN` (the JSONL log under
`data/events/` is always written):

| Signal | Where | Sentry |
|---|---|---|
| Stage span | `withTrace` around every `PIPELINE_STAGES` stage | span `rehearsal.<stage>`, op `rehearsal.stage`, attributes `stage`, `experimentId`, `targetHost` |
| Stage exception | `withTrace` catch (incl. robots.txt-blocked targets) | `captureException`, level `error`, tags `stage`, `experimentId`, `targetHost` |
| Page failure | `discover` per-page catch (timeouts, unlocker/browser blocks) | `captureException`, level `warning`, same tags + `url`/`depth`/`viewport` extras |
| Route/server error | `src/instrumentation.ts` `onRequestError` | `captureRequestError` (SDK v10) |

Not captured: SSRF rejections from `assertPublicUrl` at `POST /api/experiments` (input
validation, returned as 400 before an experiment exists). The SDK is initialized lazily once
(`getSentry`), from `register()` under `next start`/`next dev` and on first use in scripts.

## The KPI the agent owns

1. **Zero unhandled stage exceptions per 24h** on the corpus sweep (the nightly corpus audit and
   the hourly snapshot-health pipeline smoke). Measured in Sentry as error-level events with a
   `stage` tag.
2. **Sweep p95 stage duration** stays within budget: Sentry Insights → Traces, filter
   `span.op:rehearsal.stage`, group by `stage`, p95(`span.duration`). The same numbers are in
   `data/events/*.jsonl` (`kind: "ok"`, `durationMs`) for offline checks.

Warning-level page failures are signal for the spec (blocked or broken target pages), not KPI
breaches; alert only on level `error`.

## Set it up

1. **Sentry project:** set `SENTRY_DSN` (and optionally `SENTRY_TRACES_SAMPLE_RATE`) on the server.
2. **Internal integration:** Sentry → Settings → Developer Settings → *Custom Integrations* →
   *Create New Integration* → *Internal Integration*.
   - Webhook URL: `https://<deployment>/api/hooks/sentry`
   - Enable **Alert Rule Action** (issue alerts call it with `Sentry-Hook-Resource: event_alert`).
   - Optionally subscribe to **Issue** webhooks too (`issue` resource: `created`, and `unresolved`
     with substatus `regressed`/`escalating` are filed; others are acknowledged and ignored).
   - Permissions: Issue & Event → Read.
   - Copy the **Client Secret** into `SENTRY_WEBHOOK_SECRET`. The route verifies
     `Sentry-Hook-Signature` = hex HMAC-SHA256 of the raw body with it (401 otherwise, 503 when unset).
3. **Alert rule:** Alerts → Create Alert → Issues → *A new issue is created* or *The issue changes
   state from resolved to unresolved*, filter `level:error`, action **Send a notification via
   <your integration>**.
4. **GitHub:** set `GITHUB_TOKEN` (fine-grained, khvni/rehearsal, Issues: read/write). Without it
   the route verifies and logs a notice but files nothing.
5. **Devin Automation:** create `sentry-first-responder` from `factory/automations.yaml`. It shares
   the `first-responder` label with the snapshot-health responder (docs/snapshot-health.md); require
   the `sentry` label too so each Automation gets its own issues. Give it the Sentry MCP
   (`https://mcp.sentry.dev/mcp`) so it can pull the event, stack trace, and tags.

### Issue lifecycle

- New Sentry issue → new GitHub issue `Sentry: <title>` with the Sentry issue URL, latest event,
  culprit, level, project, and a tag table.
- Same Sentry issue fires again → the issue body is refreshed and a comment is added.
- Fires again after the GitHub issue was closed (regression) → reopened, and `first-responder` is
  removed and re-added so the Automation's `labeled` trigger runs again.

Test it without Sentry: `npx vitest run tests/unit/sentry-hook.test.ts` (signature check, payload
parsing, issue upsert against a mocked GitHub API).

## Tiger Data

`src/lib/storage` has a Postgres path (`TigerDataStore`, active with `TIGERDATA_URL` /
`DATABASE_URL`). A natural next step is a Timescale hypertable of stage timings from the event log
so the p95 KPI can be tracked over months next to the experiments; not implemented here.
