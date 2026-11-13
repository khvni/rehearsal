# Rehearsal spec — https://www.tigerdata.com/

Goal: find pricing and sign up
Generated: 2026-11-13T22:20:48.768Z

## Summary
Rehearsal verified 5 browser runs against https://www.tigerdata.com/: 1 verified failure(s), 11 reproducible concern(s). 12 total findings mapped to 12 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "pricing" (3 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t60_desktop (desktop) failed assertion url-matches on value "pricing". Also: Browser run run_t224_desktop (desktop) failed assertion url-matches on value "pricing". Browser run run_t56_desktop (desktop) failed assertion url-matches on value "pricing". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_d0fe8c8a_69 (data/evidence/run_t60_desktop_0.png, data/evidence/run_t60_desktop_3.png, data/evidence/run_t60_desktop_6.png, data/evidence/run_t60_desktop_8.png, data/evidence/run_t224_desktop_0.png, data/evidence/run_t224_desktop_3.png, data/evidence/run_t224_desktop_5.png, data/evidence/run_t56_desktop_0.png, data/evidence/run_t56_desktop_3.png, data/evidence/run_t56_desktop_4.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Privacy Policy | Tiger Data" shows dates in the past (NOVEMBER 6, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_53b099d9_74 (data/evidence/exp_417abbe5_desktop_d1.png)

### 3. Desktop: missing site ID, page name, primary navigation, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (site ID, page name, primary navigation, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 8 page(s) a visitor dropped in cold can't find: site ID, page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_554d08b1 (data/evidence/exp_417abbe5_desktop_d1.png)

### 4. Dense link surface increases scan cost (7 of 15 pages) [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 70 distinct links compete for attention on "Time-Series PostgreSQL at Petabyte Scale". Also: 61 distinct links compete for attention on "Tiger Cloud Pricing. Scale Further. Spend Less. | Tiger Data". 62 distinct links compete for attention on "Privacy Policy | Tiger Data". 72 distinct links compete for attention on "Tiger Cloud — Production Postgres at Scale | Tiger Data". 51 distinct links compete for attention on "TimescaleDB Enterprise for Physical-World Operational Data | Tiger Data". 58 distinct links compete for attention on "Postgres Vector and Keyword Search | Tiger Data". 60 distinct links compete for attention on "Postgres for Energy & Utilities | Tiger Data". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_5e5d7a6a_72

### 5. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "here" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_69b44d66_75 (data/evidence/exp_417abbe5_desktop_d1.png)

### 6. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_5d87c7a6_80 (data/evidence/exp_417abbe5_desktop_d1.png)

### 7. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 3 above-the-fold actions are equally prominent by size ("30-day free trial", "30-day free trial", "Have pricing questions? Let’s chat") on "Tiger Cloud Pricing. Scale Further. Spend Less. | Tiger Data", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_417abbe5_desktop_d1.png)

### 8. Console errors during browser runs (25) [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Rationale: console-errors: 25 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 429 ()". The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts. [reproducible-concern; Do labels and interactions behave predictably?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_console-errors_desktop (data/evidence/run_t60_desktop_0.png, data/evidence/run_t60_desktop_3.png, data/evidence/run_t60_desktop_6.png)

### 9. Desktop: homepage requires 5.7 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 5130px tall at a 900px viewport — 5.7 screens, roughly 8.6s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_417abbe5_desktop_d0.png)

### 10. Desktop: primary navigation has 11 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 11 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_417abbe5_desktop_d0.png, data/evidence/exp_417abbe5_desktop_d1.png)

### 11. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 8 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_417abbe5_desktop_d1.png)

### 12. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 7 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_417abbe5_desktop_d0.png, data/evidence/exp_417abbe5_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "pricing" (3 of 4 runs)
- Post-event page still invites registration
- Desktop: missing site ID, page name, primary navigation, search, you-are-here indicator (trunk test fails)

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost (7 of 15 pages)
- Ambiguous link labels (1)
- Ambiguous link labels (3)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
