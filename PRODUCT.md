# Product

<!-- impeccable:product-schema 1 -->

This record covers Rehearsal's own dashboard (`src/app/`), the tool its users operate. It does not
describe the sites Rehearsal audits or the findings Rehearsal writes about them.

## Platform

web

## Stack

Next.js 16 (App Router) + React + TypeScript. Plain CSS in `src/app/globals.css` with custom
properties; no component library or utility framework. React Flow renders the decision graph.

## Users

Product engineers, designers, and growth or UX leads who own a public website and want to know
where real visitors get stuck before they ship a change. They arrive with a URL and one goal
("can someone still register?"), run the pipeline, and read the evidence. Sessions are short and
task-driven; they come back to an experiment to compare a variant or hand the spec to whoever
builds the fix.

## Product Purpose

Rehearse a website before users do: discover its states, simulate goal-directed journeys,
verify the riskiest paths in real desktop and mobile browsers, grade findings against Krug's
rubric, apply one variant and re-verify it, then output a rebuild spec (`spec.md`). The dashboard
is where a person starts an experiment, watches the stages run, and judges whether each finding
is backed by evidence.

## Positioning

An evidence tool, not a score generator. Every claim in the UI is traceable to a browser run, a
screenshot, a simulated-journey count, or a stated hypothesis. Findings carry an evidence class
(`verified-failure`, `reproducible-concern`, `hypothesis`) so the reader always knows how much to
trust them.

## Operating Context

Desktop browser, usually beside the site under test or a code editor. Dark theme. Pages are read
in passes: first a scan for what failed and how badly, then a closer read of one finding and its
evidence. Long pipeline stages run in the background while the user stays on the page.

## Capabilities and Constraints

- Experiments run against public URLs only; loopback targets require `REHEARSAL_ALLOW_PRIVATE=1`.
- Every vendor adapter falls back to a fixture or plain implementation when its key is missing,
  so the dashboard must render complete, honest states from fixture-backed runs.
- Data is dense: a decision graph with dozens of states, a browser-run list, a dozen or more
  findings, a variant comparison, and a long markdown spec on one page.

## Brand Commitments

- One sans-serif system font stack; monospace only for URLs, IDs, and machine values.
- No decoration for its own sake: no gradients, glows, side-stripe accents, eyebrow labels, or
  ornamental icons. Color carries state (pass, fail, severity), never mood.
- Familiar layouts over novel ones: a header, a toolbar of pipeline stages, and titled panels.

## Evidence on Hand

- `tests/evals/fixtures/aie-code-2026.html`: hermetic target page used by evals, E2E, and the
  design check's experiment page.
- `docs/krug-principles.md`: the rubric the findings cite, also the canon for this dashboard's
  own clarity.
- `docs/sample-spec.md`: representative `spec.md` output rendered in the spec panel.

## Product Principles

1. **Evidence first.** Show what was observed (runs, screenshots, counts) before what is
   inferred, and label inference as such.
2. **Dense but scannable.** Many items per screen, each with severity, evidence class, and
   principle visible at a glance; prose stays at a readable measure.
3. **Don't make me think.** Name controls by what they do, keep one obvious next action, and say
   each fact once in the place it matters.
4. **Honest states.** Loading, empty, error, and partial states say exactly what happened and
   what to do next; never fake data to fill a panel.

## Accessibility & Inclusion

WCAG 2.2 AA contrast on the dark theme; no functional text below 12px; heading levels in order;
keyboard-reachable toolbar and filters; state is never conveyed by color alone (every colored
state also has a text label).
