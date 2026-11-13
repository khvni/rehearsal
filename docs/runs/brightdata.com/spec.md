# Rehearsal spec — https://brightdata.com/

Goal: find pricing for the Web Unlocker
Generated: 2026-11-13T22:17:51.735Z

## Summary
Rehearsal verified 5 browser runs against https://brightdata.com/: 1 verified failure(s), 6 reproducible concern(s). 14 total findings mapped to 14 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "unlocker" (4 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t0_desktop (desktop) failed assertion url-matches on value "unlocker". Also: Browser run run_t1_desktop (desktop) failed assertion url-matches on value "unlocker". Browser run run_t2_desktop (desktop) failed assertion url-matches on value "unlocker". Browser run run_t3_desktop (desktop) failed assertion url-matches on value "unlocker". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_3ed21dac_26 (data/evidence/run_t0_desktop_0.png, data/evidence/run_t1_desktop_0.png, data/evidence/run_t2_desktop_0.png, data/evidence/run_t3_desktop_0.png)

### 2. Desktop: missing site ID, primary navigation, search (trunk test fails) [M]
- Change: Add the missing trunk-test signals (site ID, primary navigation, search) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, primary navigation, search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_4fcd36c3 (data/evidence/exp_a2aa965b_desktop_d0.png)

### 3. "What can I do here?" has no answer path [M]
- Change: Answer "What can I do here?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "What can I do here?" (proposal, importance 0.9). The start page doesn't answer it (looked for signup/contact-form/next-steps/download/schedule-event/pricing/demo-video/docs-answers). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-do (data/evidence/exp_a2aa965b_desktop_d0.png)

### 4. "Where do I start?" has no answer path [M]
- Change: Answer "Where do I start?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "Where do I start?" (proposal, importance 0.9). The start page doesn't answer it (looked for signup). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-start (data/evidence/exp_a2aa965b_desktop_d0.png)

### 5. 9 of 10 expected visitor questions have no answer path [M]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "What can I do here?", "Where do I start?", "Why should I be here and not somewhere else?".
- Rationale: unanswered-question summary: 1/10 likely visitor questions are answered by the 1 discovered states or their endpoints. Unanswered: "What can I do here?", "Where do I start?", "Why should I be here and not somewhere else?", "What's new?", "How do I follow along?", "How do I find something specific?", "Who is behind this?", "How do I get in touch?", "How do I join the community?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: homepage
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_a2aa965b_desktop_d0.png)

### 6. Desktop: no call to action above the fold on the homepage [S]
- Change: Place one clearly styled primary action in the first screen.
- Rationale: No button or button-styled link is visible in the first screen, so "What can I do here?" goes unanswered at a glance. [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_metric_no-cta-above-fold_38f017e8 (data/evidence/exp_a2aa965b_desktop_d0.png)

### 7. "Why should I be here and not somewhere else?" has no answer path [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold on the start page — the tagline and welcome blurb carry this burden.
- Rationale: unanswered-question: visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_a2aa965b_desktop_d0.png)

### 8. "What's new?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "What's new?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "What's new?" (information, importance 0.7). None of the 1 discovered states or their links answer it (looked for docs-answers/demo-video). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_latest (data/evidence/exp_a2aa965b_desktop_d0.png)

### 9. "How do I follow along?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How do I follow along?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How do I follow along?" (proposal, importance 0.7). None of the 1 discovered states or their links answer it (looked for next-steps). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_subscribe (data/evidence/exp_a2aa965b_desktop_d0.png)

### 10. "How do I find something specific?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How do I find something specific?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How do I find something specific?" (information, importance 0.6). None of the 1 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_browse (data/evidence/exp_a2aa965b_desktop_d0.png)

### 11. "Who is behind this?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Who is behind this?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Who is behind this?" (information, importance 0.6). None of the 1 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_who-writes (data/evidence/exp_a2aa965b_desktop_d0.png)

### 12. Console errors during browser runs (32) [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Rationale: console-errors: 32 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 429 ()", "console: Connecting to 'data:,' violates the following Content Security Policy directive: "connect-src 'self' https://ha", "console: Fetch API cannot load data:,. Refused to connect because it violates the document's Content Security Policy.". The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts. [reproducible-concern; Do labels and interactions behave predictably?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_console-errors_desktop (data/evidence/run_t0_desktop_0.png, data/evidence/run_t1_desktop_0.png, data/evidence/run_t2_desktop_0.png)

### 13. "How do I get in touch?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How do I get in touch?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How do I get in touch?" (proposal, importance 0.5). None of the 1 discovered states or their links answer it (looked for contact-form). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_contact (data/evidence/exp_a2aa965b_desktop_d0.png)

### 14. "How do I join the community?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How do I join the community?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How do I join the community?" (proposal, importance 0.5). None of the 1 discovered states or their links answer it (looked for signup). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_join (data/evidence/exp_a2aa965b_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "unlocker" (4 of 4 runs)
- Desktop: missing site ID, primary navigation, search (trunk test fails)
- "What can I do here?" has no answer path
- "Where do I start?" has no answer path
- 9 of 10 expected visitor questions have no answer path

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Desktop: no call to action above the fold on the homepage
- "Why should I be here and not somewhere else?" has no answer path
- "What's new?" has no answer path

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
