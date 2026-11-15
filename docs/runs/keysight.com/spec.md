# Rehearsal spec — https://www.keysight.com/us/en/home.html

Goal: find pricing or request a quote for an oscilloscope
Generated: 2026-11-15T00:32:20.976Z

## Summary
Rehearsal ran 5 browser runs on https://www.keysight.com/us/en/home.html. It found 1 verified failure and 12 reproducible concerns. 17 findings became 17 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "oscilloscope" (3 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "oscilloscope" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_7f6d1141_0 (data/evidence/run_agent-0001_desktop_0.png, data/evidence/run_agent-0001_desktop_2.png, data/evidence/run_agent-0004_desktop_0.png, data/evidence/run_agent-0004_desktop_1.png, data/evidence/run_agent-0012_desktop_0.png, data/evidence/run_agent-0012_desktop_1.png)

### 2. Desktop: a visitor landing here can't find site ID, page name, primary navigation, search, you-are-here indicator [M]
- Change: Add site ID, page name, primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add site ID, page name, primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on keysight.com/us/en/products/oscilloscopes.html
  - Apply on keysight.com/us/en/products/sampling-oscilloscopes.html
  - Apply on keysight.com/us/en/products/oscilloscopes/benchtop/essential-benchtop-oscilloscopes.html
  - Apply on keysight.com/us/en/products/oscilloscopes/benchtop/pro-benchtop-oscilloscopes.html
  - Apply on keysight.com/us/en/cmp/2026/Introducing-xr8-oscilloscope.html
  - Apply on keysight.com/us/en/about/newsroom/catalog/news-release.2026.1103_pr26-098-keysight-introduces-14-bit-low-profile-oscilloscope-for-high-channel-density-synchronized-test-systems.html
  - Apply on keysight.com/us/en/contact.html
  - Apply on keysight.com/us/en/passive-saml.login.html
- Rationale: On 8 page(s) a visitor dropped in cold can't find: site ID, page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_554d08b1 (data/evidence/exp_5762291f_desktop_d1.png)

### 3. Desktop: a visitor landing here can't find page name, primary navigation, search, you-are-here indicator [M]
- Change: Add page name, primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add page name, primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on keysight.com/ssoauth/logout
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_009ced81 (data/evidence/exp_5762291f_desktop_d1.png)

### 4. 11 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn More" link
  - Update the "Learn more" link
  - Apply on keysight.com/us/en/home.html
- Rationale: Labels like "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn more", "Learn More", "Learn More", "Learn More", "Learn More" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_3ba50988_3 (data/evidence/exp_5762291f_desktop_d0.png)

### 5. Too many links compete for attention (6 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on keysight.com/us/en/home.html
  - Apply on keysight.com/jp/ja/home.html
  - Apply on keysight.com/kr/ko/home.html
  - Apply on keysight.com/br/pt/home.html
  - Apply on keysight.com/ca/en/home.html
  - Apply on keysight.com/de/de/home.html
- Rationale: "Keysight: Design, Emulate, and Test to Accelerate Innovation" offers 236 different links — too many choices to sort through at a glance. Also: "キーサイト：設計、エミュレーション、テストでイノベーションを加速" offers 243 different links — too many choices to sort through at a glance. "키사이트: 설계, 에뮬레이션, 테스트를 통해 혁신 가속화" offers 238 different links — too many choices to sort through at a glance. "Keysight: Projetar, Emular e Testar para Acelerar a Inovação" offers 242 different links — too many choices to sort through at a glance. "Keysight: Design, Emulate, and Test to Accelerate Innovation" offers 237 different links — too many choices to sort through at a glance. "Keysight: Design, Emulation und Test zur Beschleunigung von Innovationen" offers 243 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_3bc1e9ad_4

### 6. 12 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn More" link
  - Update the "Learn more" link
  - Apply on keysight.com/ca/en/home.html
- Rationale: Labels like "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn more", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_25ff8288_8 (data/evidence/exp_5762291f_desktop_d1.png)

### 7. Desktop: the homepage takes 8.01 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on keysight.com/us/en/home.html
- Rationale: The homepage is 7209px tall at a 900px viewport — 8.01 screens, roughly 12s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_5762291f_desktop_d0.png)

### 8. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on keysight.com/us/en/home.html
  - Apply on keysight.com/kr/ko/home.html
  - Apply on keysight.com/br/pt/home.html
  - Apply on keysight.com/ca/en/home.html
  - Apply on keysight.com/de/de/home.html
- Rationale: 3 above-the-fold actions are equally prominent by size ("Explore Our New Essential Oscilloscope", "Explore New Validation Solutions", "Meet Our New Signal Generator") on "Keysight: Design, Emulate, and Test to Accelerate Innovation", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_5762291f_desktop_d0.png, data/evidence/exp_5762291f_desktop_d1.png)

### 9. Desktop: a visitor landing here can't find page name [S]
- Change: Add page name to the persistent header on every page.
- Steps:
  - Add page name to the persistent header on every page.
  - Apply on keysight.com/us/en/home.html
  - Apply on keysight.com/ca/en/home.html
- Rationale: On 2 page(s) a visitor dropped in cold can't find: page name. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_ac62ae69 (data/evidence/exp_5762291f_desktop_d0.png, data/evidence/exp_5762291f_desktop_d1.png)

### 10. Desktop: a visitor landing here can't find page name, search [S]
- Change: Add page name, search to the persistent header on every page.
- Steps:
  - Add page name, search to the persistent header on every page.
  - Apply on keysight.com/jp/ja/home.html
  - Apply on keysight.com/kr/ko/home.html
  - Apply on keysight.com/br/pt/home.html
  - Apply on keysight.com/de/de/home.html
- Rationale: On 4 page(s) a visitor dropped in cold can't find: page name, search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_a1db3636 (data/evidence/exp_5762291f_desktop_d1.png)

### 11. Visitors can't find an answer to "How much is shipping and how long does it take?" [S]
- Change: Decide whether visitors should get an answer to "How much is shipping and how long does it take?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "How much is shipping and how long does it take?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on keysight.com/us/en/home.html
- Rationale: Visitors are likely to ask "How much is shipping and how long does it take?" (quotation, importance 0.8). None of the 15 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_shipping (data/evidence/exp_5762291f_desktop_d0.png)

### 12. Visitors can't find an answer to "Can I return it?" [S]
- Change: Decide whether visitors should get an answer to "Can I return it?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "Can I return it?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on keysight.com/us/en/home.html
- Rationale: Visitors are likely to ask "Can I return it?" (information, importance 0.7). None of the 15 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_returns (data/evidence/exp_5762291f_desktop_d0.png)

### 13. Visitors can't find an answer to "What do other customers say?" [S]
- Change: Decide whether visitors should get an answer to "What do other customers say?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Steps:
  - Decide whether visitors should get an answer to "What do other customers say?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
  - Apply on keysight.com/us/en/home.html
- Rationale: Visitors are likely to ask "What do other customers say?" (information, importance 0.6). None of the 15 pages found or their links answer it (looked for matching copy). [hypothesis; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-question_reviews (data/evidence/exp_5762291f_desktop_d0.png)

### 14. 3 of 11 expected visitor questions go unanswered [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "How much is shipping and how long does it take?", "Can I return it?", "What do other customers say?".
- Steps:
  - Pick which questions the site should answer and which action each answer should lead to; start with "How much is shipping and how long does it take?", "Can I return it?", "What do other customers say?".
  - Apply on keysight.com/us/en/home.html
- Rationale: 8/11 likely visitor questions are answered by the 15 pages found or their endpoints. Unanswered: "How much is shipping and how long does it take?", "Can I return it?", "What do other customers say?". [hypothesis; Can the intended outcome be verified?]
- Principle: Always show where you are
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_5762291f_desktop_d0.png)

### 15. The page threw 54 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on keysight.com/us/en/home.html
- Rationale: 54 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 403 ()", "console: Failed to load resource: the server responded with a status of 429 ()", "console: VIDEOJS: ERROR: hi". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0001_desktop_0.png, data/evidence/run_agent-0001_desktop_2.png, data/evidence/run_agent-0002_desktop_0.png)

### 16. Desktop: primary navigation has 11 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on keysight.com/us/en/home.html
  - Apply on keysight.com/jp/ja/home.html
  - Apply on keysight.com/kr/ko/home.html
  - Apply on keysight.com/br/pt/home.html
  - Apply on keysight.com/ca/en/home.html
  - Apply on keysight.com/de/de/home.html
- Rationale: The top navigation exposes up to 11 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_5762291f_desktop_d0.png, data/evidence/exp_5762291f_desktop_d1.png)

### 17. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on keysight.com/us/en/home.html
  - Apply on keysight.com/us/en/products/oscilloscopes.html
  - Apply on keysight.com/us/en/products/sampling-oscilloscopes.html
  - Apply on keysight.com/us/en/products/oscilloscopes/benchtop/essential-benchtop-oscilloscopes.html
  - Apply on keysight.com/us/en/products/oscilloscopes/benchtop/pro-benchtop-oscilloscopes.html
  - Apply on keysight.com/us/en/cmp/2026/Introducing-xr8-oscilloscope.html
  - Apply on keysight.com/us/en/about/newsroom/catalog/news-release.2026.1103_pr26-098-keysight-introduces-14-bit-low-profile-oscilloscope-for-high-channel-density-synchronized-test-systems.html
  - Apply on keysight.com/us/en/contact.html
  - …and 7 more affected locations
- Rationale: 15 page(s) have a heading outline with no h1. Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_5762291f_desktop_d0.png, data/evidence/exp_5762291f_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "oscilloscope" (3 of 4 runs)
- Desktop: a visitor landing here can't find site ID, page name, primary navigation, search, you-are-here indicator
- Desktop: a visitor landing here can't find page name, primary navigation, search, you-are-here indicator

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- 11 link labels don't say where they go
- Too many links compete for attention (6 of 15 pages)
- 12 link labels don't say where they go

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
