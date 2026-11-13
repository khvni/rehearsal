# Demo script (~60s)

**Open (15s):** "We build websites on guesses about what people will do, and learn
we were wrong when users get stuck. Rehearsal tries the site first."

**Run (~35s):**

1. Paste `https://ai.engineer/code/2026` with the goal *"Determine whether someone can
   still register for the November 10–12 conference."* Click Rehearse.
2. `discover`: the graph fills in. Each node is a unique page state; each edge is an action.
3. `simulate`: Jev scores every action; 1,000 seeded journeys run as goal-directed,
   impatient and exploratory visitors. The riskiest paths light up.
4. `verify`: Playwright replays them on desktop and mobile, with assertions and screenshots.
5. `analyze`: the verified finding. **The page still says "application-only" and shows an
   Apply button for an event that ended Nov 12** (stale copy, `omit-words`).
6. `compare`: a fix ("event concluded, watch recordings") runs in an isolated browser
   against the same assertions. The differences are shown.
7. `spec`: open `spec.md`. Each change cites a finding, evidence, a Krug principle and
   an effort size. A phased rebuild plan follows.

**Close (10s):** "AI made building cheap. Rehearsal makes checking cheap too. Don't
just build it. Rehearse it."

## Fallbacks

- No API keys: the pipeline runs on fixture adapters and gives the same result.
- Live site down at the venue: serve `tests/evals/fixtures/aie-code-2026.html` locally
  with `REHEARSAL_ALLOW_PRIVATE=1`.
- Recorded backup: `npm run test:e2e` output plus the experiment's evidence screenshots.
