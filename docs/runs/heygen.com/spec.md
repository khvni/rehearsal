# Rehearsal spec — https://www.heygen.com/

Goal: find pricing and sign up
Generated: 2026-11-15T00:54:27.588Z

## Summary
Rehearsal ran 5 browser runs on https://www.heygen.com/. It found 1 verified failure and 13 reproducible concerns. 14 findings became 14 changes.

## Changes (by impact)

### 1. Browser check failed: the URL "pricing" (2 of 4 runs) [M]
- Change: Open the live page and fix the mismatch so the check passes for a real visitor.
- Steps:
  - Open the live page and fix the mismatch so the check passes for a real visitor.
- Rationale: In the desktop browser run, the URL didn't match "pricing" — what the check expected isn't what a visitor gets. [verified-failure; Can the intended outcome be verified?]
- Principle: Test, don't argue
- Evidence: finding f_38c330d2_178 (data/evidence/run_agent-0003_desktop_0.png, data/evidence/run_agent-0009_desktop_0.png)

### 2. Desktop: a visitor landing here can't find primary navigation, search, you-are-here indicator [M]
- Change: Add primary navigation, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add primary navigation, search, you-are-here indicator to the persistent header on every page.
  - Apply on heygen.com/contact-us/sales
- Rationale: On 1 page(s) a visitor dropped in cold can't find: primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_f32dafdf (data/evidence/exp_b00afff7_desktop_d1.png)

### 3. 1 link label doesn't say where they go (2 of 15 pages) [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Apply on heygen.com/
  - Apply on heygen.com/avatars/avatar-v
- Rationale: Labels like "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_54015ef3_180 (data/evidence/exp_b00afff7_desktop_d0.png, data/evidence/exp_b00afff7_desktop_d1.png)

### 4. Too many links compete for attention (14 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on heygen.com/
  - Apply on heygen.com/pricing
  - Apply on heygen.com/enterprise
  - Apply on heygen.com/research
  - Apply on heygen.com/heygen-voice
  - Apply on heygen.com/avatars/avatar-v
  - Apply on heygen.com/research/avatar-v-model
  - Apply on heygen.com/agent
  - …and 6 more affected locations
- Rationale: "HeyGen: Create AI Videos with Your Personal Avatar" offers 94 different links — too many choices to sort through at a glance. Also: "Pricing Plans for Creators and Marketers | HeyGen" offers 74 different links — too many choices to sort through at a glance. "Enterprise AI Video Creation Platform | HeyGen" offers 83 different links — too many choices to sort through at a glance. "AI Research | HeyGen" offers 73 different links — too many choices to sort through at a glance. "HeyGen Voice 1: Speech-to-Speech, TTS & Voice Cloning" offers 84 different links — too many choices to sort through at a glance. "Avatar V AI Digital Twin Avatar Generator | HeyGen" offers 66 different links — too many choices to sort through at a glance. "Avatar V: Scaling Video-Reference Avatar Generation" offers 65 different links — too many choices to sort through at a glance. "AI Video Agent | Create and Automate Videos with AI | HeyGen" offers 66 different links — too many choices to sort through at a glance. "Free AI Video Generator - HeyGen Video 1, Seedance, Kling, Veo & More" offers 125 different links — too many choices to sort through at a glance. "Best AI Video Generator for Engaging AI Videos | HeyGen" offers 66 different links — too many choices to sort through at a glance. "AI Video Translator : Translate Videos into 175+ Languages" offers 84 different links — too many choices to sort through at a glance. "Text to Video AI - Generate Videos from Text" offers 103 different links — too many choices to sort through at a glance. "Free Image to Video AI Generator, Animate Any Photo | HeyGen" offers 100 different links — too many choices to sort through at a glance. "Free Audio to Video Converter | HeyGen" offers 94 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_4371038f_181

### 5. "Get started , Business" takes too many clicks to reach [S]
- Change: Surface "Get started , Business" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Get started , Business" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Get started , Business" link
  - Apply on heygen.com/pricing
- Rationale: "Get started , Business" (signup, importance 0.9) sits a median of 4 steps from the start (70/200 journeys reach it; shortest path: Pricing Plans → Get started , Business). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_signup_4534acda

### 6. "Get started , Pro" takes too many clicks to reach [S]
- Change: Surface "Get started , Pro" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
- Steps:
  - Surface "Get started , Pro" within 3 clicks of the start page, or make each intermediate link unambiguous about leading there.
  - Update the "Get started , Pro" link
  - Apply on heygen.com/pricing
- Rationale: "Get started , Pro" (signup, importance 0.9) sits a median of 4 steps from the start (73/200 journeys reach it; shortest path: Pricing Plans → Get started , Pro). Past 3 steps the path stops being obvious. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Make every choice obvious
- Evidence: finding f_endpoint-deep_ep_signup_ab130674

### 7. Desktop: the homepage takes 20.98 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on heygen.com/
- Rationale: The homepage is 18885px tall at a 900px viewport — 20.98 screens, roughly 31.5s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_b00afff7_desktop_d0.png)

### 8. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on heygen.com/
  - Apply on heygen.com/pricing
  - Apply on heygen.com/research
  - Apply on heygen.com/tool/text-to-video
- Rationale: 7 above-the-fold actions are equally prominent by size ("Book a demo", "Sign in", "For Individuals", "For Businesses", "Get started , Free", "Get started , Creator", "Get started , Pro") on "Pricing Plans for Creators and Marketers | HeyGen", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_b00afff7_desktop_d0.png, data/evidence/exp_b00afff7_desktop_d1.png)

### 9. The page threw 9 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on heygen.com/
- Rationale: 9 page/console errors across 4 of 4 desktop runs, e.g. "console: Failed to load resource: the server responded with a status of 403 ()", "console: Failed to load resource: the server responded with a status of 400 ()". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0003_desktop_0.png, data/evidence/run_agent-0007_desktop_0.png, data/evidence/run_agent-0007_desktop_3.png)

### 10. Desktop: primary navigation has 9 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on heygen.com/research/avatar-v-model
  - Apply on heygen.com/agent
  - Apply on heygen.com/tool/ai-video-generator
  - Apply on heygen.com/ai-studio
  - Apply on heygen.com/translate
  - Apply on heygen.com/tool/audio-to-video-converter
- Rationale: The top navigation exposes up to 9 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_b00afff7_desktop_d1.png)

### 11. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on heygen.com/pricing
  - Apply on heygen.com/ai-studio
- Rationale: 2 page(s) have a heading outline with skips h1→h3 (h1: "Flexible pricing plans for every creator and team"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_b00afff7_desktop_d1.png)

### 12. Heading outline is broken: skips h2→h4 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on heygen.com/research/avatar-v-model
- Rationale: 1 page(s) have a heading outline with skips h2→h4 (h1: "Avatar V: Scaling Video-Reference Avatar Generation"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b0f9d1cb (data/evidence/exp_b00afff7_desktop_d1.png)

### 13. Desktop: largest text on the page is not the h1 [S]
- Change: Make the page's h1 the most prominent text, or promote the largest text to be the h1.
- Steps:
  - Make the page's h1 the most prominent text, or promote the largest text to be the h1.
  - Apply on heygen.com/agent
  - Apply on heygen.com/tool/ai-video-generator
  - Apply on heygen.com/translate
- Rationale: On 3 page(s) some other text renders larger than the h1, so visual prominence doesn't match importance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_hierarchy-mismatch_ffa615dc (data/evidence/exp_b00afff7_desktop_d1.png)

### 14. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on heygen.com/
  - Apply on heygen.com/pricing
  - Apply on heygen.com/enterprise
  - Apply on heygen.com/heygen-voice
  - Apply on heygen.com/avatars/avatar-v
  - Apply on heygen.com/research/avatar-v-model
  - Apply on heygen.com/agent
  - Apply on heygen.com/tool/ai-video-generator
  - …and 5 more affected locations
- Rationale: On 13 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_b00afff7_desktop_d0.png, data/evidence/exp_b00afff7_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- Browser check failed: the URL "pricing" (2 of 4 runs)
- Desktop: a visitor landing here can't find primary navigation, search, you-are-here indicator

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- 1 link label doesn't say where they go (2 of 15 pages)
- Too many links compete for attention (14 of 15 pages)
- "Get started , Business" takes too many clicks to reach

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
