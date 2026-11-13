# Rehearsal spec — https://devpost.com/

Goal: find an upcoming hackathon to join
Generated: 2026-11-13T21:56:46.560Z

## Summary
Rehearsal verified 5 browser runs against https://devpost.com/: 1 verified failure(s), 25 reproducible concern(s). 30 total findings mapped to 30 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "hackathon" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t34_desktop (desktop) failed assertion url-matches on value "hackathon". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_0efd961f_45 (data/evidence/run_t34_desktop_0.png, data/evidence/run_t34_desktop_2.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (JUL 16, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_c1c2ede0_50 (data/evidence/exp_915afb63_desktop_d1.png)

### 3. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (AUG 23, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_286cdc4b_52 (data/evidence/exp_915afb63_desktop_d1.png)

### 4. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (NOV 11, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_565f872e_54 (data/evidence/exp_915afb63_desktop_d1.png)

### 5. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (JUL 16, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_82aabaf1_56 (data/evidence/exp_915afb63_desktop_d1.png)

### 6. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (JUL 16, 2026, NOV 11, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_6dd4f953_58 (data/evidence/exp_915afb63_desktop_d1.png)

### 7. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (NOV 04, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_3c82fe8f_65 (data/evidence/exp_915afb63_desktop_d1.png)

### 8. No pricing endpoint found [M]
- Change: Add a clearly labeled pricing destination and link it from the primary navigation.
- Rationale: missing-endpoint-class: a saas site is expected to expose a pricing endpoint, but none of the 15 discovered states or their links/CTAs classify as pricing. [reproducible-concern; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_missing-endpoint-class_pricing

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 113 distinct links compete for attention on "Devpost - The home for hackathons". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_46d243c5_47

### 10. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 50 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_0e0e180b_48

### 11. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 52 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3e0f0fe9_49

### 12. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 54 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_4b9865c7_51

### 13. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 52 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_5312782d_53

### 14. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_f5f9d1c3_55

### 15. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b24bdfda_57

### 16. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 52 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_63c0cf9e_59

### 17. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_2320b57f_60

### 18. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3d11ade1_61

### 19. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 52 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b23f033c_62

### 20. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_385ad0fd_63

### 21. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_59cee17e_64

### 22. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_627ad40f_66

### 23. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 51 distinct links compete for attention on "New & upcoming hackathons · Devpost". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_21a0dd47_67

### 24. "Is there a free tier or trial?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Is there a free tier or trial?" (quotation, importance 0.8). None of the 15 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_free-tier (data/evidence/exp_915afb63_desktop_d0.png)

### 25. "Can I see it in action?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Can I see it in action?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Can I see it in action?" (information, importance 0.6). None of the 15 discovered states or their links answer it (looked for demo-video). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_demo (data/evidence/exp_915afb63_desktop_d0.png)

### 26. "Does it integrate with my tools?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "Does it integrate with my tools?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "Does it integrate with my tools?" (information, importance 0.6). None of the 15 discovered states or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_integrations (data/evidence/exp_915afb63_desktop_d0.png)

### 27. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h1→h3 (h1: "Devpost is the home for hackathons"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_915afb63_desktop_d0.png)

### 28. Heading outline is broken: skips h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 14 page(s) have a heading outline with skips h1→h4 (h1: "Join the world's best online and in-person hackathons"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_296a5c62 (data/evidence/exp_915afb63_desktop_d1.png)

### 29. Desktop: missing you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (you-are-here indicator) to the persistent header on every page.
- Rationale: On 14 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_915afb63_desktop_d1.png)

### 30. 3 of 13 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?", "Can I see it in action?", "Does it integrate with my tools?".
- Rationale: unanswered-question summary: 10/13 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "Is there a free tier or trial?", "Can I see it in action?", "Does it integrate with my tools?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_915afb63_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "hackathon"
- Post-event page still invites registration
- Post-event page still invites registration
- Post-event page still invites registration
- Post-event page still invites registration
- Post-event page still invites registration
- Post-event page still invites registration
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
