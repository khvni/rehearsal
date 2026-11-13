# Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Dashboard (Next.js App Router)                                   │
│  page.tsx — URL + goal input                                     │
│  experiments/[id] — React Flow graph, evidence, findings, spec   │
└───────────────┬──────────────────────────────────────────────────┘
                │ REST
┌───────────────▼──────────────────────────────────────────────────┐
│ /api/experiments[/:id/:stage]  →  Orchestrator (PIPELINE_STAGES) │
└──┬──────┬──────┬──────┬──────┬──────┬────────────────────────────┘
   │      │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼      ▼
 fetch  browser graph decisions simulation analysis variants storage
   │      │      │      │      │      │      │       │
   │      │      │      │      │      │      │       ├─ JsonFileStore (default)
   │      │      │      │      │      │      │       ├─ TigerDataStore (DATABASE_URL)
   │      │      │      │      │      │      │       └─ SnowflakeCortex (KB search)
   │      │      │      │      │      │      └─ DomPatch → addInitScript
   │      │      │      │      │      ├─ GeminiClient (hydrogen/argon) | FixtureLlmClient
   │      │      │      │      │      ├─ rubric.ts (Krug dimensions)
   │      │      │      │      │      └─ spec.ts → spec.md
   │      │      │      │      └─ mulberry32 seeded sampler, profiles, risk rank
   │      │      │      └─ JevClient (OpenRouter decisions) | FixtureJevClient
   │      │      └─ stateHash dedup, adjacency
   │      └─ PlaywrightRunner: local chromium | Bright Data CDP (BRIGHTDATA_BROWSER_WS)
   └─ BrightDataFetcher (BRIGHTDATA_API_KEY+ZONE) | PlainFetcher + SSRF guards + politeness

telemetry: Sentry (SENTRY_DSN) + data/events/*.jsonl
```

## Data flow

1. **discover**: fetch → render → extract actions → `GraphBuilder` dedups by `stateHash`
   (normalized URL + viewport + action signature + modal flag). Budget: 30 states / depth 3.
2. **simulate**: `scoreActions` asks Jev `choice` (best action per state) + `score` (ambiguity);
   weights → `simulateTrajectories` samples ≤1000 seeded paths across 3 behavioral profiles.
3. **verify**: `selectTrajectories` picks the riskiest ~8 (+always a goal-reached path if any);
   `runTrajectory` executes them in desktop (and mobile for the top path), checking assertions.
4. **analyze**: `ruleFindings` (always-on: stale dates + apply CTA, vague labels, nav density,
   missing identity, failed assertions) + `llmFindings` (gemini-4-argon, rubric-grounded JSON).
5. **compare**: variant (DomPatch set) applied via `addInitScript` in a fresh context;
   same assertions re-run; deltas recorded.
6. **spec**: `generateSpec` merges findings → ordered changes + rebuild phases → `spec.md`.

## Why adapters

Every external system sits behind an interface selected by env vars. Keys absent ⇒
fixture/plain implementation. The demo can never die because a key is missing, and evals
run hermetically in CI.
