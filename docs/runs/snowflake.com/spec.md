# Rehearsal spec — https://www.snowflake.com/en/

Goal: start a free trial
Generated: 2026-11-13T22:01:32.059Z

## Summary
Rehearsal verified 5 browser runs against https://www.snowflake.com/en/: 1 verified failure(s), 36 reproducible concern(s). 37 total findings mapped to 37 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "trial" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t85_desktop (desktop) failed assertion url-matches on value "trial". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_37ba5b77_122 (data/evidence/run_t85_desktop_0.png, data/evidence/run_t85_desktop_3.png, data/evidence/run_t85_desktop_6.png, data/evidence/run_t85_desktop_7.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Snowflake AI Data Cloud" shows dates in the past (JULY 31, 2025) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_3343a39d_126 (data/evidence/exp_92d8df8c_desktop_d0.png)

### 3. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Expedition 26: Launches, AI News and Recaps | Snowflake" shows dates in the past (NOV 3, 2026, NOV 12, 2026, NOV 10, 2026, NOV 9, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_4b6f8425_141 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 4. Desktop: missing primary navigation, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (primary navigation, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_f32dafdf (data/evidence/exp_92d8df8c_desktop_d1.png)

### 5. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 110 distinct links compete for attention on "Snowflake AI Data Cloud". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_4edcec8f_127

### 6. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 73 distinct links compete for attention on "Snowflake Startup Challenge". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3c3fcd97_128

### 7. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_8f12618d_129 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 8. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 39 distinct links compete for attention on "Expedition". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_50dd12c7_130

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 83 distinct links compete for attention on "Snowflake Pricing | Choose the Right Edition for Your Data Needs". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_bcdcdb79_131

### 10. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 105 distinct links compete for attention on "Snowflake AIデータクラウド". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_349aea6b_132

### 11. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 104 distinct links compete for attention on "Snowflake AI 데이터 클라우드 | Snowflake Korea". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b7983869_133

### 12. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 80 distinct links compete for attention on "Snowflake AI 数据云". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_fe0968a7_134

### 13. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 94 distinct links compete for attention on "Snowflake AI Data Cloud | Snowflake Brasil". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3d51b42b_135

### 14. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 102 distinct links compete for attention on "Die Snowflake AI Data Cloud | Snowflake DE". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_f8e1d32e_136

### 15. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 102 distinct links compete for attention on "L’AI Data Cloud de Snowflake | Snowflake FR". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_926652b1_137

### 16. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 98 distinct links compete for attention on "Snowflake AI Data Cloud | Snowflake ES". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_28b8abb7_138

### 17. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 97 distinct links compete for attention on "L’AI Data Cloud Snowflake | Snowflake IT". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_12a0d13d_139

### 18. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 73 distinct links compete for attention on "Contact Sales". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_2d0ddaba_140

### 19. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 82 distinct links compete for attention on "Expedition 26: Launches, AI News and Recaps | Snowflake". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_0bcbcdb9_142

### 20. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_37cc2bfe_143 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 21. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 100 distinct links compete for attention on "Why Snowflake AI Data Cloud?". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_e98ca505_144

### 22. Desktop: homepage requires 8.37 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 7530px tall at a 900px viewport — 8.37 screens, roughly 12.6s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_92d8df8c_desktop_d0.png)

### 23. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 5 above-the-fold actions are equally prominent by size ("CONTACT SALES", "START FOR FREE", "REGISTER NOW", "REJECT ALL", "ACCEPT ALL COOKIES") on "Snowflake Startup Challenge", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_92d8df8c_desktop_d0.png, data/evidence/exp_92d8df8c_desktop_d1.png)

### 24. Desktop: missing page name, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (page name, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_8ef619cb (data/evidence/exp_92d8df8c_desktop_d1.png)

### 25. Desktop: primary navigation has 10 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 10 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_92d8df8c_desktop_d0.png, data/evidence/exp_92d8df8c_desktop_d1.png)

### 26. Heading outline is broken: skips h1→h4, h2→h5, h4→h6, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h4, h2→h5, h4→h6, h2→h4 (h1: "The Agentic EnterpriseRuns on Snowflake"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_93c152dd (data/evidence/exp_92d8df8c_desktop_d0.png)

### 27. Heading outline is broken: no h1; skips h2→h5, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with no h1; skips h2→h5, h2→h4. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_6b855e03 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 28. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Expedition"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_92d8df8c_desktop_d1.png)

### 29. Heading outline is broken: skips h1→h6, h2→h4, h2→h5 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h6, h2→h4, h2→h5 (h1: "Snowflake Pricing"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_314d4295 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 30. Heading outline is broken: skips h1→h6, h2→h5, h4→h6, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 6 page(s) have a heading outline with skips h1→h6, h2→h5, h4→h6, h2→h4 (h1: "Snowflakeで実現する エージェント型エンタープライズ"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_9f7cbac7 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 31. Heading outline is broken: 2 h1 elements; skips h1→h6, h2→h5, h4→h6, h2→h4, h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with 2 h1 elements; skips h1→h6, h2→h5, h4→h6, h2→h4, h1→h4 (h1: "Snowflake 기반의 에이전틱 엔터프라이즈", "Snowflake 최신 소식"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_cf2d3ce8 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 32. Heading outline is broken: skips h1→h6, h2→h5, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h6, h2→h5, h2→h4 (h1: "L’entreprise agentique est sur Snowflake"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_940304b0 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 33. Heading outline is broken: skips h1→h6 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h6 (h1: "Contact Sales"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_693372c2 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 34. Heading outline is broken: skips h3→h5, h2→h6 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h3→h5, h2→h6 (h1: "Inside Expedition 26"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_8de69d43 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 35. Heading outline is broken: skips h3→h6, h3→h5, h2→h4, h4→h6, h2→h6 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h3→h6, h3→h5, h2→h4, h4→h6, h2→h6 (h1: "Power Your Agentic Enterprise"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_68593027 (data/evidence/exp_92d8df8c_desktop_d1.png)

### 36. Desktop: missing you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (you-are-here indicator) to the persistent header on every page.
- Rationale: On 4 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_92d8df8c_desktop_d1.png)

### 37. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 8 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_92d8df8c_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "trial"
- Post-event page still invites registration
- Post-event page still invites registration
- Desktop: missing primary navigation, search, you-are-here indicator (trunk test fails)

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost
- Dense link surface increases scan cost
- Ambiguous link labels (1)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
