# Rehearsal spec — https://ai.engineer/code/2026

Goal: find the conference schedule
Generated: 2026-11-13T12:00:00.000Z

## Summary
Rehearsal ran 3 browser runs on https://ai.engineer/code/2026. It found 0 verified failures and 5 reproducible concerns. 10 findings became 10 changes.

## Changes (by impact)

### 1. The page still invites registration for an event that already happened [M]
- Change: Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
- Steps:
  - Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
  - Update the "APPLY TO ATTEND" button
  - Update the "Apply through our MCP →" link
  - Apply on ai.engineer/code/2026
- Rationale: "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco" shows dates in the past (NOV 10-12, 2026) next to apply/register language — visitors are invited to act on something that's over. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Principle: Cut needless words
- Evidence: finding f_00000004_0

### 2. Desktop: a visitor landing here can't find site ID, primary navigation, search, you-are-here indicator [M]
- Change: Add site ID, primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add site ID, primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on ai.engineer/code/2026/talks
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_62279188

### 3. Too many links compete for attention [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on ai.engineer/code/2026
- Rationale: "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco" offers 239 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_00000005_1

### 4. Desktop: a visitor landing here can't find site ID [S]
- Change: Add site ID to the persistent header on every page.
- Steps:
  - Add site ID to the persistent header on every page.
  - Apply on ai.engineer/code/2026
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_972a62d2

### 5. Visitors can't find an answer to "How much does it cost?" [S]
- Change: Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on ai.engineer/code/2026
- Rationale: Visitors are likely to ask "How much does it cost?" (quotation, importance 0.75). None of the 2 pages found or their links answer it (looked for pricing). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_cost

### 6. Visitors can't find an answer to "Who gets accepted, and when will I hear back?" [S]
- Change: Decide whether visitors should get an answer to "Who gets accepted, and when will I hear back?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Who gets accepted, and when will I hear back?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on ai.engineer/code/2026
- Rationale: Visitors are likely to ask "Who gets accepted, and when will I hear back?" (proposal, importance 0.7, raised by the site's own copy). None of the 2 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_ctx-apply-criteria

### 7. Desktop: primary navigation has 11 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on ai.engineer/code/2026
- Rationale: The top navigation exposes up to 11 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69

### 8. Visitors can't find an answer to "How do I contact the organizers?" [S]
- Change: Decide whether visitors should get an answer to "How do I contact the organizers?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How do I contact the organizers?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on ai.engineer/code/2026
- Rationale: Visitors are likely to ask "How do I contact the organizers?" (proposal, importance 0.5). None of the 2 pages found or their links answer it (looked for contact-form). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_contact

### 9. Visitors can't find an answer to "How do I get there and where should I stay?" [S]
- Change: Decide whether visitors should get an answer to "How do I get there and where should I stay?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How do I get there and where should I stay?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on ai.engineer/code/2026
- Rationale: Visitors are likely to ask "How do I get there and where should I stay?" (information, importance 0.45, raised by the site's own copy). None of the 2 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_ctx-travel

### 10. 4 of 18 expected visitor questions go unanswered [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?", "Who gets accepted, and when will I hear back?", "How do I contact the organizers?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?", "Who gets accepted, and when will I hear back?", "How do I contact the organizers?".
  - Apply on ai.engineer/code/2026
- Rationale: 14/18 likely visitor questions are answered by the 2 pages found or their endpoints. Unanswered: "How much does it cost?", "Who gets accepted, and when will I hear back?", "How do I contact the organizers?", "How do I get there and where should I stay?". [hypothesis; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-questions-summary

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- The page still invites registration for an event that already happened
- Desktop: a visitor landing here can't find site ID, primary navigation, search, you-are-here indicator

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention
- Desktop: a visitor landing here can't find site ID
- Visitors can't find an answer to "How much does it cost?"

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
