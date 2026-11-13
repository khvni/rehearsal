# Rehearsal spec — https://www.heygen.com/

Goal: find pricing and sign up
Generated: 2026-11-13T22:27:43.074Z

## Summary
Rehearsal verified 5 browser runs against https://www.heygen.com/: 1 verified failure(s), 14 reproducible concern(s). 15 total findings mapped to 15 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "pricing" (3 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t197_desktop (desktop) failed assertion url-matches on value "pricing". Also: Browser run run_t269_desktop (desktop) failed assertion url-matches on value "pricing". Browser run run_t11_desktop (desktop) failed assertion url-matches on value "pricing". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_679bcf1d_159 (data/evidence/run_t197_desktop_0.png, data/evidence/run_t197_desktop_3.png, data/evidence/run_t197_desktop_6.png, data/evidence/run_t197_desktop_8.png, data/evidence/run_t269_desktop_0.png, data/evidence/run_t269_desktop_3.png, data/evidence/run_t269_desktop_6.png, data/evidence/run_t269_desktop_7.png, data/evidence/run_t11_desktop_0.png, data/evidence/run_t11_desktop_3.png, data/evidence/run_t11_desktop_6.png)

### 2. Desktop: missing primary navigation, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (primary navigation, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_f32dafdf (data/evidence/exp_7191d699_desktop_d1.png)

### 3. Ambiguous link labels (1) (2 of 15 pages) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_17487f83_162 (data/evidence/exp_7191d699_desktop_d0.png, data/evidence/exp_7191d699_desktop_d1.png)

### 4. Dense link surface increases scan cost (14 of 15 pages) [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 94 distinct links compete for attention on "HeyGen: Create AI Videos with Your Personal Avatar". Also: 74 distinct links compete for attention on "Pricing Plans for Creators and Marketers | HeyGen". 83 distinct links compete for attention on "Enterprise AI Video Creation Platform | HeyGen". 73 distinct links compete for attention on "AI Research | HeyGen". 84 distinct links compete for attention on "HeyGen Voice 1: Speech-to-Speech, TTS & Voice Cloning". 66 distinct links compete for attention on "Avatar V AI Digital Twin Avatar Generator | HeyGen". 65 distinct links compete for attention on "Avatar V: Scaling Video-Reference Avatar Generation". 66 distinct links compete for attention on "AI Video Agent | Create and Automate Videos with AI | HeyGen". 125 distinct links compete for attention on "Free AI Video Generator - HeyGen Video 1, Seedance, Kling, Veo & More". 66 distinct links compete for attention on "Best AI Video Generator for Engaging AI Videos | HeyGen". 84 distinct links compete for attention on "AI Video Translator : Translate Videos into 175+ Languages". 103 distinct links compete for attention on "Text to Video AI - Generate Videos from Text". 100 distinct links compete for attention on "Free Image to Video AI Generator, Animate Any Photo | HeyGen". 94 distinct links compete for attention on "Free Audio to Video Converter | HeyGen". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_02b147cc_163

### 5. Endpoint buried: signup "Get started , Business" [S]
- Change: Surface "Get started , Business" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Get started , Business" (signup, weight 0.9) takes a median of 4 steps across 69/200 reaching journeys (shortest: Pricing Plans → Get started , Business). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_signup_4534acda

### 6. Endpoint buried: signup "Sign up with Google" [S]
- Change: Surface "Sign up with Google" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Sign up with Google" (signup, weight 0.9) takes a median of 4 steps across 66/200 reaching journeys (shortest: AI Video Generator → Sign up with Google). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_signup_631619e2

### 7. Endpoint buried: signup "Get started , Pro" [S]
- Change: Surface "Get started , Pro" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Rationale: endpoint-deep: "Get started , Pro" (signup, weight 0.9) takes a median of 4 steps across 75/200 reaching journeys (shortest: Pricing Plans → Get started , Pro). Each extra choice must be mindless; past 3 the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: mindless-choices
- Evidence: finding f_endpoint-deep_ep_signup_ab130674

### 8. Desktop: homepage requires 20.98 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 18885px tall at a 900px viewport — 20.98 screens, roughly 31.5s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_7191d699_desktop_d0.png)

### 9. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 7 above-the-fold actions are equally prominent by size ("Book a demo", "Sign in", "For Individuals", "For Businesses", "Get started , Free", "Get started , Creator", "Get started , Pro") on "Pricing Plans for Creators and Marketers | HeyGen", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_7191d699_desktop_d0.png, data/evidence/exp_7191d699_desktop_d1.png)

### 10. Console errors during browser runs (33) [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Rationale: console-errors: 33 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 403 ()", "console: Failed to load resource: the server responded with a status of 400 ()". The goal check is unaffected, but broken scripts are where unconventional, unpredictable behavior starts. [reproducible-concern; Do labels and interactions behave predictably?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_console-errors_desktop (data/evidence/run_t197_desktop_0.png, data/evidence/run_t197_desktop_3.png, data/evidence/run_t197_desktop_6.png)

### 11. Desktop: primary navigation has 9 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 9 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_7191d699_desktop_d1.png)

### 12. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 2 page(s) have a heading outline with skips h1→h3 (h1: "Flexible pricing plans for every creator and team"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_7191d699_desktop_d1.png)

### 13. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Avatar V: Scaling Video-Reference Avatar Generation"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_7191d699_desktop_d1.png)

### 14. Desktop: largest text on the page is not the h1 [S]
- Change: Make the page's h1 the most prominent text, or promote the largest text to be the h1.
- Rationale: On 3 page(s) some other text renders larger than the h1, so visual prominence doesn't match importance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_hierarchy-mismatch_ffa615dc (data/evidence/exp_7191d699_desktop_d1.png)

### 15. Desktop: missing search (trunk test fails) [S]
- Change: Add the missing trunk-test signals (search) to the persistent header on every page.
- Rationale: On 13 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_7191d699_desktop_d0.png, data/evidence/exp_7191d699_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "pricing" (3 of 4 runs)
- Desktop: missing primary navigation, search, you-are-here indicator (trunk test fails)

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Ambiguous link labels (1) (2 of 15 pages)
- Dense link surface increases scan cost (14 of 15 pages)
- Endpoint buried: signup "Get started , Business"

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
