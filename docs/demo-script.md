# Demo script (~60s)

**Open (15s):** "We ship websites based on assumptions about what people will do. We only
find the problems after users hit them. Rehearsal rehearses the site first."

**Run (~35s):**

1. Paste `https://ai.engineer/code/2026`; goal: *"Determine whether someone can still
   register for the November 10–12 conference."* → Rehearse.
2. `discover` — decision graph fills in (states = deduped pages, edges = actions).
3. `simulate` — Jev scores every action; 1,000 seeded journeys across goal-directed /
   impatient / exploratory profiles; riskiest paths highlighted.
4. `verify` — real Playwright runs, desktop + mobile, with assertions and screenshots.
5. `analyze` — the verified finding: **page still says "application-only" and shows an
   Apply CTA for an event that ended Nov 12** (stale copy — `omit-words`).
6. `compare` — variant applied in an isolated context ("event concluded → watch
   recordings" notice); same assertions re-run; deltas shown.
7. `spec` — open `spec.md`: ordered change list (each traced to a finding, evidence,
   Krug principle, effort) + phased rebuild plan.

**Close (10s):** "AI made building cheap. Rehearsal makes verifying systematic — before
anyone ships. Don't just build it. Rehearse it."

## Fallbacks

- No API keys → the whole pipeline still runs on fixture adapters; results identical.
- Live site unreachable in the venue → `tests/evals/fixtures/aie-code-2026.html` +
  `REHEARSAL_ALLOW_PRIVATE=1` + a local static server reproduce the run hermetically.
- Recorded backup: `npm run test:e2e` evidence + the experiment's data/evidence shots.
