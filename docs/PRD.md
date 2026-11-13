# Rehearsal — Product Requirements Document

**Version:** 2.0 — revised for build
**Date:** November 13, 2026
**Status:** Supersedes PRD v1.0 (hackathon draft). Implementation target.
**Demo target:** https://ai.engineer/code/2026
**Primary output:** a verifiable **spec of changes** — every fix the target site needs, plus a rebuild plan for a better version.

---

## 0. What changed from v1.0, and why

v1.0 was a strong draft. This revision fixes its real problems:

| # | v1.0 issue | v2.0 change |
|---|-----------|-------------|
| 1 | No final deliverable defined. The demo is "show a graph and a comparison." | **SpecReport is a first-class artifact.** Every run ends in `spec.md`: a prioritized change list (each change traced to a finding + evidence + Krug principle) and a phased rebuild plan. That spec *is* the demo output. |
| 2 | 12 P0 requirements, 3 demo scenarios, 5 agents, ~3 hours. Over-scoped; the riskiest items (variant loop) sit at the end of the chain. | Re-ranked: **one objective, fully closed loop** (discover → simulate → verify → find → fix → re-verify → spec) beats three half-done scenarios. Scenario B (stale post-event registration CTA) is the lead demo finding because it is real, verifiable, and needs no traffic. |
| 3 | LLM calls undefined; "Gemini" unspecified. | Two models, two jobs: `gemini-4-hydrogen` for cheap structured calls (objective→criteria, labeling, classification); `gemini-4-argon` for findings, recommendations, and the SpecReport. All behind an `LlmClient` adapter; evals run on recorded fixtures offline. |
| 4 | "System One API" assumed as a direct endpoint. | Jev is reached via OpenRouter `POST /api/alpha/decisions` (model `typesafe/jev-1.13`) or any System One-compatible base URL (`typesafe_sdk` on Python services). `JevClient` takes `JEV_BASE_URL` + `JEV_API_KEY`; `FixtureJevClient` supplies deterministic typed answers for evals and offline dev. |
| 5 | "State dedup by meaningful DOM structure" — underspecified, non-reproducible. | `stateHash = sha1(normalizedUrl | viewport | role/text signature | modal flag)`. Signature = sorted set of (role, normalized label) pairs for visible actions. Deterministic and testable. |
| 6 | No engineering-practice section despite "software factory" claims. | New §9: **evals suite, contract tests, CI gates, agent-skill sync check.** `tests/evals` runs golden fixtures with thresholds and fails the build below them. A `check-skill-sync` gate fails if pipeline stages or eval cases land without matching test docs. |
| 7 | Deployment hand-waved ("DO or another host"). | Terraform is the deploy interface. `terraform/digitalocean` (App Platform — the demo host) and `terraform/cloudflare` (Workers/Pages — alternate target). CI validates both. |
| 8 | Bright Data scoped only to "remote browser." | Bright Data is the **scraping layer**: Web Unlocker-style page fetch + remote browser (CDP) for rendered states. Local Playwright + `fetch` remain the fallback path; selection is env-driven. |
| 9 | Sentry/Tiger Data were P1/P2. | They're in the skeleton now as **adapters that no-op without keys** — instrumentation exists from commit one, activates when keys arrive. |
| 10 | Variant safety was implied. | Variants apply **only** through `page.route` HTML rewriting + `addStyleTag`/init-script DOM patches inside a fresh Playwright context. Never the live site. Reproducibility asserted by running the patch twice. |
| 11 | Missing politeness/ToS posture for scraping a third-party site. | Explicit: public pages only, ≤1 req/2s to the target host, honor `robots.txt` disallow on the target path set, no auth bypass, no form submission. |
| 12 | Simulated trajectories (500–1000) presented as self-evident value. | Reframed: trajectories are cheap hypotheses whose only job is to **rank which browser runs are worth paying for**. Demo shows the delta between "simulated guess" and "verified reality." |
| 13 | Krug was a vibes-level citation. | `docs/krug-principles.md` distills *Don't Make Me Think, Revisited* into a 9-dimension eval rubric; every finding cites the principle it violates. The analysis prompt embeds the rubric verbatim. |
| 14 | Snowflake "if possible." | Optional `SnowflakeCortex` adapter (Cortex Search REST) exists for knowledge-base queries over past findings. Off without creds; Tiger Data stays the system of record. |

## 1. Product thesis

Software should be rehearsed before it is released. Every interactive interface contains decisions; every decision is a chance for confusion, abandonment, or failure. Rehearsal makes those decisions visible, testable, and improvable — and its final artifact is a **spec**: what to fix, why (in Krug's terms), and how to rebuild.

**Pitch:** Rehearsal simulates user journeys, verifies the interesting ones in real browsers, and hands you a rebuild spec for a better version.

## 2. Grounding: Don't Make Me Think, Revisited

The agent's design judgment is grounded in Steve Krug's principles (full rubric: `docs/krug-principles.md`):

1. **Don't make me think** — every avoidable question mark over a link, label, or layout is a defect.
2. **Design for scanning, not reading** — users glance; hierarchy and visual noise decide what gets seen.
3. **Conventions are your friends** — invent only when the novel is clearly better.
4. **Mindless choices > hard choices** — each click should be obvious; confidence per click beats click count.
5. **Omit needless words** — half the words, then half again.
6. **Street signs & breadcrumbs** — persistent nav, page names, "you are here" markers; the **trunk test**: from any page you can instantly name the site, page, section, local nav, and search.
7. **The homepage is constrained waterfront property** — it must answer the four questions (what is this, what do they have, what can I do, why here) in one glance.
8. **Farmers and cowmen** — pull (searchers) vs. browse (scanners); nav must serve both.
9. **Usability testing beats arguing** — test early, test often, cheap tests on few users; hence Rehearsal.

Severity in findings maps to Krug's "usability problems are serious when they persist across users, pages, and block the goal."

## 3. Demo scenario (lead)

**Target:** https://ai.engineer/code/2026 — a public Next.js conference page (fetched: title "AI Engineer Code Summit 2026 … Nov 10-12, San Francisco"; description still says *"application-only"* for an event that **already happened Nov 10–12**).

**Objective (Scenario B — lead):** "Determine whether someone can still register for the November 10–12 conference."
- The site still shows application-oriented messaging after the event dates passed → **verifiable content inconsistency** (assertions over visible text + dates). No simulated-human claims needed.
- Variant: post-event CTA ("Join the waitlist for next year" / "Watch recordings") applied via DOM patch; re-run the same assertions; compare.

**Supporting (Scenario A):** "Find the conference schedule and a specific session's time/location." `sessions.json` (if present) provides a factual oracle for assertions.

**Stretch (Scenario C):** Scenario A on a mobile viewport.

**Demo flow:** URL → decision graph → simulated trajectories → verified stale-CTA finding → DOM-patched variant → re-verified → **spec.md with all changes + rebuild plan**.

## 4. Requirements

### P0 — the closed loop

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-01 | URL ingestion | Public http(s) URL loads in Playwright; SSRF guards enforced |
| FR-02 | Content + element discovery | Bright Data fetch (or fetch fallback) pulls full page HTML; extractor emits links, buttons, forms, headings, visible text |
| FR-03 | State graph | Directed graph of deduplicated states (deterministic `stateHash`), cap 30 states / depth 3 |
| FR-04 | Objective → criteria | Natural-language goal compiled to machine-checkable assertions via `gemini-4-hydrogen` (fixture fallback) |
| FR-05 | Jev decisions | Typed `choice`/`score` questions rank candidate actions; outputs map to known `actionId`s; invalid rejected |
| FR-06 | Simulation | ≥500 seeded trajectories, bit-for-bit reproducible per seed |
| FR-07 | Browser verification | ≥6 selected trajectories executed; actions, errors, screenshots captured |
| FR-08 | Responsive | ≥1 objective run on desktop (1440×900) + mobile (390×844) |
| FR-09 | Evidence store | Screenshots, traces, assertions, errors persisted under `data/experiments/` |
| FR-10 | Findings | Structured findings, each classified `verified-failure | reproducible-concern | hypothesis` and citing a Krug dimension |
| FR-11 | Variant + comparison | ≥1 DOM-patched variant re-verified; baseline-vs-variant deltas computed |
| FR-12 | **SpecReport** | `spec.md`: ordered change list (fix → finding → evidence → Krug principle → effort) + phased rebuild plan via `gemini-4-argon` |
| FR-13 | Dashboard | Graph view, evidence viewer, findings by severity, comparison, spec download |

### P1

- Sentry init (DSN-gated) + Session Replay on the dashboard.
- Tiger Data (Postgres/TimescaleDB) persistence adapter behind `DATABASE_URL`.
- Bright Data remote browser (CDP) replacing local Chromium when `BRIGHTDATA_BROWSER_WS` set.
- Public deploy to DigitalOcean via Terraform.
- Markdown/JSON report export.

### P2 — stretch

- Snowflake Cortex Search over past findings (`SNOWFLAKE_*` envs).
- DO worker droplet for distributed verification.
- Auto PR generation. Multi-variant runs. Real-session calibration.

### Out of scope

Unchanged from v1.0: no human-conversion claims, no authenticated-app traversal, no live-site modification, no a11y certification, no load testing.

## 5. Architecture

Single Next.js (App Router) + TypeScript app; long work runs in-process behind `Orchestrator` returning run IDs for polling. Browsers run where the process runs (local/CI/DO worker).

```
src/lib/
  contracts/   zod schemas: Experiment, SiteState, ActionNode, Trajectory,
               BrowserRun, Finding, Variant, DomPatch, Comparison, SpecReport
  fetch/       BrightDataFetcher (+ plain-fetch fallback), politeness + SSRF guards
  browser/     PlaywrightRunner (local | BrightData CDP), discovery, evidence
  graph/       state graph, dedup hash, traversal helpers
  decisions/   JevClient (System One: choice/noul/score) + FixtureJevClient
  simulation/  mulberry32 seeded sampler, behavioral profiles, branch scoring
  analysis/    GeminiClient (hydrogen|argon), Krug rubric, SpecGenerator
  variants/    DomPatch compiler + Playwright application
  storage/     ExperimentStore: JsonFileStore | TigerDataStore; SnowflakeCortex KB
  telemetry/   Sentry init + withTrace(); event log
src/app/api/experiments/[...]  create, discover, simulate, verify, analyze,
                               variants, compare, spec, GET state
src/components/  GraphView (@xyflow/react), EvidencePanel, FindingsPanel,
                 ComparePanel, SpecView
tests/{unit,evals,e2e}   evals = golden fixtures + thresholds (CI gate)
terraform/{cloudflare,digitalocean}
docs/{PRD.md, krug-principles.md, architecture.md, demo-script.md}
```

Pipeline (same order as v1.0 §8): `POST /api/experiments` → discover → graph → Jev score → simulate → select → Playwright verify → findings → Gemini propose → variant → re-verify → compare → **spec**.

## 6. Contracts (abridged — full schemas in `src/lib/contracts`)

- `SiteState`: `stateId, url, viewport, pageTitle, visibleText(truncated), actions[], screenshotPath?, stateHash, metadata?`
- `ActionNode`: `actionId, stateId, type(click|fill|select|navigate|scroll|back), label, role?, locator?, destinationStateId?, enabled, safeToExecute`
- `Finding`: `findingId, title, category, severity(critical|high|medium|low), evidenceType, description, affectedStates[], evidencePaths[], recommendation, verificationStatus, krugPrinciple`
- `DomPatch`: `op(replaceText|relabel|setStyle|setAttribute|insertNotice|reorder), selector, value`
- `SpecChange`: `rank, title, findingId?, krugPrinciple, change, rationale, effort(S|M|L), evidencePaths[]`
- `SpecReport`: `targetUrl, generatedAt, baselineRunIds[], changes[], rebuildPhases[{name, items[], goal}]`

## 7. Jev integration (System One)

Request: `POST {JEV_BASE_URL}` (`https://openrouter.ai/api/alpha/decisions` by default), model `typesafe/jev-1.13`.
Per state: one `choice` question (which action best advances the goal, criteria = action labels) + one `score` question (state ambiguity rubric). Outputs → transition weights; cached per `stateHash` so ≤30 model calls per experiment. `FixtureJevClient` answers deterministically from label↔goal token overlap — powers all evals offline.

## 8. Simulation

`mulberry32(seed)` RNG; three profiles (`goal-directed | impatient | exploratory`) reweight Jev scores; sample ≤1000 trajectories; stop on goal-check / terminal / repeat-limit / depth. Rank by risk (failure, ambiguity, backtracks, disagreement across profiles, unvisited actions). Execute top ~6–12 in Playwright.

## 9. Engineering practices (the part the demo judges can't see, so it must be airtight)

- **Contracts everywhere** — every module boundary is a zod-validated schema; contract conformance tests in `tests/unit`.
- **Evals as a CI gate** — `npm run eval` runs golden-fixture cases with thresholds in `tests/evals/evals.config.json` (determinism, rubric coverage, spec completeness, Jev mapping validity, patch reproducibility). Nonzero exit fails the build.
- **Agent-skill sync** — `.devin/skills/rehearsal-testing/SKILL.md` documents the pipeline stages + eval cases; `npm run check:skill-sync` fails when code stages/cases drift from the skill doc. Every commit that adds a stage must update the skill — enforced, not aspirational.
- **CI** (`.github/workflows/ci.yml`): install → lint → typecheck → unit → evals → playwright e2e (hermetic, fixture server) → `terraform fmt -check` + `init -backend=false` + `validate` for both stacks.
- **Hermetic e2e**: Playwright serves `tests/evals/fixtures/aie-code-2026.html` locally — no external network needed in CI.
- **Reproducibility**: seeded RNG, recorded env/viewport/seed per run, variant patches asserted idempotent.
- **Telemetry**: Sentry DSN-gated; structured JSON event log per experiment; Tiger Data adapter when `DATABASE_URL`.

## 10. Integrations & env contract

| Service | Purpose | Env keys | Fallback |
|---|---|---|---|
| Gemini API | criteria, findings, spec | `GEMINI_API_KEY` | deterministic fixture analysis |
| Jev (System One) | action ranking | `JEV_BASE_URL`, `JEV_API_KEY` (or `OPENROUTER_API_KEY`) | `FixtureJevClient` |
| Bright Data | page fetch + remote browser | `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE`, `BRIGHTDATA_BROWSER_WS` | fetch + local Chromium |
| Sentry | errors, traces, replay | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | no-op |
| Tiger Data | experiment persistence | `DATABASE_URL` / `TIGERDATA_URL` | JSON files |
| Snowflake | KB vector search (Cortex) | `SNOWFLAKE_ACCOUNT_URL`, `SNOWFLAKE_TOKEN`, `SNOWFLAKE_CORTEX_SERVICE` | disabled |

`.env.example` lists all keys; adapters select on presence. **No key = no crash.** The whole pipeline must run end-to-end on fixtures alone.

## 11. Safety

Public http(s) only; block RFC1918/localhost/link-local/metadata hosts; ≤1 request / 2s per target host; respect robots.txt on fetched paths; never submit forms, payments, or messages; keys server-side; redact secrets from evidence; variants never touch the live site.

## 12. Non-functional

Same budgets as v1.0: ≤30 states, depth ≤3, ~1000 trajectories, 6–12 browser runs, capped concurrency. Timeouts on every browser/model call. Partial results always distinguishable from success.

## 13. Definition of done (revised)

- [ ] Objective entered → closed loop completes on the AIE URL.
- [ ] ≥500 seeded trajectories; identical seed → identical output (eval-verified).
- [ ] ≥1 finding verified in a real browser and correctly classified.
- [ ] ≥1 DOM-patched variant re-verified with deltas.
- [ ] **`spec.md` generated** — change list + rebuild plan, each change traced to evidence.
- [ ] `npm run eval` green locally and in CI; terraform stacks validate.
- [ ] Runs fully offline on fixtures (keys absent) — the demo can never be dead-on-arrival.
- [ ] Deployed to DigitalOcean (Terraform) if keys/creds arrive in time; otherwise recorded run on fixtures.

## 14. Demo script (45–60s)

Open dashboard → paste AIE URL → goal: "can I still register?" → watch graph fill → simulated paths → highlighted verified finding (stale post-event "Apply" CTA) → apply variant → side-by-side evidence → open `spec.md`. Close: *"Don't just build it. Rehearse it."*

## 15. Roadmap (unchanged)

v1.0 §21 stands: developer workflow → behavioral intelligence → autonomous optimization → generalized simulations.
