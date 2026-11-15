# Rehearsal spec — https://sentry.io/welcome/

Goal: find pricing and start a trial
Generated: 2026-11-15T00:47:45.736Z

## Summary
Rehearsal ran 5 browser runs on https://sentry.io/welcome/. It found 1 verified failure and 17 reproducible concerns. 19 findings became 19 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "trial" (4 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "trial" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_5b175b30_104 (data/evidence/run_agent-0014_desktop_0.png, data/evidence/run_agent-0014_desktop_2.png, data/evidence/run_agent-0018_desktop_0.png, data/evidence/run_agent-0018_desktop_3.png, data/evidence/run_agent-0002_desktop_0.png, data/evidence/run_agent-0007_desktop_0.png, data/evidence/run_agent-0007_desktop_3.png)

### 2. Desktop: a visitor landing here can't find page name, search, you-are-here indicator [M]
- Change: Add page name, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add page name, search, you-are-here indicator to the persistent header on every page.
  - Apply on sentry.io/for/startups
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_869a8c38 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 3. Visitors can't find an answer to "What does it do?" [M]
- Change: Answer "What does it do?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "What does it do?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on sentry.io/welcome
- Rationale: Visitors are likely to ask "What does it do?" (information, importance 1). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-what (data/evidence/exp_c44fbb80_desktop_d0.png)

### 4. Too many links compete for attention (15 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on sentry.io/welcome
  - Apply on sentry.io/for/startups
  - Apply on sentry.io/pricing
  - Apply on sentry.io/signup
  - Apply on sentry.io/product/error-monitoring
  - Apply on sentry.io/product/logs
  - Apply on sentry.io/product/seer
  - Apply on sentry.io/product/seer/agent
  - …and 7 more affected locations
- Rationale: "Application Performance Monitoring & Error Tracking Software | Sentry" offers 89 different links — too many choices to sort through at a glance. Also: "Sentry for Startups - Terminal | Sentry" offers 50 different links — too many choices to sort through at a glance. "Pricing: Free Developer Plan, Pay as You Grow | Sentry" offers 95 different links — too many choices to sort through at a glance. "Start your free trial | Unlimited events 14 days | Sentry" offers 60 different links — too many choices to sort through at a glance. "Error Monitoring Software | Sentry" offers 103 different links — too many choices to sort through at a glance. "Structured Logging Connected to Errors and Traces | Sentry" offers 92 different links — too many choices to sort through at a glance. "Seer: Debug faster at every stage of development | Sentry" offers 94 different links — too many choices to sort through at a glance. "Seer Agent | Sentry" offers 70 different links — too many choices to sort through at a glance. "Seer Autofix | Sentry" offers 74 different links — too many choices to sort through at a glance. "Session Replay: See What Users See, Fix What Broke | Sentry" offers 130 different links — too many choices to sort through at a glance. "Application Metrics — Trace-Connected and High-Cardinality | Sentry" offers 82 different links — too many choices to sort through at a glance. "Distributed Tracing | Monitor Performance Across Services | Sentry" offers 107 different links — too many choices to sort through at a glance. "Agent Tracing: See Every Step of Your AI Agent Run | Sentry" offers 99 different links — too many choices to sort through at a glance. "Continuous Profiling for Backend and Mobile Application Performance Issues | Sentry" offers 86 different links — too many choices to sort through at a glance. "Size Analysis | Sentry" offers 75 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_838179c1_108

### 5. 3 link labels don't say where they go (3 of 15 pages) [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Read More" link
  - Update the "read more" link
  - Update the "Learn more" link
  - Update the "Read more" link
  - Update the "Learn More" link
  - Update the "here" link
  - Apply on sentry.io/product/seer
  - Apply on sentry.io/product/session-replay
  - Apply on sentry.io/product/profiling
- Rationale: Labels like "Read More", "Read More", "read more" make visitors guess — they have to click to find out where the link leads. Also: Labels like "Learn more", "Read more", "Read more" make visitors guess — they have to click to find out where the link leads. Labels like "Read More", "Learn More", "here" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_979db674_114 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 6. 2 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn More" link
  - Update the "Learn more" link
  - Apply on sentry.io/product/tracing
- Rationale: Labels like "Learn More", "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_47fa4138_121 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 7. 1 link label doesn't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn More" link
  - Apply on sentry.io/product/size-analysis
- Rationale: Labels like "Learn More" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_66551492_126 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 8. "See pricing" takes too many clicks to reach [S]
- Change: Surface "See pricing" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "See pricing" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "See pricing" link
  - Apply on sentry.io/pricing
- Rationale: "See pricing" (pricing, importance 0.9) sits a median of 4 steps from the start (184/200 journeys reach it; shortest path: Pricing → See pricing). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_pricing_aa7b9f0c

### 9. Desktop: the homepage takes 9.79 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on sentry.io/welcome
- Rationale: The homepage is 8809px tall at a 900px viewport — 9.79 screens, roughly 14.7s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_c44fbb80_desktop_d0.png)

### 10. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on sentry.io/pricing
  - Apply on sentry.io/product/seer
- Rationale: 4 above-the-fold actions are equally prominent by size ("START TRIAL", "START TRIAL", "START TRIAL", "CONTACT SALES") on "Pricing: Free Developer Plan, Pay as You Grow | Sentry", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_c44fbb80_desktop_d1.png)

### 11. Visitors can't find an answer to "Why should I be here and not somewhere else?" [S]
- Change: Answer "Why should I be here and not somewhere else?" above the fold — the tagline and welcome blurb are the first things visitors read.
- Steps:
  - Answer "Why should I be here and not somewhere else?" above the fold — the tagline and welcome blurb are the first things visitors read.
  - Apply on sentry.io/welcome
- Rationale: Visitors are likely to ask "Why should I be here and not somewhere else?" (information, importance 0.7). The start page doesn't answer it (looked for matching copy). [reproducible-concern; Is the purpose of the page immediately apparent?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-question_hp-why (data/evidence/exp_c44fbb80_desktop_d0.png)

### 12. The page threw 4 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on sentry.io/welcome
- Rationale: 4 page/console errors across 4 of 4 desktop runs, e.g. "console: requestStorageAccess: Permission denied.". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0014_desktop_0.png, data/evidence/run_agent-0014_desktop_2.png, data/evidence/run_agent-0018_desktop_0.png)

### 13. Desktop: primary navigation has 9 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on sentry.io/welcome
  - Apply on sentry.io/for/startups
  - Apply on sentry.io/pricing
  - Apply on sentry.io/signup
  - Apply on sentry.io/product/error-monitoring
  - Apply on sentry.io/product/logs
  - Apply on sentry.io/product/seer
  - Apply on sentry.io/product/seer/agent
  - …and 7 more affected locations
- Rationale: The top navigation exposes up to 9 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_c44fbb80_desktop_d0.png, data/evidence/exp_c44fbb80_desktop_d1.png)

### 14. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on sentry.io/for/startups
- Rationale: 1 page(s) have a heading outline with no h1. Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 15. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on sentry.io/pricing
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Pricing plans for dev teams of all sizes"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_c44fbb80_desktop_d1.png)

### 16. Heading outline is broken: skips h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on sentry.io/signup
- Rationale: 1 page(s) have a heading outline with skips h1→h4 (h1: "Start fixing"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_296a5c62 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 17. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on sentry.io/welcome
  - Apply on sentry.io/product/error-monitoring
- Rationale: On 2 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_c44fbb80_desktop_d0.png, data/evidence/exp_c44fbb80_desktop_d1.png)

### 18. Desktop: a visitor landing here can't find search, you-are-here indicator [S]
- Change: Add search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add search, you-are-here indicator to the persistent header on every page.
  - Apply on sentry.io/pricing
  - Apply on sentry.io/signup
  - Apply on sentry.io/product/logs
  - Apply on sentry.io/product/seer
  - Apply on sentry.io/product/seer/agent
  - Apply on sentry.io/product/seer/autofix
  - Apply on sentry.io/product/session-replay
  - Apply on sentry.io/product/metrics
  - …and 4 more affected locations
- Rationale: On 12 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_c44fbb80_desktop_d1.png)

### 19. 2 of 15 expected visitor questions go unanswered [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "What does it do?", "Why should I be here and not somewhere else?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "What does it do?", "Why should I be here and not somewhere else?".
  - Apply on sentry.io/welcome
- Rationale: 13/15 likely visitor questions are answered by the 15 pages found or their endpoints. Unanswered: "What does it do?", "Why should I be here and not somewhere else?". [hypothesis; Can the intended outcome be verified?]
- Principle: The homepage explains itself
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_c44fbb80_desktop_d0.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "trial" (4 of 4 runs)
- Desktop: a visitor landing here can't find page name, search, you-are-here indicator
- Visitors can't find an answer to "What does it do?"

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (15 of 15 pages)
- 3 link labels don't say where they go (3 of 15 pages)
- 2 link labels don't say where they go

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
