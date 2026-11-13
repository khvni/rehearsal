# Rehearsal spec — https://www.keysight.com/us/en/home.html

Goal: find pricing or request a quote for an oscilloscope
Generated: 2026-11-13T21:52:06.360Z

## Summary
Rehearsal verified 5 browser runs against https://www.keysight.com/us/en/home.html: 1 verified failure(s), 14 reproducible concern(s). 17 total findings mapped to 17 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "oscilloscope" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t86_desktop (desktop) failed assertion url-matches on value "oscilloscope". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_d05864e7_0 (data/evidence/run_t86_desktop_0.png, data/evidence/run_t86_desktop_3.png, data/evidence/run_t86_desktop_4.png)

### 2. Desktop: missing site ID, page name, primary navigation, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (site ID, page name, primary navigation, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 10 page(s) a visitor dropped in cold can't find: site ID, page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_554d08b1 (data/evidence/exp_eabfa9cf_desktop_d1.png)

### 3. Ambiguous link labels (11) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn more", "Learn More", "Learn More", "Learn More", "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_314ee31e_3 (data/evidence/exp_eabfa9cf_desktop_d0.png)

### 4. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 224 distinct links compete for attention on "Keysight: Design, Emulate, and Test to Accelerate Innovation". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b2272533_4

### 5. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 221 distinct links compete for attention on "是德科技：通过设计、仿真和测试加速创新". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_975d669a_5

### 6. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 233 distinct links compete for attention on "キーサイト：設計、エミュレーション、テストでイノベーションを加速". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_5851272e_6

### 7. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 230 distinct links compete for attention on "Keysight：設計、模擬與測試，加速創新". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3ea4d1ec_7

### 8. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 229 distinct links compete for attention on "키사이트: 설계, 에뮬레이션, 테스트를 통해 혁신 가속화". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_d1ad8af9_8

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 232 distinct links compete for attention on "Keysight: Projetar, Emular e Testar para Acelerar a Inovação". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_ff49142e_9

### 10. Desktop: homepage requires 8.01 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 7209px tall at a 900px viewport — 8.01 screens, roughly 12s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_eabfa9cf_desktop_d0.png)

### 11. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 3 above-the-fold actions are equally prominent by size ("Explore Our New Essential Oscilloscope", "Explore New Validation Solutions", "Meet Our New Signal Generator") on "Keysight: Design, Emulate, and Test to Accelerate Innovation", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_eabfa9cf_desktop_d0.png, data/evidence/exp_eabfa9cf_desktop_d1.png)

### 12. Desktop: missing page name (trunk test fails) [S]
- Change: Add the missing trunk-test signals (page name) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_ac62ae69 (data/evidence/exp_eabfa9cf_desktop_d0.png)

### 13. Desktop: missing page name, search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (page name, search) to the persistent header on every page.
- Rationale: On 4 page(s) a visitor dropped in cold can't find: page name, search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_a1db3636 (data/evidence/exp_eabfa9cf_desktop_d1.png)

### 14. "Is there a free tier or trial?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Is there a free tier or trial?" (quotation, importance 0.8). None of the 15 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_free-tier (data/evidence/exp_eabfa9cf_desktop_d0.png)

### 15. Desktop: primary navigation has 11 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 11 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_eabfa9cf_desktop_d0.png, data/evidence/exp_eabfa9cf_desktop_d1.png)

### 16. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 15 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_eabfa9cf_desktop_d0.png, data/evidence/exp_eabfa9cf_desktop_d1.png)

### 17. 1 of 13 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?".
- Rationale: unanswered-question summary: 12/13 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "Is there a free tier or trial?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_eabfa9cf_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "oscilloscope"
- Desktop: missing site ID, page name, primary navigation, search, you-are-here indicator (trunk test fails)

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Ambiguous link labels (11)
- Dense link surface increases scan cost
- Dense link surface increases scan cost

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
