# Rehearsal spec — https://brightdata.com/

Goal: find pricing for the Web Unlocker
Generated: 2026-11-15T00:40:24.966Z

## Summary
Rehearsal ran 5 browser runs on https://brightdata.com/. It found 1 verified failure and 13 reproducible concerns. 14 findings became 14 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "unlocker" (3 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "unlocker" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_daec650a_26 (data/evidence/run_agent-0000_desktop_0.png, data/evidence/run_agent-0002_desktop_0.png, data/evidence/run_agent-0004_desktop_0.png)

### 2. No signup page or link found [M]
- Change: Add a clearly labeled signup destination and link it from the primary navigation.
- Steps:
  - Add a clearly labeled signup destination and link it from the primary navigation.
- Rationale: A saas site should offer a signup destination, but nothing in the 15 pages found leads to one. [reproducible-concern; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_missing-endpoint-class_signup

### 3. 1 link label doesn't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Apply on brightdata.com/
- Rationale: Labels like "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_8850b8f0_29 (data/evidence/exp_a1ec006c_desktop_d0.png)

### 4. Too many links compete for attention (15 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on brightdata.com/
  - Apply on brightdata.com/products/web-unlocker
  - Apply on brightdata.com/pricing/web-unlocker
  - Apply on brightdata.com/pricing/crawl-api
  - Apply on brightdata.com/pricing/serp
  - Apply on brightdata.com/pricing/scraping-browser
  - Apply on brightdata.com/pricing/web-scraper
  - Apply on brightdata.com/pricing/web-scraper/studio
  - …and 7 more affected locations
- Rationale: "Bright Data: Web Data Infrastructure for Humans & Agents" offers 172 different links — too many choices to sort through at a glance. Also: "Web Unlocker - Automated Web Unblocker" offers 183 different links — too many choices to sort through at a glance. "Web Unlocker Pricing Plans" offers 150 different links — too many choices to sort through at a glance. "Crawl API Pricing Plans" offers 135 different links — too many choices to sort through at a glance. "SERP API Pricing Plans" offers 142 different links — too many choices to sort through at a glance. "Scraping Browser Pricing" offers 135 different links — too many choices to sort through at a glance. "Web Scraper API Pricing Plans" offers 74 different links — too many choices to sort through at a glance. "Custom Scraper Pricing - Free Trial" offers 136 different links — too many choices to sort through at a glance. "Dataset Marketplace Pricing" offers 73 different links — too many choices to sort through at a glance. "Archive API Pricing" offers 135 different links — too many choices to sort through at a glance. "Bright Insights Pricing" offers 135 different links — too many choices to sort through at a glance. "Managed Data Services Pricing Plans" offers 135 different links — too many choices to sort through at a glance. "Residential Proxies Pricing" offers 151 different links — too many choices to sort through at a glance. "Datacenter Proxies Pricing" offers 146 different links — too many choices to sort through at a glance. "ISP Proxies Pricing" offers 153 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_b891701a_30

### 5. Desktop: the homepage takes 9.78 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on brightdata.com/
- Rationale: The homepage is 8803px tall at a 900px viewport — 9.78 screens, roughly 14.7s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_a1ec006c_desktop_d0.png)

### 6. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on brightdata.com/pricing/web-unlocker
  - Apply on brightdata.com/pricing/crawl-api
  - Apply on brightdata.com/pricing/serp
  - Apply on brightdata.com/pricing/scraping-browser
  - Apply on brightdata.com/pricing/web-scraper
  - Apply on brightdata.com/pricing/web-scraper/studio
  - Apply on brightdata.com/pricing/proxy-network/residential-proxies
  - Apply on brightdata.com/pricing/proxy-network/datacenter-proxies
  - …and 1 more affected location
- Rationale: 4 above-the-fold actions are equally prominent by size ("Start free", "Start free", "Start free", "Talk to sales") on "Web Unlocker Pricing Plans", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_a1ec006c_desktop_d1.png)

### 7. Desktop: a visitor landing here can't find page name, you-are-here indicator [S]
- Change: Add page name, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add page name, you-are-here indicator to the persistent header on every page.
  - Apply on brightdata.com/pricing/web-scraper
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_8ef619cb (data/evidence/exp_a1ec006c_desktop_d1.png)

### 8. The page threw 36 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on brightdata.com/
- Rationale: 36 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 429 ()", "console: %c%d font-size:0;color:transparent NaN", "console: %c%o font-size:0;color:transparent {}". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0000_desktop_0.png, data/evidence/run_agent-0002_desktop_0.png, data/evidence/run_agent-0004_desktop_0.png)

### 9. Heading outline is broken: skips h2→h4, h2→h5 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on brightdata.com/products/web-unlocker
- Rationale: 1 page(s) have a heading outline with skips h2→h4, h2→h5 (h1: "Web Unlocker API"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_2ede6b14 (data/evidence/exp_a1ec006c_desktop_d1.png)

### 10. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on brightdata.com/pricing/web-unlocker
  - Apply on brightdata.com/pricing/web-scraper/studio
  - Apply on brightdata.com/pricing/managed-services
- Rationale: 3 page(s) have a heading outline with skips h1→h3 (h1: "Web Unlocker API Pricing"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_a1ec006c_desktop_d1.png)

### 11. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on brightdata.com/pricing/web-scraper
- Rationale: 1 page(s) have a heading outline with no h1. Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_a1ec006c_desktop_d1.png)

### 12. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on brightdata.com/
  - Apply on brightdata.com/products/web-unlocker
- Rationale: On 2 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_a1ec006c_desktop_d0.png, data/evidence/exp_a1ec006c_desktop_d1.png)

### 13. Desktop: a visitor landing here can't find search, you-are-here indicator [S]
- Change: Add search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add search, you-are-here indicator to the persistent header on every page.
  - Apply on brightdata.com/pricing/web-unlocker
  - Apply on brightdata.com/pricing/crawl-api
  - Apply on brightdata.com/pricing/serp
  - Apply on brightdata.com/pricing/scraping-browser
  - Apply on brightdata.com/pricing/web-scraper/studio
  - Apply on brightdata.com/pricing/archive-api
  - Apply on brightdata.com/pricing/insights
  - Apply on brightdata.com/pricing/managed-services
  - …and 3 more affected locations
- Rationale: On 11 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_a1ec006c_desktop_d1.png)

### 14. Desktop: a visitor landing here can't find you-are-here indicator [S]
- Change: Add you-are-here indicator to the persistent header on every page.
- Steps:
  - Add you-are-here indicator to the persistent header on every page.
  - Apply on brightdata.com/pricing/datasets
- Rationale: On 1 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_a1ec006c_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "unlocker" (3 of 4 runs)
- No signup page or link found

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- 1 link label doesn't say where they go
- Too many links compete for attention (15 of 15 pages)
- Desktop: the homepage takes 9.78 screens of scrolling

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
