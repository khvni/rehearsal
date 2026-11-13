# Rehearsal spec — https://sentry.io/welcome/

Goal: find pricing and start a trial
Generated: 2026-11-13T22:22:06.215Z

## Summary
Rehearsal verified 5 browser runs against https://sentry.io/welcome/: 1 verified failure(s), 17 reproducible concern(s). 19 total findings mapped to 19 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "trial" (4 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t93_desktop (desktop) failed assertion url-matches on value "trial". Also: Browser run run_t219_desktop (desktop) failed assertion url-matches on value "trial". Browser run run_t267_desktop (desktop) failed assertion url-matches on value "trial". Browser run run_t56_desktop (desktop) failed assertion url-matches on value "trial". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_9fe3d8ae_82 (data/evidence/run_t93_desktop_0.png, data/evidence/run_t93_desktop_3.png, data/evidence/run_t93_desktop_6.png, data/evidence/run_t219_desktop_0.png, data/evidence/run_t219_desktop_3.png, data/evidence/run_t219_desktop_6.png, data/evidence/run_t267_desktop_0.png, data/evidence/run_t267_desktop_3.png, data/evidence/run_t267_desktop_6.png, data/evidence/run_t56_desktop_0.png, data/evidence/run_t56_desktop_3.png, data/evidence/run_t56_desktop_6.png)

### 2. Desktop: missing page name, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (page name, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_869a8c38 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 3. "What does it do?" has no answer path [M]
- Change: Answer "What does it do?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "What does it do?" (information, importance 1). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-what (data/evidence/exp_6b09cfa0_desktop_d0.png)

### 4. Dense link surface increases scan cost (15 of 15 pages) [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 89 distinct links compete for attention on "Application Performance Monitoring & Error Tracking Software | Sentry". Also: 50 distinct links compete for attention on "Sentry for Startups - Terminal | Sentry". 95 distinct links compete for attention on "Pricing: Free Developer Plan, Pay as You Grow | Sentry". 60 distinct links compete for attention on "Start your free trial | Unlimited events 14 days | Sentry". 103 distinct links compete for attention on "Error Monitoring Software | Sentry". 92 distinct links compete for attention on "Structured Logging Connected to Errors and Traces | Sentry". 94 distinct links compete for attention on "Seer: Debug faster at every stage of development | Sentry". 70 distinct links compete for attention on "Seer Agent | Sentry". 74 distinct links compete for attention on "Seer Autofix | Sentry". 130 distinct links compete for attention on "Session Replay: See What Users See, Fix What Broke | Sentry". 82 distinct links compete for attention on "Application Metrics — Trace-Connected and High-Cardinality | Sentry". 107 distinct links compete for attention on "Distributed Tracing | Monitor Performance Across Services | Sentry". 99 distinct links compete for attention on "Agent Tracing: See Every Step of Your AI Agent Run | Sentry". 86 distinct links compete for attention on "Continuous Profiling for Backend and Mobile Application Performance Issues | Sentry". 75 distinct links compete for attention on "Size Analysis | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_a6e7511b_86

### 5. Ambiguous link labels (3) (3 of 15 pages) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read More", "Read More", "read more" force users to guess where they lead. Also: Actions like "Learn more", "Read more", "Read more" force users to guess where they lead. Actions like "Read More", "Learn More", "here" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_60c2f509_92 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 6. Ambiguous link labels (2) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_4701a106_99 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 7. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_68b790d9_104 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 8. Endpoint buried: pricing "See pricing" [S]
- Change: Surface "See pricing" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "See pricing" (pricing, weight 0.9) takes a median of 4 steps across 184/200 reaching journeys (shortest: Pricing → See pricing). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_pricing_aa7b9f0c

### 9. Desktop: homepage requires 9.79 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 8809px tall at a 900px viewport — 9.79 screens, roughly 14.7s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_6b09cfa0_desktop_d0.png)

### 10. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 4 above-the-fold actions are equally prominent by size ("START TRIAL", "START TRIAL", "START TRIAL", "CONTACT SALES") on "Pricing: Free Developer Plan, Pay as You Grow | Sentry", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 11. "Why should I be here and not somewhere else?" has no answer path [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_6b09cfa0_desktop_d0.png)

### 12. Console errors during browser runs (7) [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Rationale: console-errors: 7 page/console errors across 4 of 4 desktop runs, e.g. "console: requestStorageAccess: Permission denied.". The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts. [reproducible-concern; Do labels and interactions behave predictably?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_console-errors_desktop (data/evidence/run_t93_desktop_0.png, data/evidence/run_t93_desktop_3.png, data/evidence/run_t93_desktop_6.png)

### 13. Desktop: primary navigation has 9 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 9 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_6b09cfa0_desktop_d0.png, data/evidence/exp_6b09cfa0_desktop_d1.png)

### 14. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 15. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Pricing plans for dev teams of all sizes"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 16. Heading outline is broken: skips h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h4 (h1: "Start fixing"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_296a5c62 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 17. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 2 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_6b09cfa0_desktop_d0.png, data/evidence/exp_6b09cfa0_desktop_d1.png)

### 18. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 12 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_6b09cfa0_desktop_d1.png)

### 19. 2 of 15 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "What does it do?", "Why should I be here and not somewhere else?".
- Rationale: unanswered-question summary: 13/15 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "What does it do?", "Why should I be here and not somewhere else?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: homepage
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_6b09cfa0_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "trial" (4 of 4 runs)
- Desktop: missing page name, search, you-are-here indicator (trunk test fails)
- "What does it do?" has no answer path

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost (15 of 15 pages)
- Ambiguous link labels (3) (3 of 15 pages)
- Ambiguous link labels (2)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
