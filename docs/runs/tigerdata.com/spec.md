# Rehearsal spec — https://www.tigerdata.com/

Goal: find pricing and sign up
Generated: 2026-11-15T00:45:34.703Z

## Summary
Rehearsal ran 5 browser runs on https://www.tigerdata.com/. It found 1 verified failure and 11 reproducible concerns. 12 findings became 12 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "pricing" (3 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "pricing" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_24505f43_90 (data/evidence/run_agent-0006_desktop_0.png, data/evidence/run_agent-0007_desktop_0.png, data/evidence/run_agent-0009_desktop_0.png)

### 2. The page still invites registration for an event that already happened [M]
- Change: Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
- Steps:
  - Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
  - Apply on tigerdata.com/legal/privacy
- Rationale: "Privacy Policy | Tiger Data" shows dates in the past (NOVEMBER 6, 2026) next to apply/register language — visitors are invited to act on something that's over. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Principle: Cut needless words
- Evidence: finding f_51566b5c_95 (data/evidence/exp_617130ea_desktop_d1.png)

### 3. Desktop: a visitor landing here can't find site ID, page name, primary navigation, search, you-are-here indicator [M]
- Change: Add site ID, page name, primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add site ID, page name, primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on tigerdata.com/search
  - Apply on tigerdata.com/data-centers
  - Apply on tigerdata.com/energy-utilities
  - Apply on tigerdata.com/smart-manufacturing
  - Apply on tigerdata.com/crypto
  - Apply on tigerdata.com/docs
  - Apply on tigerdata.com/docs/about/latest/changelog
  - Apply on tigerdata.com/benchmarks
- Rationale: On 8 page(s) a visitor dropped in cold can't find: site ID, page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_554d08b1 (data/evidence/exp_617130ea_desktop_d1.png)

### 4. Too many links compete for attention (7 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on tigerdata.com/
  - Apply on tigerdata.com/pricing
  - Apply on tigerdata.com/legal/privacy
  - Apply on tigerdata.com/cloud
  - Apply on tigerdata.com/timescaledb-enterprise
  - Apply on tigerdata.com/timescaledb
  - Apply on tigerdata.com/oilfield-services
- Rationale: "Time-Series PostgreSQL at Petabyte Scale" offers 70 different links — too many choices to sort through at a glance. Also: "Tiger Cloud Pricing. Scale Further. Spend Less. | Tiger Data" offers 61 different links — too many choices to sort through at a glance. "Privacy Policy | Tiger Data" offers 62 different links — too many choices to sort through at a glance. "Tiger Cloud — Production Postgres at Scale | Tiger Data" offers 72 different links — too many choices to sort through at a glance. "TimescaleDB Enterprise for Physical-World Operational Data | Tiger Data" offers 53 different links — too many choices to sort through at a glance. "TimescaleDB — The #1 Time-Series Database | Tiger Data" offers 63 different links — too many choices to sort through at a glance. "Postgres for Oilfield services | Tiger Data" offers 58 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_4bcbeb05_93

### 5. 1 link label doesn't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "here" link
  - Apply on tigerdata.com/legal/privacy
- Rationale: Labels like "here" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_a1f95f51_96 (data/evidence/exp_617130ea_desktop_d1.png)

### 6. 3 link labels don't say where they go (2 of 15 pages) [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Apply on tigerdata.com/timescaledb
  - Apply on tigerdata.com/oilfield-services
- Rationale: Labels like "Learn more", "Learn more", "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_2d5f108b_100 (data/evidence/exp_617130ea_desktop_d1.png)

### 7. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on tigerdata.com/pricing
- Rationale: 3 above-the-fold actions are equally prominent by size ("30-day free trial", "30-day free trial", "Have pricing questions? Let’s chat") on "Tiger Cloud Pricing. Scale Further. Spend Less. | Tiger Data", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_617130ea_desktop_d1.png)

### 8. The page threw 5 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on tigerdata.com/
- Rationale: 5 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 429 ()". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0006_desktop_0.png, data/evidence/run_agent-0007_desktop_0.png, data/evidence/run_agent-0009_desktop_0.png)

### 9. Desktop: the homepage takes 5.86 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on tigerdata.com/
- Rationale: The homepage is 5272px tall at a 900px viewport — 5.86 screens, roughly 8.8s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_617130ea_desktop_d0.png)

### 10. Desktop: primary navigation has 11 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on tigerdata.com/
  - Apply on tigerdata.com/pricing
  - Apply on tigerdata.com/legal/privacy
  - Apply on tigerdata.com/cloud
  - Apply on tigerdata.com/timescaledb-enterprise
  - Apply on tigerdata.com/timescaledb
  - Apply on tigerdata.com/oilfield-services
- Rationale: The top navigation exposes up to 11 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_617130ea_desktop_d0.png, data/evidence/exp_617130ea_desktop_d1.png)

### 11. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on tigerdata.com/search
  - Apply on tigerdata.com/data-centers
  - Apply on tigerdata.com/energy-utilities
  - Apply on tigerdata.com/smart-manufacturing
  - Apply on tigerdata.com/crypto
  - Apply on tigerdata.com/docs
  - Apply on tigerdata.com/docs/about/latest/changelog
  - Apply on tigerdata.com/benchmarks
- Rationale: 8 page(s) have a heading outline with no h1. Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_617130ea_desktop_d1.png)

### 12. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on tigerdata.com/pricing
  - Apply on tigerdata.com/legal/privacy
  - Apply on tigerdata.com/cloud
  - Apply on tigerdata.com/timescaledb-enterprise
  - Apply on tigerdata.com/timescaledb
  - Apply on tigerdata.com/oilfield-services
- Rationale: On 6 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_617130ea_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "pricing" (3 of 4 runs)
- The page still invites registration for an event that already happened
- Desktop: a visitor landing here can't find site ID, page name, primary navigation, search, you-are-here indicator

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (7 of 15 pages)
- 1 link label doesn't say where they go
- 3 link labels don't say where they go (2 of 15 pages)

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
