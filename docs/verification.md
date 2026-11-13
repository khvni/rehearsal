# Verification layers

Never pay an LLM or a reviewer to check a deterministic fact. Facts go to a script;
judgment goes to an agent; irreversible or sensitive actions go to a human.

| Layer | Who | Checks | Gate |
|---|---|---|---|
| 1 — facts | `scripts/verify-facts.ts` (`npm run check:facts`) + lint/typecheck/tests/evals | Anything with one right answer derivable from the repo | `npm run check`, CI |
| 2 — judgment | Devin Review on the PR | Blast radius, design, whether a finding is real, whether docs say the right thing | PR review |
| 3 — human | The repo owner | `terraform apply`, secrets, deletes, publishing, anything irreversible | Explicit approval |

## Layer 1 — `npm run check:facts`

Runs in well under a second (no network, no browser). `--json` prints
`{ok, durationMs, checks: [{name, ok, checked, issues: [{path, message}]}]}` — no grep/tail.
Each issue carries a precise path (`file:line` or `file#json.path`).

| Check | Sources compared |
|---|---|
| `contracts` | `data/experiments/**/*.json`, `tests/fixtures/experiments/**/*.json`, `docs/runs/**/summary.json` ↔ `Experiment` / `SpecReport` / `SiteRunSummary` zod contracts. Fails on parse errors and on unknown keys the contract would silently strip. |
| `env` | `process.env.X` / `env.X` reads in `src/**` + root Next/Sentry config ↔ `.env.example` ↔ README.md + docs/ ↔ `terraform/*/variables.tf` + the `ENV = var.env` mapping in each stack. |
| `catalog` | Krug slugs (`krugPrinciple: "…"`) and `K<n>` ids in `src/lib/analysis/**` + `src/lib/intents/**` ↔ docs/krug-principles.md ↔ `KrugPrinciple` enum; `KrugDimension` ↔ the dimensions table; every stable finding rule id (`findingId: \`f_<rule>_…\``, metric `finding("<rule>", …)`) ↔ at least one reference in `tests/**`. |
| `api` | `export function GET/POST/…` in `src/app/api/**/route.ts` ↔ rows in docs/api.md (both directions); `PIPELINE_STAGES` ↔ `case`s in the stage route ↔ stage list in docs/api.md. |

### Terraform env classification

Every `.env.example` key is classified in `scripts/verify-facts.ts`; an unclassified or
stale key fails the check.

- **Deployed** (`DEPLOYED_ENV`) — each terraform stack must declare `lower_snake` and map it
  into the app env: `GEMINI_API_KEY`, `JEV_API_KEY`, `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE`,
  `SENTRY_DSN`, `DATABASE_URL`.
  - Exemption: `cloudflare` / `DATABASE_URL` — Postgres persistence is provisioned only on the
    primary DigitalOcean stack.
- **Not deployed** (`NOT_DEPLOYED`) — code defaults (`GEMINI_MODEL_*`, `JEV_BASE_URL`,
  `JEV_MODEL`, `REHEARSAL_BROWSER`, `SENTRY_TRACES_SAMPLE_RATE`), aliases (`OPENROUTER_API_KEY`,
  `TIGERDATA_URL`), optional backends not provisioned yet (`BRIGHTDATA_BROWSER_*`,
  `BROWSERBASE_*`, `STAGEHAND_MODEL*`, `SNOWFLAKE_*`), local-only (`STAGEHAND_CHROME_PATH`).
- **Never deployed** — `REHEARSAL_ALLOW_PRIVATE` (disables the SSRF guard); fails if any
  stack maps it.

### Stored fixture

`tests/fixtures/experiments/aie-code-2026.json` is a full `runAll` on
`tests/evals/fixtures/aie-code-2026.html` with fixture adapters, a counter `randomUUID`, a
fixed clock (`2026-11-13T12:00:00Z`) and a replacer that zeroes `durationMs`. Regenerate it
after changing the pipeline output shape:

```bash
npx tsx scripts/verify-facts.ts --write-fixtures   # byte-identical across runs
```

### Limits

Rule-based findings in `ruleFindings` (stale date, vague labels, nav density, missing
title, failed assertion) use random ids, so the rule-id check cannot see them; they are
covered by evals by behaviour. The env scan is regex-based: reads through a renamed
variable (`const e = process.env; e.X`) are not detected — use `process.env.X` or an
`env: EnvVars = process.env` parameter named `env`.

## Layer 2 — Devin Review

Judgment, not facts: is the change's blast radius what the PR says, are findings
evidence-backed, does the spec follow from the findings, is a new allowlist entry in
`verify-facts.ts` justified. Reviewers should not re-check anything Layer 1 already proves.

## Layer 3 — human

Agents propose, humans apply: `terraform apply`/`destroy`, creating or rotating secrets,
deleting stored experiments or data, deploying to production, and anything else that
cannot be undone with a revert.
