# Design check (Impeccable)

The design check runs [Impeccable](https://impeccable.style/docs)'s deterministic anti-pattern
detector against **Rehearsal's own dashboard** (`src/app/`). It catches generic, AI-generated
design tells in our UI before they merge.

**Scope.** This guards the dashboard we build. It is not part of Rehearsal's pipeline: it never
scans the sites Rehearsal audits, and nothing it reports becomes a Rehearsal finding or appears in
`spec.md`. Rehearsal's own output is about visitor journeys and is graded against
`docs/krug-principles.md`.

## What is checked

| Pass | Where | Rules | Blocking |
| --- | --- | --- | --- |
| Static | `src/app/**` source (`.tsx`, `.ts`, `.css`) | pattern rules that read source: side-stripe borders, gradient text, overused fonts, bounce easing, and similar | yes |
| Rendered | `/` and a fixture-run `/experiments/<id>` | everything above plus rules that need layout: contrast, text below 12px, line length, heading order, nested cards, repeated labels | yes |

`npx impeccable detect --list-rules` prints the full rule catalog. `PRODUCT.md` at the repo root
records the dashboard's users, purpose, and design commitments; Impeccable's skill reads it as
context when an agent designs or critiques the UI.

Exit codes: `0` clean, `2` findings, `1` the target could not be scanned. Advisory findings
(for example a borderline contrast pair) are printed but do not fail the run.

## Running it locally

```sh
npm run design:check            # static scan of src/app; fails on findings
```

Rendered scan, with the dashboard running:

```sh
npm run dev
sh .devin/skills/impeccable/scripts/impeccable detect http://localhost:3000/
```

For an experiment page, serve the hermetic fixture and run it through the API (the same steps CI
runs):

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory tests/evals/fixtures &
REHEARSAL_ALLOW_PRIVATE=1 npm run dev
curl -s -XPOST localhost:3000/api/experiments -H 'content-type: application/json' \
  -d '{"targetUrl":"http://127.0.0.1:8765/aie-code-2026.html","goal":"Can someone register?"}'
curl -s -XPOST localhost:3000/api/experiments/<id>/run > /dev/null
sh .devin/skills/impeccable/scripts/impeccable detect http://localhost:3000/experiments/<id>
```

The rendered scan needs Chrome, Chromium, or Edge. Point it at Playwright's Chromium with
`IMPECCABLE_BROWSER="$(node -p "require('playwright').chromium.executablePath()")"`.

The launcher at `.devin/skills/impeccable/scripts/impeccable` runs a pinned engine. The binary is
gitignored; on first run the launcher downloads it to `~/.impeccable/bin/<version>/` and verifies
it against `scripts/engine-checksums.txt`. Set `IMPECCABLE_BIN` to use a preinstalled engine.

## CI

`.github/workflows/design-check.yml` runs on pull requests that touch `src/app/**`,
`src/components/**`, `PRODUCT.md`, or the Impeccable config.

- **static**: `detect --github src/app`, which prints findings as PR annotations. Blocking.
- **rendered**: builds and starts the app, scans `/`, then serves the fixture on loopback, runs a
  full experiment through the API, and scans its page with Playwright's Chromium. Both scans are
  blocking. If the fixture experiment itself fails to complete, the experiment-page scan is skipped
  with a `::notice` instead of failing: pipeline health is `ci.yml`'s job, and a broken pipeline
  should not show up as a design failure.

## Fixing a finding

Fix the UI. Each finding names the rule and why it hurts; most fixes are a CSS or markup change
(remove the side stripe, raise text to 12px, order headings, cap the measure). Re-run the scan to
confirm.

## Adding an ignore

An ignore is acceptable only when the flagged pattern is a deliberate, defensible choice that a
reviewer would accept from one sentence, for example a licensed brand font, or a third-party
embed we do not control. It is never acceptable to silence a rule because the fix is inconvenient,
and never acceptable to ignore a whole rule or a whole file to make CI pass.

Ignore a specific value, always with a reason:

```sh
sh .devin/skills/impeccable/scripts/impeccable ignores add-value overused-font Inter \
  --reason "Brand font licensed for the marketing site; dashboard inherits it"
```

This writes `.impeccable/config.json`, which is committed and reviewed with the change. Use
`.impeccable/config.local.json` (gitignored) only for personal experiments, never
to get a PR green. `sh .devin/skills/impeccable/scripts/impeccable ignores list` shows what is
ignored and why.

There are currently no ignores.
