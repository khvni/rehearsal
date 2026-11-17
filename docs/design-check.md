# Design check (Impeccable)

The design check runs [Impeccable](https://impeccable.style/docs)'s deterministic anti-pattern
detector against **Rehearsal's dashboard** (`src/app/`) and **generated wireframes** (`/rb/`).
It catches generic, AI-generated design patterns in the interfaces we produce.

**Scope.** This guards our own output. It never scans original audited sites, and nothing it
reports becomes a visitor-usability finding or appears in
`spec.md`. Rehearsal's own output is about visitor journeys and is graded against
`docs/krug-principles.md` (the internal rubric canon).

## What is checked

| Pass | Where | Rules | Blocking |
| --- | --- | --- | --- |
| Static | `src/app/**` source (`.tsx`, `.ts`, `.css`) | pattern rules that read source: side-stripe borders, gradient text, overused fonts, bounce easing, and similar | yes |
| Rendered | `/` and a fixture-run `/experiments/<id>` | everything above plus rules that need layout: contrast, text below 12px, line length, heading order, nested cards, repeated labels | yes |
| Generated wireframes | Synthetic directory, comparison/disclosure, reading page and deterministic fallback | Actual Impeccable CLI, static or rendered at desktop and mobile sizes | yes |
| Every generated page | Rebuild agent prompts + Worker-safe HTML guard | Eyebrows, gradient text, nested cards, repeated CTA bands, missing/duplicate h1, fake controls, excessive link dumps and rebuild containment | retry once, then deterministic wireframe fallback |

`npx impeccable detect --list-rules` prints the full rule catalog. `PRODUCT.md` at the repo root
records the dashboard's users, purpose, and design commitments; Impeccable's skill reads it as
context when an agent designs or critiques the UI.

Exit codes: `0` clean, `2` findings, `1` the target could not be scanned. Advisory findings
(for example a borderline contrast pair) are printed but do not fail the run.

## Running it locally

```sh
npm run design:check            # static scan of src/app; fails on findings
npm run design:check:rebuild    # generate synthetic wireframes and scan their HTML/CSS
npm run design:check:rebuild -- --rendered # actual output at 1280px and 390px
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
`src/components/**`, `src/lib/rebuild/**`, the wireframe check script, `PRODUCT.md`, or the Impeccable config.

- **static**: `detect --github src/app`, which prints findings as PR annotations. Blocking.
- **rendered**: builds and starts the app, scans `/`, then serves the fixture on loopback, runs a
  full experiment through the API, and scans its page with Playwright's Chromium. Both scans are
  blocking. If the fixture experiment itself fails to complete, the experiment-page scan is skipped
  with a `::notice` instead of failing: pipeline health is `ci.yml`'s job, and a broken pipeline
  should not show up as a design failure.
- The rendered job first builds four synthetic wireframe documents through the real rebuild
  builder and shell, then runs Impeccable over each at desktop and mobile sizes. This requires
  no server, paid model, Browserbase session or external site. Failure to scan is a failure.

## Rebuild agent default

The planner and implementer both receive Impeccable's slop checklist by default, alongside
Krug, emil-design-eng, make-interfaces-feel-better and shadcn semantics. The theme is fixed in
code, not chosen by the model. Before a generated page is saved, a Worker-safe structural check
retries flagged output once, then falls back instead of publishing the least-bad attempt.

The Impeccable binary cannot execute inside a Cloudflare Worker. The runtime guard is a focused,
deterministic subset, not a claim to run the full CLI per live generation. CI and local review
use the actual CLI on generated output; rendered checks cover the shared CSS and representative
layouts, not every possible future LLM response. For a particular live proposal, pass its
`/experiments/<id>/rb/` URL to the launcher for a full rendered review.

See [Wireframe system](rebuild-wireframes.md) for the output language and its boundaries.

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
