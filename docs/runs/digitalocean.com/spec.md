# Rehearsal spec — https://www.digitalocean.com/

Goal: find droplet pricing
Generated: 2026-11-15T00:51:34.723Z

## Summary
Rehearsal ran 5 browser runs on https://www.digitalocean.com/. It found 0 verified failures and 19 reproducible concerns. 19 findings became 19 changes.

## Changes (by impact)

### 1. The page still invites registration for an event that already happened (3 of 15 pages) [M]
- Change: Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
- Steps:
  - Swap the apply/register button for a post-event path (recordings, next year's waitlist) or add a clear 'this event has ended' notice.
  - Apply on digitalocean.com/pricing/calculator
  - Apply on digitalocean.com/blog/now-available-prompt-caching
  - Apply on digitalocean.com/blog
- Rationale: "Pricing Calculator | DigitalOcean" shows dates in the past (JANUARY 1, 2026) next to apply/register language — visitors are invited to act on something that's over. Also: "Prompt Caching is GA on DigitalOcean Serverless Inference: Up to 90% Off the Context Your Agents Resend | DigitalOcean" shows dates in the past (OCTOBER 23, 2026, NOVEMBER 10, 2026, NOVEMBER 5, 2026, OCTOBER 28, 2026) next to apply/register language — visitors are invited to act on something that's over. "DigitalOcean Blog" shows dates in the past (NOVEMBER 5, 2026, NOVEMBER 10, 2026, OCTOBER 29, 2026, OCTOBER 28, 2026, OCTOBER 23, 2026, OCTOBER 15, 2026, OCTOBER 13, 2026, OCTOBER 12, 2026, JUNE 2, 2026, MAY 29, 2026, FEBRUARY 9, 2026, NOVEMBER 21, 2025, SEPTEMBER 29, 2025, SEPTEMBER 19, 2025, AUGUST 21, 2025, JULY 10, 2025, JUNE 9, 2026, JUNE 3, 2026, MARCH 24, 2026, FEBRUARY 25, 2026, JANUARY 6, 2026, DECEMBER 8, 2025, NOVEMBER 4, 2025, OCTOBER 9, 2025, SEPTEMBER 3, 2025, JULY 30, 2026, JUNE 10, 2026, JUNE 1, 2026, MAY 20, 2026, MAY 13, 2026, APRIL 28, 2026, OCTOBER 21, 2026, AUGUST 24, 2026, MARCH 23, 2026, OCTOBER 22, 2025, OCTOBER 7, 2024, AUGUST 12, 2024, JULY 2, 2024, JULY 1, 2024, SEPTEMBER 14, 2026, SEPTEMBER 9, 2026, FEBRUARY 6, 2025, OCTOBER 3, 2024, MAY 28, 2024, FEBRUARY 12, 2024, NOVEMBER 21, 2023, JULY 6, 2023, MAY 22, 2023, OCTOBER 26, 2026, OCTOBER 10, 2024) next to apply/register language — visitors are invited to act on something that's over. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Principle: Cut needless words
- Evidence: finding f_01c62524_159 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 2. Desktop: a visitor landing here can't find page name, search, you-are-here indicator [M]
- Change: Add page name, search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add page name, search, you-are-here indicator to the persistent header on every page.
  - Apply on digitalocean.com/pricing/calculator
  - Apply on digitalocean.com/company/contact/sales
- Rationale: On 2 page(s) a visitor dropped in cold can't find: page name, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_869a8c38 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 3. Too many links compete for attention (15 of 15 pages) [S]
- Change: Group the secondary links under a few sections so the main action stands out.
- Steps:
  - Group the secondary links under a few sections so the main action stands out.
  - Apply on digitalocean.com/
  - Apply on digitalocean.com/pricing/agent-droplets
  - Apply on digitalocean.com/products/gpu-droplets
  - Apply on digitalocean.com/pricing
  - Apply on digitalocean.com/products/droplets
  - Apply on digitalocean.com/pricing/calculator
  - Apply on digitalocean.com/blog/now-available-prompt-caching
  - Apply on digitalocean.com/blog
  - …and 7 more affected locations
- Rationale: "AI-Native Cloud | DigitalOcean" offers 156 different links — too many choices to sort through at a glance. Also: "Agent Droplets Pricing | DigitalOcean" offers 119 different links — too many choices to sort through at a glance. "GPU Droplets | DigitalOcean" offers 151 different links — too many choices to sort through at a glance. "Budget-Friendly Cloud Server Pricing | DigitalOcean" offers 161 different links — too many choices to sort through at a glance. "DigitalOcean Droplets | Scalable Cloud Compute Starting at $4/mo" offers 144 different links — too many choices to sort through at a glance. "Pricing Calculator | DigitalOcean" offers 42 different links — too many choices to sort through at a glance. "Prompt Caching is GA on DigitalOcean Serverless Inference: Up to 90% Off the Context Your Agents Resend | DigitalOcean" offers 123 different links — too many choices to sort through at a glance. "DigitalOcean Blog" offers 218 different links — too many choices to sort through at a glance. "Careers | DigitalOcean" offers 269 different links — too many choices to sort through at a glance. "Contact Sales at DigitalOcean" offers 119 different links — too many choices to sort through at a glance. "AI-Native Cloud | DigitalOcean" offers 149 different links — too many choices to sort through at a glance. "Managed Agents | DigitalOcean" offers 126 different links — too many choices to sort through at a glance. "Learning Services | DigitalOcean" offers 121 different links — too many choices to sort through at a glance. "Data Services | DigitalOcean" offers 119 different links — too many choices to sort through at a glance. "AI Inference Engine | Serverless, Batch & Dedicated Inference | DigitalOcean" offers 127 different links — too many choices to sort through at a glance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_c2b43fc7_151

### 4. 3 link labels don't say where they go (2 of 15 pages) [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Update the "Read more" link
  - Apply on digitalocean.com/products/gpu-droplets
  - Apply on digitalocean.com/blog/now-available-prompt-caching
- Rationale: Labels like "Learn more", "Learn more", "Learn more" make visitors guess — they have to click to find out where the link leads. Also: Labels like "Read more", "Read more", "Read more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_11dcf06c_153 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 5. 1 link label doesn't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "here" link
  - Apply on digitalocean.com/pricing
- Rationale: Labels like "here" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_1b41d5e3_155 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 6. 11 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Update the "Read more" link
  - Update the "Learn More" link
  - Apply on digitalocean.com/products/droplets
- Rationale: Labels like "Learn more", "Read more", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_dea7e301_157 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 7. 63 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Read more" link
  - Apply on digitalocean.com/blog
- Rationale: Labels like "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_72a3e07e_165 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 8. 6 link labels don't say where they go (2 of 15 pages) [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Read more" link
  - Update the "Learn more" link
  - Apply on digitalocean.com/careers
  - Apply on digitalocean.com/products/inference-engine
- Rationale: Labels like "Read more", "Read more", "Read more", "Learn more", "Learn more", "Learn more" make visitors guess — they have to click to find out where the link leads. Also: Labels like "Learn more", "Learn more", "Learn more", "Learn more", "Learn more", "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_8a8315b0_167 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 9. 4 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Update the "Learn More" link
  - Apply on digitalocean.com/products
- Rationale: Labels like "Learn more", "Learn More", "Learn More", "Learn More" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_87ebc04e_170 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 10. 2 link labels don't say where they go [S]
- Change: Rename each label so it names its destination ("View pricing", not "Learn more").
- Steps:
  - Rename each label so it names its destination ("View pricing", not "Learn more").
  - Update the "Learn more" link
  - Apply on digitalocean.com/products/managed-agents
- Rationale: Labels like "Learn more", "Learn more" make visitors guess — they have to click to find out where the link leads. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Don't make users think
- Evidence: finding f_dc44424c_172 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 11. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Steps:
  - Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
  - Apply on digitalocean.com/
  - Apply on digitalocean.com/products/gpu-droplets
  - Apply on digitalocean.com/pricing/calculator
  - Apply on digitalocean.com/blog/now-available-prompt-caching
  - Apply on digitalocean.com/blog
  - Apply on digitalocean.com/careers
  - Apply on digitalocean.com/products
  - Apply on digitalocean.com/products/managed-agents
  - …and 2 more affected locations
- Rationale: 7 above-the-fold actions are equally prominent by size ("Product updates", "Engineering", "Trust & Security", "Partner News", "Get started", "Agree & proceed", "Decline all") on "DigitalOcean Blog", so visitors have to stop and compare instead of picking the obvious next step. [reproducible-concern; How much interpretation does selecting an action require?]
- Principle: Make every choice obvious
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_c54a46e0_desktop_d0.png, data/evidence/exp_c54a46e0_desktop_d1.png)

### 12. Desktop: primary navigation has 17 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Steps:
  - Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
  - Apply on digitalocean.com/
  - Apply on digitalocean.com/pricing/agent-droplets
  - Apply on digitalocean.com/products/gpu-droplets
  - Apply on digitalocean.com/pricing
  - Apply on digitalocean.com/products/droplets
  - Apply on digitalocean.com/pricing/calculator
  - Apply on digitalocean.com/blog/now-available-prompt-caching
  - Apply on digitalocean.com/blog
  - …and 7 more affected locations
- Rationale: The top navigation exposes up to 17 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_c54a46e0_desktop_d0.png, data/evidence/exp_c54a46e0_desktop_d1.png)

### 13. The page threw 6 script errors during desktop runs [S]
- Change: Fix or silence the failing scripts so the page behaves the same for every visitor.
- Steps:
  - Fix or silence the failing scripts so the page behaves the same for every visitor.
  - Apply on digitalocean.com/
- Rationale: 6 page/console errors across 4 of 4 desktop runs, e.g. "console: Loading the script 'https://a.usbrowserspeed.com/cs?pid=b910e4cfe0d26c8f65884d90d71e4eb6628b4c8f3747dbae6c22ea2", "console: Loading the script 'https://a.usbrowserspeed.com/cs?pid=b910e4cfe0d26c8f65884d90d71e4eb6628b4c8f3747dbae6c22ea2", "console: Loading the script 'https://a.usbrowserspeed.com/cs?pid=b910e4cfe0d26c8f65884d90d71e4eb6628b4c8f3747dbae6c22ea2". They don't fail the goal check, but scripts that break quietly are how pages start behaving unpredictably. [reproducible-concern; Do labels and interactions behave predictably?]
- Principle: Test, don't argue
- Evidence: finding f_console-errors_desktop (data/evidence/run_agent-0013_desktop_0.png, data/evidence/run_agent-0013_desktop_3.png, data/evidence/run_agent-0007_desktop_0.png)

### 14. Desktop: the homepage takes 6.76 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Steps:
  - Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
  - Apply on digitalocean.com/
- Rationale: The homepage is 6085px tall at a 900px viewport — 6.76 screens, roughly 10.1s before a visitor has seen everything. Visitors mostly see what sits near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_c54a46e0_desktop_d0.png)

### 15. Heading outline is broken: skips h1→h3 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on digitalocean.com/
  - Apply on digitalocean.com/blog
  - Apply on digitalocean.com/careers
  - Apply on digitalocean.com/products/data-services
- Rationale: 4 page(s) have a heading outline with skips h1→h3 (h1: "AI-Native Cloud"). Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_b1106aad (data/evidence/exp_c54a46e0_desktop_d0.png, data/evidence/exp_c54a46e0_desktop_d1.png)

### 16. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Steps:
  - Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
  - Apply on digitalocean.com/pricing/calculator
  - Apply on digitalocean.com/company/contact/sales
- Rationale: 2 page(s) have a heading outline with no h1. Headings are how scanners build the page's outline; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Principle: People scan, they don't read
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 17. Desktop: a visitor landing here can't find search [S]
- Change: Add search to the persistent header on every page.
- Steps:
  - Add search to the persistent header on every page.
  - Apply on digitalocean.com/
- Rationale: On 1 page(s) a visitor dropped in cold can't find: search. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_6dfb6555 (data/evidence/exp_c54a46e0_desktop_d0.png)

### 18. Desktop: a visitor landing here can't find search, you-are-here indicator [S]
- Change: Add search, you-are-here indicator to the persistent header on every page.
- Steps:
  - Add search, you-are-here indicator to the persistent header on every page.
  - Apply on digitalocean.com/pricing/agent-droplets
  - Apply on digitalocean.com/products/gpu-droplets
  - Apply on digitalocean.com/pricing
  - Apply on digitalocean.com/products/droplets
  - Apply on digitalocean.com/blog/now-available-prompt-caching
  - Apply on digitalocean.com/blog
  - Apply on digitalocean.com/products
  - Apply on digitalocean.com/products/managed-agents
  - …and 3 more affected locations
- Rationale: On 11 page(s) a visitor dropped in cold can't find: search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_2ec22c22 (data/evidence/exp_c54a46e0_desktop_d1.png)

### 19. Desktop: a visitor landing here can't find you-are-here indicator [S]
- Change: Add you-are-here indicator to the persistent header on every page.
- Steps:
  - Add you-are-here indicator to the persistent header on every page.
  - Apply on digitalocean.com/careers
- Rationale: On 1 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Principle: Always show where you are
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_c54a46e0_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Fix anything stale or wrong. The page should say what is true today.
- The page still invites registration for an event that already happened (3 of 15 pages)
- Desktop: a visitor landing here can't find page name, search, you-are-here indicator

### Hierarchy pass
Goal: Make one action obvious and the page easy to scan.
- Cut the main nav to about 7 items
- Put one main call to action above the fold
- Too many links compete for attention (15 of 15 pages)
- 3 link labels don't say where they go (2 of 15 pages)
- 1 link label doesn't say where they go

### Verification loop
Goal: Run the same checks on the rebuild before it ships.
- Rerun the experiment on staging
- Compare the baseline with the rebuild
