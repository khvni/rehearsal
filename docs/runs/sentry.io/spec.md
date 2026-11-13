# Rehearsal spec — https://sentry.io/welcome/

Goal: find pricing and start a trial
Generated: 2026-11-13T22:00:25.503Z

## Summary
Rehearsal verified 5 browser runs against https://sentry.io/welcome/: 1 verified failure(s), 32 reproducible concern(s). 34 total findings mapped to 34 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "trial" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t161_desktop (desktop) failed assertion url-matches on value "trial". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_0a2806b6_98 (data/evidence/run_t161_desktop_0.png, data/evidence/run_t161_desktop_3.png, data/evidence/run_t161_desktop_6.png, data/evidence/run_t161_desktop_8.png)

### 2. Desktop: missing page name, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (page name, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_869a8c38 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 3. "What does it do?" has no answer path [M]
- Change: Answer "What does it do?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "What does it do?" (information, importance 1). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-what (data/evidence/exp_dcf50a48_desktop_d0.png)

### 4. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 89 distinct links compete for attention on "Application Performance Monitoring & Error Tracking Software | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_a6377022_102

### 5. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 50 distinct links compete for attention on "Sentry for Startups - Terminal | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_86ff4886_103

### 6. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 95 distinct links compete for attention on "Pricing: Free Developer Plan, Pay as You Grow | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_c2bb8b1b_104

### 7. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 60 distinct links compete for attention on "Start your free trial | Unlimited events 14 days | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_72f71370_105

### 8. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 103 distinct links compete for attention on "Error Monitoring Software | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_66a17d84_106

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 92 distinct links compete for attention on "Structured Logging Connected to Errors and Traces | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_ec177b11_107

### 10. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read More", "Read More", "read more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_df95d5ee_108 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 11. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 94 distinct links compete for attention on "Seer: Debug faster at every stage of development | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_28e11067_109

### 12. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 70 distinct links compete for attention on "Seer Agent | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_d0d86a2d_110

### 13. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 74 distinct links compete for attention on "Seer Autofix | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_83712df2_111

### 14. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Read more", "Read more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_9898f895_112 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 15. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 130 distinct links compete for attention on "Session Replay: See What Users See, Fix What Broke | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_571a4a73_113

### 16. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 82 distinct links compete for attention on "Application Metrics — Trace-Connected and High-Cardinality | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_8f985c76_114

### 17. Ambiguous link labels (2) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_22faabc1_115 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 18. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 107 distinct links compete for attention on "Distributed Tracing | Monitor Performance Across Services | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_9e1ca544_116

### 19. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 99 distinct links compete for attention on "Agent Tracing: See Every Step of Your AI Agent Run | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_f94219c2_117

### 20. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read More", "Learn More", "here" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_d09d3f6f_118 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 21. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 86 distinct links compete for attention on "Continuous Profiling for Backend and Mobile Application Performance Issues | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_e478871f_119

### 22. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_ee382138_120 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 23. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 75 distinct links compete for attention on "Size Analysis | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_d5369970_121

### 24. Endpoint buried: pricing "See pricing" [S]
- Change: Surface "See pricing" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "See pricing" (pricing, weight 0.9) takes a median of 4 steps across 184/200 reaching journeys (shortest: Pricing → See pricing). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_pricing_aa7b9f0c

### 25. Desktop: homepage requires 9.79 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 8809px tall at a 900px viewport — 9.79 screens, roughly 14.7s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_dcf50a48_desktop_d0.png)

### 26. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 4 above-the-fold actions are equally prominent by size ("START TRIAL", "START TRIAL", "START TRIAL", "CONTACT SALES") on "Pricing: Free Developer Plan, Pay as You Grow | Sentry", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_dcf50a48_desktop_d1.png)

### 27. "Why should I be here and not somewhere else?" has no answer path [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_dcf50a48_desktop_d0.png)

### 28. Desktop: primary navigation has 9 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 9 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_dcf50a48_desktop_d0.png, data/evidence/exp_dcf50a48_desktop_d1.png)

### 29. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 30. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Pricing plans for dev teams of all sizes"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_dcf50a48_desktop_d1.png)

### 31. Heading outline is broken: skips h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h4 (h1: "Start fixing"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_296a5c62 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 32. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 2 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_dcf50a48_desktop_d0.png, data/evidence/exp_dcf50a48_desktop_d1.png)

### 33. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 12 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_dcf50a48_desktop_d1.png)

### 34. 2 of 15 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "What does it do?", "Why should I be here and not somewhere else?".
- Rationale: unanswered-question summary: 13/15 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "What does it do?", "Why should I be here and not somewhere else?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: homepage
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_dcf50a48_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "trial"
- Desktop: missing page name, search, you-are-here indicator (trunk test fails)
- "What does it do?" has no answer path

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
