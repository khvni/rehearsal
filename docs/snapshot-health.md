# Snapshot health: hourly hermetic rebuild + agent first responder

Every hour, `main` is rebuilt from scratch on a clean runner. If it breaks, a Devin
Automation picks up the failure, fixes it on a branch, and opens a PR.

## What runs hourly

Workflow: `.github/workflows/snapshot-health.yml`, cron `7 * * * *` (UTC), fresh `ubuntu-latest`, no caches.

| Step | Command |
| --- | --- |
| Install | `npm ci` (Node 22) |
| Browser | `npx playwright install --with-deps chromium` |
| Gate | `npm run check` (lint, typecheck, unit, evals, skill-sync) |
| E2E | `npm run test:e2e` (hermetic fixture server) |
| Build | `npm run build` |
| Pipeline smoke | `npx tsx scripts/snapshot-health.ts` |

The pipeline smoke serves `tests/evals/fixtures/aie-code-2026.html` on `127.0.0.1` and runs every
`PIPELINE_STAGES` stage (discover → spec) through the real `Orchestrator` with local Playwright and
the keyless fixture adapters, at tiny budgets (desktop only, 3 states, depth 1, 50 trajectories,
1 verify). It fails if discover finds no states, the experiment doesn't reach `complete` with a spec,
or any stage records an error. No external network, no API keys.

The job summary shows a per-step result + duration table, plus per-stage pipeline timings.

## What happens on red

Only runs of `main` (schedule or manual dispatch) touch issues; PR and branch runs only write the summary.

- **Red:** opens a single issue **"Snapshot health: main is red"** labelled `first-responder`, with the
  failing step, commit, and a deep link to the failing step's log. If that issue is already open, it
  adds a comment for the new failure instead (one issue, deduped by title).
- **Green:** comments on and closes any open issue with that title.

### First responder (Devin Automation)

Automation **"Rehearsal snapshot-health first responder"** in the Devin org (run as the org service user):

- **Trigger:** `github:issues` on `khvni/rehearsal` where (`action = opened` and the issue has label
  `first-responder`) or (`action = labeled` and `label.name = first-responder`). The final response is
  posted back as an issue comment.
- **Concurrency:** 1 run at a time, queue depth 1.
- **Network:** git-manager.devin.ai, api.github.com, github.com, objects.githubusercontent.com,
  registry.npmjs.org, nodejs.org, cdn.playwright.dev, playwright.download.prss.microsoft.com.
- **Email:** on dispatch failure.
- **Prompt (summary):** read the issue and the failing log (`gh run view <id> --log-failed`); set up
  Node 22 + `npm ci` + Chromium; reproduce the failing step on `main`; if it doesn't reproduce
  (flake / already fixed), comment and re-dispatch the workflow; otherwise fix the root cause on
  `devin/<ts>-snapshot-fix` without weakening tests, run the full gate, open a PR with
  `Fixes #<issue>`, and link it on the issue. Never merge.

Re-arming: if the first responder's PR is still open and `main` stays red, the hourly run just
comments on the same issue. To re-trigger the agent, remove and re-add the `first-responder` label.

## Run it manually

- GitHub UI: Actions → **snapshot-health** → *Run workflow* (pick `main` to exercise issue handling).
- CLI: `gh workflow run snapshot-health.yml -R khvni/rehearsal --ref main`
- Locally (same steps, no issue handling):

  ```bash
  export PATH=$HOME/.local/node/bin:$PATH
  npm ci && npx playwright install chromium
  npm run check && npm run test:e2e && npm run build && npx tsx scripts/snapshot-health.ts
  ```

The workflow also runs on PRs that change it or `scripts/snapshot-health.ts`.
