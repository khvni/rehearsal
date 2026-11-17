# Rehearsal spec — https://rehearsal.alikhani.co/

## Interpretation limits

This is the raw baseline output from a small, fixture-backed local run, not a validated UX diagnosis. Discovery captured the homepage and mockup gallery at desktop and mobile sizes. The generic `url-matches: result` assertion does not describe Rehearsal's actual routes; its failures are not evidence that a visitor cannot open a result. The event-oriented visitor questions also misclassify this product, likely influenced by the old homepage's prefilled event URL. Do not treat the generated evidence labels below as independently verified findings.

The redesign uses the observed starting-page problems: an unrelated prefilled URL, little explanation of the output, and weak guidance for choosing a visitor goal. It does not add search or event information just because this generated report recommends them. The separate live Worker self-review failed at discovery with a non-HTML response and yielded no UX findings.

Goal: Understand what Rehearsal produces and find an example result
Generated: 2026-11-17T00:50:03.507Z

## Summary
Rehearsal ran 4 browser runs on https://rehearsal.alikhani.co/. It found 1 verified failure and 8 reproducible concerns. 18 findings became 18 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "result" (3 of 3 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "result" — what the check expected isn't what a visitor gets. Also: In the mobile browser run, the URL didn't match "result" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_48830c22_0 (data/evidence/run_agent-0001_desktop_0.png, data/evidence/run_agent-0001_desktop_3.png, data/evidence/run_agent-0001_mobile_0.png, data/evidence/run_agent-0001_mobile_3.png, data/evidence/run_agent-0000_desktop_0.png, data/evidence/run_agent-0000_desktop_2.png)

### 2. Desktop: a visitor landing here can't find site ID, primary navigation, search [M]
- Change: Add site ID, primary navigation, search to the persistent header on every page.
- Steps:
  - Add site ID, primary navigation, search to the persistent header on every page.
  - Apply on rehearsal.alikhani.co/
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, primary navigation, search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_4fcd36c3 (data/evidence/exp_bd74576f_desktop_d0.png)

### 3. Desktop: a visitor landing here can't find site ID, primary navigation, search, you-are-here indicator [M]
- Change: Add site ID, primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add site ID, primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on rehearsal.alikhani.co/mockups
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_62279188 (data/evidence/exp_bd74576f_desktop_d1.png)

### 4. Mobile: a visitor landing here can't find site ID, primary navigation, search [M]
- Change: Add site ID, primary navigation, search to the persistent header on every page.
- Steps:
  - Add site ID, primary navigation, search to the persistent header on every page.
  - Apply on rehearsal.alikhani.co/
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, primary navigation, search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_24903ff5 (data/evidence/exp_bd74576f_mobile_d0.png)

### 5. Mobile: a visitor landing here can't find site ID, primary navigation, search, you-are-here indicator [M]
- Change: Add site ID, primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add site ID, primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on rehearsal.alikhani.co/mockups
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_7feb3189 (data/evidence/exp_bd74576f_mobile_d1.png)

### 6. Visitors can't find an answer to "What is this event?" [M]
- Change: Answer "What is this event?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "What is this event?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "What is this event?" (information, importance 1). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-what (data/evidence/exp_bd74576f_desktop_d0.png)

### 7. Visitors can't find an answer to "What can I do here?" [M]
- Change: Answer "What can I do here?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "What can I do here?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "What can I do here?" (proposal, importance 0.9). The start page doesn't answer it (looked for signup/contact-form/next-steps/download/schedule-event/pricing/demo-video/docs-answers). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-do (data/evidence/exp_bd74576f_desktop_d0.png)

### 8. Visitors can't find an answer to "Where do I start?" [M]
- Change: Answer "Where do I start?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "Where do I start?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "Where do I start?" (proposal, importance 0.9). The start page doesn't answer it (looked for signup). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-start (data/evidence/exp_bd74576f_desktop_d0.png)

### 9. Visitors can't find an answer to "When and where is it?" [M]
- Change: Decide whether visitors should get an answer to "When and where is it?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "When and where is it?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "When and where is it?" (information, importance 1). None of the 4 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_when-where (data/evidence/exp_bd74576f_desktop_d0.png)

### 10. 12 of 15 expected visitor questions go unanswered [M]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "What is this event?", "When and where is it?", "What can I do here?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "What is this event?", "When and where is it?", "What can I do here?".
  - Apply on rehearsal.alikhani.co/
- Rationale: 3/15 likely visitor questions are answered by the 4 pages found or their endpoints. Unanswered: "What is this event?", "What can I do here?", "Where do I start?", "Why should I be here and not somewhere else?", "When and where is it?", "Who is speaking?", "How much does it cost?", "Is it in person or online?", "Who is it for?", "How do I contact the organizers?", "Where are the answers to common questions?", "How do I sponsor or partner?". [hypothesis; Can the intended outcome be verified?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_bd74576f_desktop_d0.png)

### 11. Visitors can't find an answer to "Why should I be here and not somewhere else?" [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "Why should I be here and not somewhere else?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_bd74576f_desktop_d0.png)

### 12. Visitors can't find an answer to "Who is speaking?" [S]
- Change: Decide whether visitors should get an answer to "Who is speaking?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Who is speaking?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "Who is speaking?" (information, importance 0.8). None of the 4 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_speakers (data/evidence/exp_bd74576f_desktop_d0.png)

### 13. Visitors can't find an answer to "How much does it cost?" [S]
- Change: Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "How much does it cost?" (quotation, importance 0.75). None of the 4 pages found or their links answer it (looked for pricing). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_cost (data/evidence/exp_bd74576f_desktop_d0.png)

### 14. Visitors can't find an answer to "Is it in person or online?" [S]
- Change: Decide whether visitors should get an answer to "Is it in person or online?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Is it in person or online?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "Is it in person or online?" (information, importance 0.6). None of the 4 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_format (data/evidence/exp_bd74576f_desktop_d0.png)

### 15. Visitors can't find an answer to "Who is it for?" [S]
- Change: Decide whether visitors should get an answer to "Who is it for?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Who is it for?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "Who is it for?" (information, importance 0.6). None of the 4 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_who-for (data/evidence/exp_bd74576f_desktop_d0.png)

### 16. Visitors can't find an answer to "How do I contact the organizers?" [S]
- Change: Decide whether visitors should get an answer to "How do I contact the organizers?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How do I contact the organizers?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "How do I contact the organizers?" (proposal, importance 0.5). None of the 4 pages found or their links answer it (looked for contact-form). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_contact (data/evidence/exp_bd74576f_desktop_d0.png)

### 17. Visitors can't find an answer to "Where are the answers to common questions?" [S]
- Change: Decide whether visitors should get an answer to "Where are the answers to common questions?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Where are the answers to common questions?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "Where are the answers to common questions?" (information, importance 0.5). None of the 4 pages found or their links answer it (looked for docs-answers). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_faq (data/evidence/exp_bd74576f_desktop_d0.png)

### 18. Visitors can't find an answer to "How do I sponsor or partner?" [S]
- Change: Decide whether visitors should get an answer to "How do I sponsor or partner?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How do I sponsor or partner?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on rehearsal.alikhani.co/
- Rationale: Visitors are likely to ask "How do I sponsor or partner?" (proposal, importance 0.4). None of the 4 pages found or their links answer it (looked for contact-form). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_sponsor (data/evidence/exp_bd74576f_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "result" (3 of 3 runs)
- Desktop: a visitor landing here can't find site ID, primary navigation, search
- Desktop: a visitor landing here can't find site ID, primary navigation, search, you-are-here indicator
- Mobile: a visitor landing here can't find site ID, primary navigation, search
- Mobile: a visitor landing here can't find site ID, primary navigation, search, you-are-here indicator
- Visitors can't find an answer to "What is this event?"
- Visitors can't find an answer to "What can I do here?"
- Visitors can't find an answer to "Where do I start?"
- Visitors can't find an answer to "When and where is it?"
- 12 of 15 expected visitor questions go unanswered

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Visitors can't find an answer to "Why should I be here and not somewhere else?"
- Visitors can't find an answer to "Who is speaking?"
- Visitors can't find an answer to "How much does it cost?"

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
