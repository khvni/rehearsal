# Rehearsal spec — https://mtc.so/

Goal: find how to join or start a chapter
Generated: 2026-11-13T21:54:23.979Z

## Summary
Rehearsal verified 5 browser runs against https://mtc.so/: 1 verified failure(s), 24 reproducible concern(s). 27 total findings mapped to 27 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "chapter" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t252_desktop (desktop) failed assertion url-matches on value "chapter". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_ebf6be56_10 (data/evidence/run_t252_desktop_0.png, data/evidence/run_t252_desktop_3.png, data/evidence/run_t252_desktop_6.png, data/evidence/run_t252_desktop_8.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Muslim Tech Collaborative" shows dates in the past (JANUARY 1, 2025) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_48769f8a_25 (data/evidence/exp_daadf661_desktop_d1.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 32 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_bad39aa0_14

### 4. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 29 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3b190d51_15

### 5. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 25 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_9b3aa388_16

### 6. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 25 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_11b4c581_17

### 7. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 26 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_4ec414bd_18

### 8. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 26 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_9aadea73_19

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 25 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_cfae541a_20

### 10. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 25 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_d201a6c1_21

### 11. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 26 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_d6a189ca_22

### 12. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 25 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3b4849da_23

### 13. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 25 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b1e6025e_24

### 14. Endpoint buried: docs-answers "Support" [S]
- Change: Surface "Support" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Support" (docs-answers, weight 0.72) takes a median of 5 steps across 114/200 reaching journeys (shortest: → Programs Youth, campus chapters, and a professional network — real builds, at every age. → Support). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_docs-answers_194f29c5

### 15. Endpoint buried: docs-answers "Support" [S]
- Change: Surface "Support" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Support" (docs-answers, weight 0.72) takes a median of 4 steps across 11/200 reaching journeys (shortest: evi - AI Event Coordinator startup · web · ai AI-powered event coordinator that lets you plan and run events through sim → Support). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_docs-answers_80e059e7

### 16. Endpoint buried: docs-answers "Support" [S]
- Change: Surface "Support" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Support" (docs-answers, weight 0.72) takes a median of 5 steps across 121/200 reaching journeys (shortest: → Chapters Campus and city communities coast to coast — workshops, speakers, and a place to belong in tech. → Support). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_docs-answers_8ca53ce9

### 17. Endpoint buried: docs-answers "Get the guide ↗" [S]
- Change: Surface "Get the guide ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Get the guide ↗" (docs-answers, weight 0.72) takes a median of 5 steps across 119/200 reaching journeys (shortest: 03 Chapters → Get the guide ↗). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_docs-answers_fac57f54

### 18. Endpoint buried: schedule-event "Schedule meeting ↗" [S]
- Change: Surface "Schedule meeting ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Schedule meeting ↗" (schedule-event, weight 0.72) takes a median of 4 steps across 136/200 reaching journeys (shortest: → Chapters Campus and city communities coast to coast — workshops, speakers, and a place to belong in tech. → Schedule meeting ↗). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_schedule-event_d08ed85a

### 19. "Why should I be here and not somewhere else?" has no answer path [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_daadf661_desktop_d0.png)

### 20. "How much does it cost?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How much does it cost?" (quotation, importance 0.75). None of the 15 discovered states or their links answer it (looked for pricing). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_cost (data/evidence/exp_daadf661_desktop_d0.png)

### 21. Endpoint buried: next-steps "Schedule a call ↗" [S]
- Change: Surface "Schedule a call ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Schedule a call ↗" (next-steps, weight 0.36) takes a median of 5 steps across 113/200 reaching journeys (shortest: Sponsor → Schedule a call ↗). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_next-steps_f8f33512

### 22. Desktop: homepage requires 4.14 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 3725px tall at a 900px viewport — 4.14 screens, roughly 6.2s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_daadf661_desktop_d0.png)

### 23. Desktop: primary navigation has 8 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 8 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_daadf661_desktop_d0.png, data/evidence/exp_daadf661_desktop_d1.png)

### 24. Heading outline is broken: skips h1→h3, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h3, h2→h4 (h1: "Ourmission."). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_1c5629fe (data/evidence/exp_daadf661_desktop_d1.png)

### 25. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_daadf661_desktop_d0.png)

### 26. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 14 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_daadf661_desktop_d1.png)

### 27. 2 of 15 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?", "Why should I be here and not somewhere else?".
- Rationale: unanswered-question summary: 13/15 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "Why should I be here and not somewhere else?", "How much does it cost?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: homepage
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_daadf661_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "chapter"
- Post-event page still invites registration

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost
- Dense link surface increases scan cost
- Dense link surface increases scan cost

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
