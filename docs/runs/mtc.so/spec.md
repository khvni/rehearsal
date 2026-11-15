# Rehearsal spec — https://mtc.so/

Goal: find how to join or start a chapter
Generated: 2026-11-15T00:36:07.093Z

## Summary
Rehearsal ran 5 browser runs on https://mtc.so/. It found 1 verified failure and 12 reproducible concerns. 15 findings became 15 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "chapter" (3 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "chapter" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_b67adaad_11 (data/evidence/run_agent-0003_desktop_0.png, data/evidence/run_agent-0003_desktop_3.png, data/evidence/run_agent-0003_desktop_4.png, data/evidence/run_agent-0008_desktop_0.png, data/evidence/run_agent-0008_desktop_3.png, data/evidence/run_agent-0009_desktop_0.png, data/evidence/run_agent-0009_desktop_2.png)

### 2. The page still invites registration for an event that already happened [M]
- Change: Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
- Steps:
  - Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
  - Apply on mtc.so/privacy
- Rationale: "Muslim Tech Collaborative" shows dates in the past (JANUARY 1, 2025) next to apply/register language — visitors are invited to act on something that's over. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Principle: Cut needless words
- Evidence: finding f_4ff2f96a_25 (data/evidence/exp_b693ca3a_desktop_d1.png)

### 3. Too many links compete for attention (11 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on mtc.so/
  - Apply on mtc.so/chapters
  - Apply on mtc.so/studio/labs/project/evi-ai-event-coordinator
  - Apply on mtc.so/studio/labs/project/mtc-studio
  - Apply on mtc.so/sponsor
  - Apply on mtc.so/donate
  - Apply on mtc.so/youth
  - Apply on mtc.so/university
  - …and 3 more affected locations
- Rationale: "Muslim Tech Collaborative" offers 32 different links — too many choices to sort through at a glance. Also: "Muslim Tech Collaborative" offers 29 different links — too many choices to sort through at a glance. "Muslim Tech Collaborative" offers 25 different links — too many choices to sort through at a glance. "Muslim Tech Collaborative" offers 26 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_059daf4b_14

### 4. "Support" takes too many clicks to reach (3 of 15 pages) [S]
- Change: Surface "Support" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Support" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Support" button
  - Apply on mtc.so/about
  - Apply on mtc.so/studio/labs/project/evi-ai-event-coordinator
  - Apply on mtc.so/chapters
- Rationale: "Support" (docs-answers, importance 0.72) sits a median of 5 steps from the start (114/200 journeys reach it; shortest path: → Programs Youth, campus chapters, and a professional network — real builds, at every age. → Support). Past 3 steps the path stops being obvious. Also: "Support" (docs-answers, importance 0.72) sits a median of 4 steps from the start (11/200 journeys reach it; shortest path: evi - AI Event Coordinator startup · web · ai AI-powered event coordinator that lets you plan and run events through sim → Support). Past 3 steps the path stops being obvious. "Support" (docs-answers, importance 0.72) sits a median of 5 steps from the start (121/200 journeys reach it; shortest path: → Chapters Campus and city communities coast to coast — workshops, speakers, and a place to belong in tech. → Support). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_docs-answers_194f29c5

### 5. "Get the guide ↗" takes too many clicks to reach [S]
- Change: Surface "Get the guide ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Get the guide ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Get the guide ↗" link
  - Apply on mtc.so/chapters
- Rationale: "Get the guide ↗" (docs-answers, importance 0.72) sits a median of 5 steps from the start (119/200 journeys reach it; shortest path: 03 Chapters → Get the guide ↗). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_docs-answers_fac57f54

### 6. "Schedule meeting ↗" takes too many clicks to reach [S]
- Change: Surface "Schedule meeting ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Schedule meeting ↗" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Schedule meeting ↗" link
  - Apply on mtc.so/chapters
- Rationale: "Schedule meeting ↗" (schedule-event, importance 0.72) sits a median of 4 steps from the start (136/200 journeys reach it; shortest path: → Chapters Campus and city communities coast to coast — workshops, speakers, and a place to belong in tech. → Schedule meeting ↗). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_schedule-event_d08ed85a

### 7. Visitors can't find an answer to "Why should I be here and not somewhere else?" [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "Why should I be here and not somewhere else?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on mtc.so/
- Rationale: Visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_b693ca3a_desktop_d0.png)

### 8. Visitors can't find an answer to "How much does it cost?" [S]
- Change: Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on mtc.so/
- Rationale: Visitors are likely to ask "How much does it cost?" (quotation, importance 0.75). None of the 15 pages found or their links answer it (looked for pricing). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_cost (data/evidence/exp_b693ca3a_desktop_d0.png)

### 9. The page threw 8 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on mtc.so/
- Rationale: 8 page/console errors across 4 of 4 desktop runs, e.g. "console: Error fetching user data: AuthSessionMissingError: Auth session missing!
    at https://mtc.so/_next/static/chu". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0003_desktop_0.png, data/evidence/run_agent-0003_desktop_3.png, data/evidence/run_agent-0003_desktop_4.png)

### 10. Desktop: the homepage takes 4.14 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on mtc.so/
- Rationale: The homepage is 3725px tall at a 900px viewport — 4.14 screens, roughly 6.2s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_b693ca3a_desktop_d0.png)

### 11. Desktop: primary navigation has 8 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on mtc.so/
  - Apply on mtc.so/chapters
  - Apply on mtc.so/about
  - Apply on mtc.so/studio/labs/project/evi-ai-event-coordinator
  - Apply on mtc.so/studio/labs/project/mtc-studio
  - Apply on mtc.so/studio
  - Apply on mtc.so/sponsor
  - Apply on mtc.so/donate
  - …and 7 more affected locations
- Rationale: The top navigation exposes up to 8 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_b693ca3a_desktop_d0.png, data/evidence/exp_b693ca3a_desktop_d1.png)

### 12. Heading outline is broken: skips h1→h3, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on mtc.so/about
- Rationale: 1 page(s) have a heading outline with skips h1→h3, h2→h4 (h1: "Ourmission."). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_1c5629fe (data/evidence/exp_b693ca3a_desktop_d1.png)

### 13. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on mtc.so/
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_b693ca3a_desktop_d0.png)

### 14. Desktop: a visitor landing here can't find search, you-are-here indicator [S]
- Change: Add search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add search, you-are-here indicator to the persistent header on every page.
  - Apply on mtc.so/chapters
  - Apply on mtc.so/about
  - Apply on mtc.so/studio/labs/project/evi-ai-event-coordinator
  - Apply on mtc.so/studio/labs/project/mtc-studio
  - Apply on mtc.so/studio
  - Apply on mtc.so/sponsor
  - Apply on mtc.so/donate
  - Apply on mtc.so/youth
  - …and 6 more affected locations
- Rationale: On 14 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_b693ca3a_desktop_d1.png)

### 15. 2 of 15 expected visitor questions go unanswered [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?", "Why should I be here and not somewhere else?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?", "Why should I be here and not somewhere else?".
  - Apply on mtc.so/
- Rationale: 13/15 likely visitor questions are answered by the 15 pages found or their endpoints. Unanswered: "Why should I be here and not somewhere else?", "How much does it cost?". [hypothesis; Can the intended outcome be verified?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_b693ca3a_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "chapter" (3 of 4 runs)
- The page still invites registration for an event that already happened

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (11 of 15 pages)
- "Support" takes too many clicks to reach (3 of 15 pages)
- "Get the guide ↗" takes too many clicks to reach

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
