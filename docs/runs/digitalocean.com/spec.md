# Rehearsal spec — https://www.digitalocean.com/

Goal: find droplet pricing
Generated: 2026-11-13T22:24:56.456Z

## Summary
Rehearsal verified 5 browser runs against https://www.digitalocean.com/: 1 verified failure(s), 19 reproducible concern(s). 20 total findings mapped to 20 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "pricing" (3 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t161_desktop (desktop) failed assertion url-matches on value "pricing". Also: Browser run run_t77_desktop (desktop) failed assertion url-matches on value "pricing". Browser run run_t36_desktop (desktop) failed assertion url-matches on value "pricing". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_8244f074_129 (data/evidence/run_t161_desktop_0.png, data/evidence/run_t161_desktop_3.png, data/evidence/run_t161_desktop_6.png, data/evidence/run_t161_desktop_8.png, data/evidence/run_t77_desktop_0.png, data/evidence/run_t77_desktop_3.png, data/evidence/run_t77_desktop_6.png, data/evidence/run_t77_desktop_7.png, data/evidence/run_t36_desktop_0.png, data/evidence/run_t36_desktop_3.png, data/evidence/run_t36_desktop_6.png)

### 2. Post-event page still invites registration (3 of 15 pages) [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Pricing Calculator | DigitalOcean" shows dates in the past (JANUARY 1, 2026) alongside active registration/apply language — a stale-content inconsistency. Also: Page "Prompt Caching is GA on DigitalOcean Serverless Inference: Up to 90% Off the Context Your Agents Resend | DigitalOcean" shows dates in the past (OCTOBER 23, 2026, NOVEMBER 10, 2026, NOVEMBER 5, 2026, OCTOBER 28, 2026) alongside active registration/apply language — a stale-content inconsistency. Page "DigitalOcean Blog" shows dates in the past (NOVEMBER 5, 2026, NOVEMBER 10, 2026, OCTOBER 29, 2026, OCTOBER 28, 2026, OCTOBER 23, 2026, OCTOBER 15, 2026, OCTOBER 13, 2026, OCTOBER 12, 2026, JUNE 2, 2026, MAY 29, 2026, FEBRUARY 9, 2026, NOVEMBER 21, 2025, SEPTEMBER 29, 2025, SEPTEMBER 19, 2025, AUGUST 21, 2025, JULY 10, 2025, JUNE 9, 2026, JUNE 3, 2026, MARCH 24, 2026, FEBRUARY 25, 2026, JANUARY 6, 2026, DECEMBER 8, 2025, NOVEMBER 4, 2025, OCTOBER 9, 2025, SEPTEMBER 3, 2025, JULY 30, 2026, JUNE 10, 2026, JUNE 1, 2026, MAY 20, 2026, MAY 13, 2026, APRIL 28, 2026, OCTOBER 21, 2026, AUGUST 24, 2026, MARCH 23, 2026, OCTOBER 22, 2025, OCTOBER 7, 2024, AUGUST 12, 2024, JULY 2, 2024, JULY 1, 2024, SEPTEMBER 14, 2026, SEPTEMBER 9, 2026, FEBRUARY 6, 2025, OCTOBER 3, 2024, MAY 28, 2024, FEBRUARY 12, 2024, NOVEMBER 21, 2023, JULY 6, 2023, MAY 22, 2023, OCTOBER 26, 2026, OCTOBER 10, 2024) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_d86fe033_140 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 3. Desktop: missing page name, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (page name, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 2 page(s) a visitor dropped in cold can't find: page name, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_869a8c38 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 4. Dense link surface increases scan cost (15 of 15 pages) [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 156 distinct links compete for attention on "AI-Native Cloud | DigitalOcean". Also: 119 distinct links compete for attention on "Agent Droplets Pricing | DigitalOcean". 151 distinct links compete for attention on "GPU Droplets | DigitalOcean". 161 distinct links compete for attention on "Budget-Friendly Cloud Server Pricing | DigitalOcean". 144 distinct links compete for attention on "DigitalOcean Droplets | Scalable Cloud Compute Starting at $4/mo". 42 distinct links compete for attention on "Pricing Calculator | DigitalOcean". 123 distinct links compete for attention on "Prompt Caching is GA on DigitalOcean Serverless Inference: Up to 90% Off the Context Your Agents Resend | DigitalOcean". 218 distinct links compete for attention on "DigitalOcean Blog". 269 distinct links compete for attention on "Careers | DigitalOcean". 119 distinct links compete for attention on "Contact Sales at DigitalOcean". 149 distinct links compete for attention on "AI-Native Cloud | DigitalOcean". 126 distinct links compete for attention on "Managed Agents | DigitalOcean". 121 distinct links compete for attention on "Learning Services | DigitalOcean". 119 distinct links compete for attention on "Data Services | DigitalOcean". 127 distinct links compete for attention on "AI Inference Engine | Serverless, Batch & Dedicated Inference | DigitalOcean". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3492d74b_132

### 5. Ambiguous link labels (3) (2 of 15 pages) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn more", "Learn more" force users to guess where they lead. Also: Actions like "Read more", "Read more", "Read more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_e587a6a4_134 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 6. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "here" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_3ed3be8c_136 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 7. Ambiguous link labels (11) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Read more", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_3f394bd1_138 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 8. Ambiguous link labels (63) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_1757c179_146 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 9. Ambiguous link labels (6) (2 of 15 pages) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read more", "Read more", "Read more", "Learn more", "Learn more", "Learn more" force users to guess where they lead. Also: Actions like "Learn more", "Learn more", "Learn more", "Learn more", "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_73263c7e_148 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 10. Ambiguous link labels (4) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn More", "Learn More", "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_f44c39f3_151 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 11. Ambiguous link labels (2) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_8b835b5c_153 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 12. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 7 above-the-fold actions are equally prominent by size ("Product updates", "Engineering", "Trust & Security", "Partner News", "Get started", "Agree & proceed", "Decline all") on "DigitalOcean Blog", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_ac93ecd2_desktop_d0.png, data/evidence/exp_ac93ecd2_desktop_d1.png)

### 13. Desktop: primary navigation has 17 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 17 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_ac93ecd2_desktop_d0.png, data/evidence/exp_ac93ecd2_desktop_d1.png)

### 14. Console errors during browser runs (14) [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Rationale: console-errors: 14 page/console errors across 4 of 4 desktop runs, e.g. "console: Loading the script 'https://a.usbrowserspeed.com/cs?pid=b910e4cfe0d26c8f65884d90d71e4eb6628b4c8f3747dbae6c22ea2", "console: Failed to load resource: the server responded with a status of 429 ()", "console: Loading the script 'https://a.usbrowserspeed.com/cs?pid=b910e4cfe0d26c8f65884d90d71e4eb6628b4c8f3747dbae6c22ea2". The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts. [reproducible-concern; Do labels and interactions behave predictably?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_console-errors_desktop (data/evidence/run_t161_desktop_0.png, data/evidence/run_t161_desktop_3.png, data/evidence/run_t161_desktop_6.png)

### 15. Desktop: homepage requires 6.76 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 6085px tall at a 900px viewport — 6.76 screens, roughly 10.1s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_ac93ecd2_desktop_d0.png)

### 16. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 4 page(s) have a heading outline with skips h1→h3 (h1: "AI-Native Cloud"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_ac93ecd2_desktop_d0.png, data/evidence/exp_ac93ecd2_desktop_d1.png)

### 17. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 2 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 18. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_ac93ecd2_desktop_d0.png)

### 19. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 11 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_ac93ecd2_desktop_d1.png)

### 20. Desktop: missing you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_ac93ecd2_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "pricing" (3 of 4 runs)
- Post-event page still invites registration (3 of 15 pages)
- Desktop: missing page name, search, you-are-here indicator (trunk test fails)

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost (15 of 15 pages)
- Ambiguous link labels (3) (2 of 15 pages)
- Ambiguous link labels (1)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
