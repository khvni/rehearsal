# Rehearsal spec — https://www.snowflake.com/en/

Goal: start a free trial
Generated: 2026-11-15T00:49:34.528Z

## Summary
Rehearsal ran 5 browser runs on https://www.snowflake.com/en/. It found 1 verified failure and 21 reproducible concerns. 22 findings became 22 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "trial" (4 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "trial" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_bb87d2d4_128 (data/evidence/run_agent-0004_desktop_0.png, data/evidence/run_agent-0004_desktop_1.png, data/evidence/run_agent-0006_desktop_0.png, data/evidence/run_agent-0006_desktop_1.png, data/evidence/run_agent-0008_desktop_0.png, data/evidence/run_agent-0008_desktop_1.png, data/evidence/run_agent-0011_desktop_0.png, data/evidence/run_agent-0011_desktop_1.png)

### 2. The page still invites registration for an event that already happened (2 of 15 pages) [M]
- Change: Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
- Steps:
  - Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
  - Update the "Event The Startup Challenge 2027 Register now" link
  - Update the "Webinar Snowflake AI Pulse: Latest Features & Releases Regis…" link
  - Update the "Apply" button
  - Apply on snowflake.com/en
  - Apply on snowflake.com/en/blog/expedition-26
- Rationale: "Snowflake AI Data Cloud" shows dates in the past (JULY 31, 2025) next to apply/register language — visitors are invited to act on something that's over. Also: "Expedition 26: Launches, AI News and Recaps | Snowflake" shows dates in the past (NOV 3, 2026, NOV 12, 2026, NOV 10, 2026, NOV 9, 2026) next to apply/register language — visitors are invited to act on something that's over. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Principle: Cut needless words
- Evidence: finding f_537c14fa_132 (data/evidence/exp_9050c955_desktop_d0.png, data/evidence/exp_9050c955_desktop_d1.png)

### 3. Desktop: a visitor landing here can't find primary navigation, search, you-are-here indicator [M]
- Change: Add primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on snowflake.com/en/expedition
- Rationale: On 1 page(s) a visitor dropped in cold can't find: primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_f32dafdf (data/evidence/exp_9050c955_desktop_d1.png)

### 4. Too many links compete for attention (15 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on snowflake.com/en
  - Apply on snowflake.com/en/startup-challenge
  - Apply on snowflake.com/en/expedition
  - Apply on snowflake.com/en/pricing-options
  - Apply on snowflake.com/ja
  - Apply on snowflake.com/ko
  - Apply on snowflake.com/zh_cn
  - Apply on snowflake.com/pt_br
  - …and 7 more affected locations
- Rationale: "Snowflake AI Data Cloud" offers 110 different links — too many choices to sort through at a glance. Also: "Snowflake Startup Challenge" offers 73 different links — too many choices to sort through at a glance. "Expedition" offers 39 different links — too many choices to sort through at a glance. "Snowflake Pricing | Choose the Right Edition for Your Data Needs" offers 82 different links — too many choices to sort through at a glance. "Snowflake AIデータクラウド" offers 105 different links — too many choices to sort through at a glance. "Snowflake AI 데이터 클라우드 | Snowflake Korea" offers 104 different links — too many choices to sort through at a glance. "Snowflake AI 数据云" offers 86 different links — too many choices to sort through at a glance. "Snowflake AI Data Cloud | Snowflake Brasil" offers 94 different links — too many choices to sort through at a glance. "Die Snowflake AI Data Cloud | Snowflake DE" offers 102 different links — too many choices to sort through at a glance. "L’AI Data Cloud de Snowflake | Snowflake FR" offers 102 different links — too many choices to sort through at a glance. "Snowflake AI Data Cloud | Snowflake ES" offers 98 different links — too many choices to sort through at a glance. "L’AI Data Cloud Snowflake | Snowflake IT" offers 97 different links — too many choices to sort through at a glance. "Contact Sales" offers 72 different links — too many choices to sort through at a glance. "Expedition 26: Launches, AI News and Recaps | Snowflake" offers 81 different links — too many choices to sort through at a glance. "Why Snowflake AI Data Cloud?" offers 96 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_bc89474a_133

### 5. 1 link label doesn't say where they go (2 of 15 pages) [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Apply on snowflake.com/en/expedition
  - Apply on snowflake.com/en/why-snowflake
- Rationale: Labels like "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_18f0b912_135 (data/evidence/exp_9050c955_desktop_d1.png)

### 6. Desktop: the homepage takes 8.37 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on snowflake.com/en
- Rationale: The homepage is 7530px tall at a 900px viewport — 8.37 screens, roughly 12.6s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_9050c955_desktop_d0.png)

### 7. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on snowflake.com/en
  - Apply on snowflake.com/en/startup-challenge
  - Apply on snowflake.com/en/pricing-options
  - Apply on snowflake.com/ja
  - Apply on snowflake.com/pt_br
  - Apply on snowflake.com/de
  - Apply on snowflake.com/fr
  - Apply on snowflake.com/it
  - …and 1 more affected location
- Rationale: 5 above-the-fold actions are equally prominent by size ("CONTACT SALES", "START FOR FREE", "REGISTER NOW", "REJECT ALL", "ACCEPT ALL COOKIES") on "Snowflake Startup Challenge", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_9050c955_desktop_d0.png, data/evidence/exp_9050c955_desktop_d1.png)

### 8. Desktop: a visitor landing here can't find page name, you-are-here indicator [S]
- Change: Add page name, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add page name, you-are-here indicator to the persistent header on every page.
  - Apply on snowflake.com/en/startup-challenge
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_8ef619cb (data/evidence/exp_9050c955_desktop_d1.png)

### 9. The page threw 12 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on snowflake.com/en
- Rationale: 12 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 403 ()", "console: Permissions policy violation: unload is not allowed in this document.". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0004_desktop_0.png, data/evidence/run_agent-0004_desktop_1.png, data/evidence/run_agent-0006_desktop_0.png)

### 10. Desktop: primary navigation has 10 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on snowflake.com/en
  - Apply on snowflake.com/en/startup-challenge
  - Apply on snowflake.com/en/pricing-options
  - Apply on snowflake.com/ja
  - Apply on snowflake.com/ko
  - Apply on snowflake.com/pt_br
  - Apply on snowflake.com/de
  - Apply on snowflake.com/fr
  - …and 5 more affected locations
- Rationale: The top navigation exposes up to 10 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_9050c955_desktop_d0.png, data/evidence/exp_9050c955_desktop_d1.png)

### 11. Heading outline is broken: skips h1→h4, h2→h5, h4→h6, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en
- Rationale: 1 page(s) have a heading outline with skips h1→h4, h2→h5, h4→h6, h2→h4 (h1: "The Agentic EnterpriseRuns on Snowflake"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_93c152dd (data/evidence/exp_9050c955_desktop_d0.png)

### 12. Heading outline is broken: no h1; skips h2→h5, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en/startup-challenge
- Rationale: 1 page(s) have a heading outline with no h1; skips h2→h5, h2→h4. Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_6b855e03 (data/evidence/exp_9050c955_desktop_d1.png)

### 13. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en/expedition
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Expedition"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_9050c955_desktop_d1.png)

### 14. Heading outline is broken: skips h1→h6, h2→h4, h2→h5 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en/pricing-options
- Rationale: 1 page(s) have a heading outline with skips h1→h6, h2→h4, h2→h5 (h1: "Snowflake Pricing"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_314d4295 (data/evidence/exp_9050c955_desktop_d1.png)

### 15. Heading outline is broken: skips h1→h6, h2→h5, h4→h6, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/ja
  - Apply on snowflake.com/zh_cn
  - Apply on snowflake.com/pt_br
  - Apply on snowflake.com/de
  - Apply on snowflake.com/es
  - Apply on snowflake.com/it
- Rationale: 6 page(s) have a heading outline with skips h1→h6, h2→h5, h4→h6, h2→h4 (h1: "Snowflakeで実現する エージェント型エンタープライズ"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_9f7cbac7 (data/evidence/exp_9050c955_desktop_d1.png)

### 16. Heading outline is broken: 2 h1 elements; skips h1→h6, h2→h5, h4→h6, h2→h4, h1→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/ko
- Rationale: 1 page(s) have a heading outline with 2 h1 elements; skips h1→h6, h2→h5, h4→h6, h2→h4, h1→h4 (h1: "Snowflake 기반의 에이전틱 엔터프라이즈", "Snowflake 최신 소식"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_cf2d3ce8 (data/evidence/exp_9050c955_desktop_d1.png)

### 17. Heading outline is broken: skips h1→h6, h2→h5, h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/fr
- Rationale: 1 page(s) have a heading outline with skips h1→h6, h2→h5, h2→h4 (h1: "L’entreprise agentique est sur Snowflake"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_940304b0 (data/evidence/exp_9050c955_desktop_d1.png)

### 18. Heading outline is broken: skips h1→h6 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en/contact-sales
- Rationale: 1 page(s) have a heading outline with skips h1→h6 (h1: "Contact Sales"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_693372c2 (data/evidence/exp_9050c955_desktop_d1.png)

### 19. Heading outline is broken: skips h3→h5, h2→h6 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en/blog/expedition-26
- Rationale: 1 page(s) have a heading outline with skips h3→h5, h2→h6 (h1: "Inside Expedition 26"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_8de69d43 (data/evidence/exp_9050c955_desktop_d1.png)

### 20. Heading outline is broken: skips h3→h6, h3→h5, h2→h4, h4→h6, h2→h6 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on snowflake.com/en/why-snowflake
- Rationale: 1 page(s) have a heading outline with skips h3→h6, h3→h5, h2→h4, h4→h6, h2→h6 (h1: "Power Your Agentic Enterprise"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_68593027 (data/evidence/exp_9050c955_desktop_d1.png)

### 21. Desktop: a visitor landing here can't find you-are-here indicator [S]
- Change: Add you-are-here indicator to the persistent header on every page.
- Steps:
  - Add you-are-here indicator to the persistent header on every page.
  - Apply on snowflake.com/en/pricing-options
  - Apply on snowflake.com/en/contact-sales
  - Apply on snowflake.com/en/blog/expedition-26
  - Apply on snowflake.com/en/why-snowflake
- Rationale: On 4 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_9050c955_desktop_d1.png)

### 22. Desktop: a visitor landing here can't find search, you-are-here indicator [S]
- Change: Add search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add search, you-are-here indicator to the persistent header on every page.
  - Apply on snowflake.com/ja
  - Apply on snowflake.com/ko
  - Apply on snowflake.com/zh_cn
  - Apply on snowflake.com/pt_br
  - Apply on snowflake.com/de
  - Apply on snowflake.com/fr
  - Apply on snowflake.com/es
  - Apply on snowflake.com/it
- Rationale: On 8 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_9050c955_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "trial" (4 of 4 runs)
- The page still invites registration for an event that already happened (2 of 15 pages)
- Desktop: a visitor landing here can't find primary navigation, search, you-are-here indicator

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (15 of 15 pages)
- 1 link label doesn't say where they go (2 of 15 pages)
- Desktop: the homepage takes 8.37 screens of scrolling

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
