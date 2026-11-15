# Rehearsal spec — https://devpost.com/

Goal: find an upcoming hackathon to join
Generated: 2026-11-15T00:42:04.834Z

## Summary
Rehearsal ran 5 browser runs on https://devpost.com/. It found 1 verified failure and 7 reproducible concerns. 12 findings became 12 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "hackathon" (2 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "hackathon" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_cab976ba_45 (data/evidence/run_agent-0002_desktop_0.png, data/evidence/run_agent-0003_desktop_0.png)

### 2. The page still invites registration for an event that already happened (11 of 15 pages) [M]
- Change: Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
- Steps:
  - Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
  - Apply on devpost.com/hackathons
- Rationale: "New & upcoming hackathons · Devpost" shows dates in the past (NOV 11, 2026) next to apply/register language — visitors are invited to act on something that's over. Also: "New & upcoming hackathons · Devpost" shows dates in the past (AUG 23, 2026) next to apply/register language — visitors are invited to act on something that's over. "New & upcoming hackathons · Devpost" shows dates in the past (JUL 16, 2026) next to apply/register language — visitors are invited to act on something that's over. "New & upcoming hackathons · Devpost" shows dates in the past (NOV 11, 2026, JUL 16, 2026, NOV 12 - 14, 2026) next to apply/register language — visitors are invited to act on something that's over. "New & upcoming hackathons · Devpost" shows dates in the past (NOV 12 - 14, 2026) next to apply/register language — visitors are invited to act on something that's over. "New & upcoming hackathons · Devpost" shows dates in the past (NOV 14, 2026) next to apply/register language — visitors are invited to act on something that's over. "New & upcoming hackathons · Devpost" shows dates in the past (NOV 04, 2026) next to apply/register language — visitors are invited to act on something that's over. "New & upcoming hackathons · Devpost" shows dates in the past (AUG 31, 2026) next to apply/register language — visitors are invited to act on something that's over. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Principle: Cut needless words
- Evidence: finding f_6cdfdc5f_50 (data/evidence/exp_63d40134_desktop_d1.png)

### 3. No pricing page or link found [M]
- Change: Add a clearly labeled pricing destination and link it from the primary navigation.
- Steps:
  - Add a clearly labeled pricing destination and link it from the primary navigation.
- Rationale: A saas site should offer a pricing destination, but nothing in the 15 pages found leads to one. [reproducible-concern; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_missing-endpoint-class_pricing

### 4. Too many links compete for attention (15 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on devpost.com/
  - Apply on devpost.com/hackathons
- Rationale: "Devpost - The home for hackathons" offers 113 different links — too many choices to sort through at a glance. Also: "New & upcoming hackathons · Devpost" offers 50 different links — too many choices to sort through at a glance. "New & upcoming hackathons · Devpost" offers 51 different links — too many choices to sort through at a glance. "New & upcoming hackathons · Devpost" offers 53 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_4e5e89fa_47

### 5. Visitors can't find an answer to "Is there a free tier or trial?" [S]
- Change: Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on devpost.com/
- Rationale: Visitors are likely to ask "Is there a free tier or trial?" (quotation, importance 0.8). None of the 15 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_free-tier (data/evidence/exp_63d40134_desktop_d0.png)

### 6. Visitors can't find an answer to "Can I see it in action?" [S]
- Change: Decide whether visitors should get an answer to "Can I see it in action?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Can I see it in action?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on devpost.com/
- Rationale: Visitors are likely to ask "Can I see it in action?" (information, importance 0.6). None of the 15 pages found or their links answer it (looked for demo-video). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_demo (data/evidence/exp_63d40134_desktop_d0.png)

### 7. Visitors can't find an answer to "Does it integrate with my tools?" [S]
- Change: Decide whether visitors should get an answer to "Does it integrate with my tools?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Does it integrate with my tools?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on devpost.com/
- Rationale: Visitors are likely to ask "Does it integrate with my tools?" (information, importance 0.6). None of the 15 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_integrations (data/evidence/exp_63d40134_desktop_d0.png)

### 8. The page threw 2 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on devpost.com/
- Rationale: 2 page/console errors across 2 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 403 ()". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0000_desktop_0.png, data/evidence/run_agent-0000_desktop_1.png, data/evidence/run_agent-0001_desktop_0.png)

### 9. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on devpost.com/
- Rationale: 1 page(s) have a heading outline with skips h1→h3 (h1: "Devpost is the home for hackathons"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_63d40134_desktop_d0.png)

### 10. Heading outline is broken: skips h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on devpost.com/hackathons
- Rationale: 14 page(s) have a heading outline with skips h1→h4 (h1: "Join the world's best online and in-person hackathons"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_296a5c62 (data/evidence/exp_63d40134_desktop_d1.png)

### 11. Desktop: a visitor landing here can't find you-are-here indicator [S]
- Change: Add you-are-here indicator to the persistent header on every page.
- Steps:
  - Add you-are-here indicator to the persistent header on every page.
  - Apply on devpost.com/hackathons
- Rationale: On 14 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_63d40134_desktop_d1.png)

### 12. 3 of 14 expected visitor questions go unanswered [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?", "Can I see it in action?", "Does it integrate with my tools?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?", "Can I see it in action?", "Does it integrate with my tools?".
  - Apply on devpost.com/
- Rationale: 11/14 likely visitor questions are answered by the 15 pages found or their endpoints. Unanswered: "Is there a free tier or trial?", "Can I see it in action?", "Does it integrate with my tools?". [hypothesis; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_63d40134_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "hackathon" (2 of 4 runs)
- The page still invites registration for an event that already happened (11 of 15 pages)
- No pricing page or link found

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (15 of 15 pages)
- Visitors can't find an answer to "Is there a free tier or trial?"
- Visitors can't find an answer to "Can I see it in action?"

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
