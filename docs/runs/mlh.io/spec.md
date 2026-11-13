# Rehearsal spec — https://www.mlh.com/

Goal: find the upcoming hackathon schedule
Generated: 2026-11-13T21:58:12.572Z

## Summary
Rehearsal verified 5 browser runs against https://www.mlh.com/: 1 verified failure(s), 25 reproducible concern(s). 28 total findings mapped to 28 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "schedule" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t113_desktop (desktop) failed assertion url-matches on value "schedule". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_8637c840_68 (data/evidence/run_t113_desktop_0.png, data/evidence/run_t113_desktop_3.png, data/evidence/run_t113_desktop_5.png)

### 2. No pricing endpoint found [M]
- Change: Add a clearly labeled pricing destination and link it from the primary navigation.
- Rationale: missing-endpoint-class: a saas site is expected to expose a pricing endpoint, but none of the 13 discovered states or their links/CTAs classify as pricing. [reproducible-concern; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_missing-endpoint-class_pricing

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 43 distinct links compete for attention on "Major League Hacking | Hackathons and Developer Programs | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_6d4ad185_72

### 4. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 37 distinct links compete for attention on "Join the MLH Hackathon Season. | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_778068bd_73

### 5. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 50 distinct links compete for attention on "2027 Season Schedule | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_db4ede32_74

### 6. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 50 distinct links compete for attention on "2027 Season Schedule | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_67f086ce_75

### 7. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 26 distinct links compete for attention on "Sign In - MLH | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_9d6e367e_76

### 8. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "2026 Season Schedule | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_8e498cfc_77

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 50 distinct links compete for attention on "Upcoming Hackathon Prizes | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_2e0b667e_78

### 10. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 36 distinct links compete for attention on "Major League Hacking | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b129741e_79

### 11. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 30 distinct links compete for attention on "Contact Us | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_77f1fa19_80

### 12. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 28 distinct links compete for attention on "Privacy Policy | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_351f3e82_81

### 13. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 29 distinct links compete for attention on "Terms of Service | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_5d12be6e_82

### 14. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 26 distinct links compete for attention on "Sign In - MLH | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_25b2b288_83

### 15. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 76 distinct links compete for attention on "Hardware | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_551a3060_84

### 16. Endpoint buried: signup "Apply" [S]
- Change: Surface "Apply" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Apply" (signup, weight 0.77) takes a median of 5 steps across 132/200 reaching journeys (shortest: Sign In → Apply). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_signup_14cc8b1c

### 17. Endpoint buried: signup "Sign Up" [S]
- Change: Surface "Sign Up" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Sign Up" (signup, weight 0.77) takes a median of 5 steps across 67/200 reaching journeys (shortest: Sign In → Sign Up). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_signup_e8ed7c27

### 18. Desktop: homepage requires 9.34 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 8408px tall at a 900px viewport — 9.34 screens, roughly 14s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_86508da3_desktop_d0.png)

### 19. Desktop: no call to action above the fold on the homepage [S]
- Change: Place one clearly styled primary action in the first screen.
- Rationale: No button or button-styled link is visible in the first screen, so "What can I do here?" goes unanswered at a glance. [reproducible-concern; Is the purpose of the page immediately apparent?]
- Krug principle: homepage
- Evidence: finding f_metric_no-cta-above-fold_38f017e8 (data/evidence/exp_86508da3_desktop_d0.png)

### 20. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 8 above-the-fold actions are equally prominent by size ("Read more about Build Your Hackathon A-Team with SpaceXSI", "Read more about Best Use of Gemini API", "Read more about Best Use of ElevenLabs", "Read more about Best Use of Entire", "Read more about Best Use of Solana", "Read more about Best Use of Tiger Data", "Read more about Best Use of Mastra", "Read more about Best Use of Gen AI") on "Upcoming Hackathon Prizes | Major League Hacking", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_86508da3_desktop_d1.png)

### 21. "Is there a free tier or trial?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Is there a free tier or trial?" (quotation, importance 0.8). None of the 13 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_free-tier (data/evidence/exp_86508da3_desktop_d0.png)

### 22. Desktop: primary navigation has 8 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 8 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_86508da3_desktop_d0.png, data/evidence/exp_86508da3_desktop_d1.png, data/evidence/exp_86508da3_desktop_d2.png)

### 23. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h3 (h1: "The World's Largest Developer Community"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_86508da3_desktop_d0.png)

### 24. Desktop: largest text on the page is not the h1 [S]
- Change: Make the page's h1 the most prominent text, or promote the largest text to be the h1.
- Rationale: On 1 page(s) some other text renders larger than the h1, so visual prominence doesn't match importance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_hierarchy-mismatch_ffa615dc (data/evidence/exp_86508da3_desktop_d0.png)

### 25. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_86508da3_desktop_d0.png)

### 26. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 9 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_86508da3_desktop_d1.png, data/evidence/exp_86508da3_desktop_d2.png)

### 27. Desktop: missing you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (you-are-here indicator) to the persistent header on every page.
- Rationale: On 3 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_86508da3_desktop_d1.png)

### 28. 1 of 14 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?".
- Rationale: unanswered-question summary: 13/14 likely visitor questions are answered by the 13 discovered states or their endpoints. Unanswered: "Is there a free tier or trial?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_86508da3_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "schedule"
- No pricing endpoint found

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
