# Rehearsal spec — https://mtc.so/

Goal: find how to join or start a chapter
Generated: 2026-11-13T22:16:03.014Z

## Summary
Rehearsal verified 5 browser runs against https://mtc.so/: 1 verified failure(s), 15 reproducible concern(s). 19 total findings mapped to 19 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "chapter" (4 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t44_desktop (desktop) failed assertion url-matches on value "chapter". Also: Browser run run_t60_desktop (desktop) failed assertion url-matches on value "chapter". Browser run run_t41_desktop (desktop) failed assertion url-matches on value "chapter". Browser run run_t50_desktop (desktop) failed assertion url-matches on value "chapter". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_9fbd200a_10 (data/evidence/run_t44_desktop_0.png, data/evidence/run_t44_desktop_3.png, data/evidence/run_t44_desktop_6.png, data/evidence/run_t60_desktop_0.png, data/evidence/run_t60_desktop_3.png, data/evidence/run_t60_desktop_4.png, data/evidence/run_t41_desktop_0.png, data/evidence/run_t41_desktop_3.png, data/evidence/run_t50_desktop_0.png, data/evidence/run_t50_desktop_3.png, data/evidence/run_t50_desktop_6.png, data/evidence/run_t50_desktop_8.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Muslim Tech Collaborative" shows dates in the past (JANUARY 1, 2025) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_99ab10eb_22 (data/evidence/exp_3449aea0_desktop_d1.png)

### 3. Desktop: missing page name, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (page name, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_869a8c38 (data/evidence/exp_3449aea0_desktop_d1.png)

### 4. Dense link surface increases scan cost (11 of 15 pages) [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 29 distinct links compete for attention on "Muslim Tech Collaborative". Also: 26 distinct links compete for attention on "Muslim Tech Collaborative". 25 distinct links compete for attention on "Muslim Tech Collaborative". 28 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3cf4dd5e_14

### 5. Endpoint buried: docs-answers "Support" (3 of 15 pages) [S]
- Change: Surface "Support" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Support" (docs-answers, weight 0.72) takes a median of 4 steps across 128/200 reaching journeys (shortest: About → Support). Each extra choice must be mindless; past 3 the path stops being obvious. Also: endpoint-deep: "Support" (docs-answers, weight 0.72) takes a median of 4 steps across 122/200 reaching journeys (shortest: → Chapters Campus and city communities coast to coast — workshops, speakers, and a place to belong in tech. → Support). Each extra choice must be mindless; past 3 the path stops being obvious. endpoint-deep: "Support" (docs-answers, weight 0.72) takes a median of 5 steps across 151/200 reaching journeys (shortest: Join ↗ → Support). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_docs-answers_194f29c5

### 6. Endpoint buried: docs-answers "Get the guide ↗" [S]
- Change: Surface "Get the guide ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Get the guide ↗" (docs-answers, weight 0.72) takes a median of 4 steps across 120/200 reaching journeys (shortest: Explore chapters → Get the guide ↗). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_docs-answers_fac57f54

### 7. Endpoint buried: schedule-event "Schedule meeting ↗" [S]
- Change: Surface "Schedule meeting ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Schedule meeting ↗" (schedule-event, weight 0.72) takes a median of 4 steps across 116/200 reaching journeys (shortest: 03 Chapters → Schedule meeting ↗). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_schedule-event_d08ed85a

### 8. "Why should I be here and not somewhere else?" has no answer path [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_3449aea0_desktop_d0.png)

### 9. "How much does it cost?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How much does it cost?" (quotation, importance 0.75). None of the 15 discovered states or their links answer it (looked for pricing). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_cost (data/evidence/exp_3449aea0_desktop_d0.png)

### 10. "Is it in person or online?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Is it in person or online?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Is it in person or online?" (information, importance 0.6). None of the 15 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_format (data/evidence/exp_3449aea0_desktop_d0.png)

### 11. Console errors during browser runs (23) [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Rationale: console-errors: 23 page/console errors across 4 of 4 desktop runs, e.g. "console: Error fetching user data: AuthSessionMissingError: Auth session missing!
    at https://mtc.so/_next/static/chu". The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts. [reproducible-concern; Do labels and interactions behave predictably?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_console-errors_desktop (data/evidence/run_t44_desktop_0.png, data/evidence/run_t44_desktop_3.png, data/evidence/run_t44_desktop_6.png)

### 12. Endpoint buried: next-steps "Schedule a call ↗" [S]
- Change: Surface "Schedule a call ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Schedule a call ↗" (next-steps, weight 0.36) takes a median of 5 steps across 107/200 reaching journeys (shortest: Sponsor → Schedule a call ↗). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_next-steps_f8f33512

### 13. Desktop: homepage requires 4.14 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 3725px tall at a 900px viewport — 4.14 screens, roughly 6.2s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_3449aea0_desktop_d0.png)

### 14. Desktop: primary navigation has 8 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 8 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_3449aea0_desktop_d0.png, data/evidence/exp_3449aea0_desktop_d1.png, data/evidence/exp_3449aea0_desktop_d2.png)

### 15. Heading outline is broken: skips h1→h3, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h3, h2→h4 (h1: "Ourmission."). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_1c5629fe (data/evidence/exp_3449aea0_desktop_d1.png)

### 16. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_3449aea0_desktop_d1.png)

### 17. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_3449aea0_desktop_d0.png)

### 18. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 13 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_3449aea0_desktop_d1.png, data/evidence/exp_3449aea0_desktop_d2.png)

### 19. 3 of 15 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?", "Why should I be here and not somewhere else?", "Is it in person or online?".
- Rationale: unanswered-question summary: 12/15 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "Why should I be here and not somewhere else?", "How much does it cost?", "Is it in person or online?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: homepage
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_3449aea0_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "chapter" (4 of 4 runs)
- Post-event page still invites registration
- Desktop: missing page name, search, you-are-here indicator (trunk test fails)

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost (11 of 15 pages)
- Endpoint buried: docs-answers "Support" (3 of 15 pages)
- Endpoint buried: docs-answers "Get the guide ↗"

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
