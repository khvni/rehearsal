# Rehearsal spec — https://www.mlh.com/

Goal: find the upcoming hackathon schedule
Generated: 2026-11-15T00:44:07.216Z

## Summary
Rehearsal ran 5 browser runs on https://www.mlh.com/. It found 1 verified failure and 14 reproducible concerns. 17 findings became 17 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "schedule" (4 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "schedule" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_2b1b3f21_73 (data/evidence/run_agent-0001_desktop_0.png, data/evidence/run_agent-0001_desktop_2.png, data/evidence/run_agent-0012_desktop_0.png, data/evidence/run_agent-0012_desktop_2.png, data/evidence/run_agent-0002_desktop_0.png, data/evidence/run_agent-0000_desktop_0.png, data/evidence/run_agent-0000_desktop_3.png)

### 2. No pricing page or link found [M]
- Change: Add a clearly labeled pricing destination and link it from the primary navigation.
- Steps:
  - Add a clearly labeled pricing destination and link it from the primary navigation.
- Rationale: A saas site should offer a pricing destination, but nothing in the 13 pages found leads to one. [reproducible-concern; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_missing-endpoint-class_pricing

### 3. Too many links compete for attention (13 of 13 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on mlh.com/
  - Apply on mlh.com/event-membership
  - Apply on mlh.com/seasons/2027/events
  - Apply on mlh.com/events
  - Apply on mlh.com/signin
  - Apply on mlh.com/seasons/2026/events
  - Apply on mlh.com/events/prizes
  - Apply on mlh.com/brand-guidelines
  - …and 5 more affected locations
- Rationale: "Major League Hacking | Hackathons and Developer Programs | Major League Hacking" offers 43 different links — too many choices to sort through at a glance. Also: "Join the MLH Hackathon Season. | Major League Hacking" offers 37 different links — too many choices to sort through at a glance. "2027 Season Schedule | Major League Hacking" offers 50 different links — too many choices to sort through at a glance. "Sign In - MLH | Major League Hacking" offers 26 different links — too many choices to sort through at a glance. "2026 Season Schedule | Major League Hacking" offers 51 different links — too many choices to sort through at a glance. "Upcoming Hackathon Prizes | Major League Hacking" offers 50 different links — too many choices to sort through at a glance. "Major League Hacking | Major League Hacking" offers 36 different links — too many choices to sort through at a glance. "Contact Us | Major League Hacking" offers 30 different links — too many choices to sort through at a glance. "Privacy Policy | Major League Hacking" offers 28 different links — too many choices to sort through at a glance. "Terms of Service | Major League Hacking" offers 29 different links — too many choices to sort through at a glance. "Hardware | Major League Hacking" offers 76 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_3973b971_77

### 4. "Apply" takes too many clicks to reach [S]
- Change: Surface "Apply" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Apply" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Apply" link
  - Apply on mlh.com/signin
- Rationale: "Apply" (signup, importance 0.77) sits a median of 5 steps from the start (132/200 journeys reach it; shortest path: Sign In → Apply). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_signup_14cc8b1c

### 5. "Sign Up" takes too many clicks to reach [S]
- Change: Surface "Sign Up" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Sign Up" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Sign Up" link
  - Apply on mlh.com/signin
  - Apply on mlh.com/signup
- Rationale: "Sign Up" (signup, importance 0.77) sits a median of 5 steps from the start (67/200 journeys reach it; shortest path: Sign In → Sign Up). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_signup_e8ed7c27

### 6. Desktop: the homepage takes 9.34 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on mlh.com/
- Rationale: The homepage is 8408px tall at a 900px viewport — 9.34 screens, roughly 14s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_7f83d644_desktop_d0.png)

### 7. Desktop: no call to action above the fold on the homepage [S]
- Change: Place one clearly styled primary action in the first screen.
- Steps:
  - Place one clearly styled primary action in the first screen.
  - Apply on mlh.com/
- Rationale: No button or button-styled link is visible in the first screen, so "What can I do here?" goes unanswered at a glance. [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_metric_no-cta-above-fold_38f017e8 (data/evidence/exp_7f83d644_desktop_d0.png)

### 8. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on mlh.com/events/prizes
- Rationale: 8 above-the-fold actions are equally prominent by size ("Read more about Build Your Hackathon A-Team with SpaceXSI", "Read more about Best Use of Gemini API", "Read more about Best Use of ElevenLabs", "Read more about Best Use of Entire", "Read more about Best Use of Solana", "Read more about Best Use of Tiger Data", "Read more about Best Use of Mastra", "Read more about Best Use of Gen AI") on "Upcoming Hackathon Prizes | Major League Hacking", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_7f83d644_desktop_d1.png)

### 9. Visitors can't find an answer to "Is there a free tier or trial?" [S]
- Change: Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Is there a free tier or trial?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on mlh.com/
- Rationale: Visitors are likely to ask "Is there a free tier or trial?" (quotation, importance 0.8). None of the 13 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_free-tier (data/evidence/exp_7f83d644_desktop_d0.png)

### 10. The page threw 2 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on mlh.com/
- Rationale: 2 page/console errors across 2 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 400 ()". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0001_desktop_0.png, data/evidence/run_agent-0001_desktop_2.png, data/evidence/run_agent-0012_desktop_0.png)

### 11. Desktop: primary navigation has 8 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on mlh.com/
  - Apply on mlh.com/event-membership
  - Apply on mlh.com/seasons/2027/events
  - Apply on mlh.com/events
  - Apply on mlh.com/signin
  - Apply on mlh.com/seasons/2026/events
  - Apply on mlh.com/brand-guidelines
  - Apply on mlh.com/contact
  - …and 3 more affected locations
- Rationale: The top navigation exposes up to 8 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_7f83d644_desktop_d0.png, data/evidence/exp_7f83d644_desktop_d1.png, data/evidence/exp_7f83d644_desktop_d2.png)

### 12. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on mlh.com/
- Rationale: 1 page(s) have a heading outline with skips h1→h3 (h1: "The World's Largest Developer Community"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_7f83d644_desktop_d0.png)

### 13. Desktop: largest text on the page is not the h1 [S]
- Change: Make the page's h1 the most prominent text, or promote the largest text to be the h1.
- Steps:
  - Make the page's h1 the most prominent text, or promote the largest text to be the h1.
  - Apply on mlh.com/
- Rationale: On 1 page(s) some other text renders larger than the h1, so visual prominence doesn't match importance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_hierarchy-mismatch_ffa615dc (data/evidence/exp_7f83d644_desktop_d0.png)

### 14. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on mlh.com/
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_7f83d644_desktop_d0.png)

### 15. Desktop: a visitor landing here can't find search, you-are-here indicator [S]
- Change: Add search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add search, you-are-here indicator to the persistent header on every page.
  - Apply on mlh.com/event-membership
  - Apply on mlh.com/signin
  - Apply on mlh.com/events/prizes
  - Apply on mlh.com/brand-guidelines
  - Apply on mlh.com/contact
  - Apply on mlh.com/privacy
  - Apply on mlh.com/terms
  - Apply on mlh.com/signup
  - …and 1 more affected location
- Rationale: On 9 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_7f83d644_desktop_d1.png, data/evidence/exp_7f83d644_desktop_d2.png)

### 16. Desktop: a visitor landing here can't find you-are-here indicator [S]
- Change: Add you-are-here indicator to the persistent header on every page.
- Steps:
  - Add you-are-here indicator to the persistent header on every page.
  - Apply on mlh.com/seasons/2027/events
  - Apply on mlh.com/events
  - Apply on mlh.com/seasons/2026/events
- Rationale: On 3 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_7f83d644_desktop_d1.png)

### 17. 1 of 14 expected visitor questions go unanswered [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "Is there a free tier or trial?".
  - Apply on mlh.com/
- Rationale: 13/14 likely visitor questions are answered by the 13 pages found or their endpoints. Unanswered: "Is there a free tier or trial?". [hypothesis; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_7f83d644_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "schedule" (4 of 4 runs)
- No pricing page or link found

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (13 of 13 pages)
- "Apply" takes too many clicks to reach
- "Sign Up" takes too many clicks to reach

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
