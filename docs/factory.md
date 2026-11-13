# Factory as code

Everything that configures how agents work on this repo lives in `factory/`,
is versioned with the code, and changes only through a PR. Agents can open PRs
against the factory the same way they open PRs against `src/`.

## What lives in `factory/`

| File | What it defines | Applied by |
| --- | --- | --- |
| `branch-protection.json` | GitHub repository ruleset for `main`: PRs required, squash-only, linear history, no force-push or deletion, required checks `check` + `terraform`, zero required approvals (solo owner + agents). The file is the exact request body for the rulesets API. | `npm run factory:sync -- --apply` |
| `review-policy.json` | Review triage: `bug` and `security` findings block merge; `code_quality` and `style` don't. After `max_review_rounds` (2) the PR goes to the orchestrator instead of another fix round. | Agents read it; `factory:check` validates it |
| `automations.yaml` | Intended Devin automations (`nightly-corpus-audit`, `hourly-snapshot-health`, `weekly-factory-report`): trigger, schedule, prompt. | Spec only; the live automations mirror it |
| `blueprint.yaml` | Devin environment blueprint (Node 22 at `~/.local/node`, `npm install`, Playwright Chromium). | Spec only; the repo blueprint in Devin settings mirrors it |

`Devin Review` isn't a required check: it posts PR comments, not a GitHub check
run, so the ruleset can't require it. `review-policy.json` covers it instead.

## Changing the factory

1. Edit the file in `factory/` on a branch and open a PR (template:
   `.github/pull_request_template.md`).
2. The `factory-check` workflow validates the files and diffs the ruleset
   against the live one. On a PR, drift is a warning, since the PR is the
   proposed change. It never fails because of missing permissions.
3. After merge, apply it (below). On `main`, `factory-check` fails until the
   live ruleset matches.

For `automations.yaml` and `blueprint.yaml`, update the Devin automation or
blueprint to match after the PR merges.

## Applying

```sh
npm run factory:check            # validate + diff against live (exit 1 on drift)
npm run factory:sync -- --apply  # create or update the ruleset (needs repo admin)
```

`--apply` uses the authenticated `gh` CLI. Without admin scope it exits 2 and
prints the exact `gh api` commands for the owner to run:

```sh
id=$(gh api --paginate "repos/khvni/rehearsal/rulesets?includes_parents=false&per_page=100" --jq '.[] | select(.name=="main-protection") | .id')
if [ -n "$id" ]; then
  gh api --method PUT "repos/khvni/rehearsal/rulesets/$id" --input factory/branch-protection.json
else
  gh api --method POST "repos/khvni/rehearsal/rulesets" --input factory/branch-protection.json
fi
```

## Ownership

`.github/CODEOWNERS` assigns everything to `@khvni` and calls out
`src/lib/contracts/`. Code-owner review isn't required by the ruleset;
CODEOWNERS just auto-requests the owner on those PRs.
