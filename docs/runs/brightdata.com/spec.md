# Rehearsal spec — https://brightdata.com/

Goal: find pricing for the Web Unlocker
Generated: 2026-11-13T21:55:52.281Z

## Summary
Rehearsal verified 5 browser runs against https://brightdata.com/: 1 verified failure(s), 26 reproducible concern(s). 27 total findings mapped to 27 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "unlocker" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t146_desktop (desktop) failed assertion url-matches on value "unlocker". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_f4aceb75_26 (data/evidence/run_t146_desktop_0.png, data/evidence/run_t146_desktop_3.png, data/evidence/run_t146_desktop_5.png)

### 2. No signup endpoint found [M]
- Change: Add a clearly labeled signup destination and link it from the primary navigation.
- Rationale: missing-endpoint-class: a saas site is expected to expose a signup endpoint, but none of the 15 discovered states or their links/CTAs classify as signup. [reproducible-concern; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_missing-endpoint-class_signup

### 3. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_7c199c62_29 (data/evidence/exp_4df08f7a_desktop_d0.png)

### 4. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 172 distinct links compete for attention on "Bright Data: Web Data Infrastructure for Humans & Agents". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_a9c94126_30

### 5. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 183 distinct links compete for attention on "Web Unlocker - Automated Web Unblocker". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_f551246e_31

### 6. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 150 distinct links compete for attention on "Web Unlocker Pricing Plans". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_c6f00a82_32

### 7. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 135 distinct links compete for attention on "Crawl API Pricing Plans". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_a8e142ae_33

### 8. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 142 distinct links compete for attention on "SERP API Pricing Plans". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_3f6edf6d_34

### 9. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 135 distinct links compete for attention on "Scraping Browser Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_45653343_35

### 10. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 74 distinct links compete for attention on "Web Scraper API Pricing Plans". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_ae40972f_36

### 11. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 136 distinct links compete for attention on "Custom Scraper Pricing - Free Trial". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_ceb7849d_37

### 12. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 73 distinct links compete for attention on "Dataset Marketplace Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_5f5e907e_38

### 13. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 135 distinct links compete for attention on "Archive API Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_668fde8e_39

### 14. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 135 distinct links compete for attention on "Bright Insights Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_f61367b9_40

### 15. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 135 distinct links compete for attention on "Managed Data Services Pricing Plans". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_b0b896b5_41

### 16. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 151 distinct links compete for attention on "Residential Proxies Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_1dcf525d_42

### 17. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 146 distinct links compete for attention on "Datacenter Proxies Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_517cf346_43

### 18. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 153 distinct links compete for attention on "ISP Proxies Pricing". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_237f7ae4_44

### 19. Desktop: homepage requires 9.78 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 8803px tall at a 900px viewport — 9.78 screens, roughly 14.7s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_4df08f7a_desktop_d0.png)

### 20. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 4 above-the-fold actions are equally prominent by size ("Start free", "Start free", "Start free", "Talk to sales") on "Web Unlocker Pricing Plans", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_4df08f7a_desktop_d1.png)

### 21. Desktop: missing page name, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (page name, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_8ef619cb (data/evidence/exp_4df08f7a_desktop_d1.png)

### 22. Heading outline is broken: skips h2→h4, h2→h5 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h2→h4, h2→h5 (h1: "Web Unlocker API"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_2ede6b14 (data/evidence/exp_4df08f7a_desktop_d1.png)

### 23. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 3 page(s) have a heading outline with skips h1→h3 (h1: "Web Unlocker API Pricing"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_4df08f7a_desktop_d1.png)

### 24. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_4df08f7a_desktop_d1.png)

### 25. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 2 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_4df08f7a_desktop_d0.png, data/evidence/exp_4df08f7a_desktop_d1.png)

### 26. Desktop: missing search, you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 11 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_4df08f7a_desktop_d1.png)

### 27. Desktop: missing you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_4df08f7a_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "unlocker"
- No signup endpoint found

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Ambiguous link labels (1)
- Dense link surface increases scan cost
- Dense link surface increases scan cost

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
