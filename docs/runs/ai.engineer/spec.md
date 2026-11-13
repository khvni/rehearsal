# Rehearsal spec — https://ai.engineer/code/2026

Goal: find the schedule and register to attend
Generated: 2026-11-13T22:21:39.091Z

## Summary
Rebuild https://ai.engineer/code/2026 around a single, verifiable registration flow and an unambiguous path to the CODE 2026 schedule, fixing broken cross-event navigation and failing register/confirm assertions. Consolidate the bloated 68-item navigation, 16-screen homepage, and contradictory pre/post-event copy into a scannable hierarchy that passes trunk-test and pricing clarity checks.

## Changes (by impact)

### 1. Registration flow is undiscoverable from the landing page and fails goal completion [M]
- Change: Place a prominent, direct 'Register / Apply to Attend' button in the primary hero and top navigation of https://ai.engineer/code/2026 that links directly to https://ai.engineer/code/2026/apply (or a dedicated registration form with clear confirmation feedback).
- Rationale: All four desktop runs failed to reach a registration or confirmation URL or render a confirmation element. Although the landing page text includes 'APPLY TO ATTEND', none of the captured links on https://ai.engineer/code/2026 point to an application or registration page; the https://ai.engineer/code/2026/apply endpoint is only exposed inside llms.txt and on the /data page. [hypothesis; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_29cd75e5_26

### 2. Global header navigation on subpages routes to a different, past event (World's Fair 2025) [M]
- Change: Scope the header navigation on all /code/2026/* routes to CODE 2026 pages (Home -> /code/2026, Schedule -> /code/2026/schedule, Sponsor Inquiry -> CODE 2026 sponsorship) and remove stale links to unrelated conferences.
- Rationale: On /code/2026/schedule, /code/2026/talks, /code/2026/guide/sponsorship, and talk pages, the top navigation links 'Home' and 'Schedule' point to https://ai.engineer/worldsfair/2025 and https://ai.engineer/worldsfair/2025/schedule, 'Volunteer' points to /nyc/2026/associates, and 'Sponsor Inquiry' opens an email for 'AIE World's Fair 2025 Sponsor Inquiry'. [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_f40fa8a4_27

### 3. Assertion failed in browser: url-matches ".*(register|confirm).*" (4 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t0_desktop (desktop) failed assertion url-matches on value ".*(register|confirm).*". Also: Browser run run_t1_desktop (desktop) failed assertion url-matches on value ".*(register|confirm).*". Browser run run_t2_desktop (desktop) failed assertion url-matches on value ".*(register|confirm).*". Browser run run_t3_desktop (desktop) failed assertion url-matches on value ".*(register|confirm).*". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_afc3eaed_0 (data/evidence/run_t0_desktop_0.png, data/evidence/run_t1_desktop_0.png, data/evidence/run_t2_desktop_0.png, data/evidence/run_t3_desktop_0.png)

### 4. Assertion failed in browser: element-visible "true" (4 of 4 runs) [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t0_desktop (desktop) failed assertion element-visible on value "true". Also: Browser run run_t1_desktop (desktop) failed assertion element-visible on value "true". Browser run run_t2_desktop (desktop) failed assertion element-visible on value "true". Browser run run_t3_desktop (desktop) failed assertion element-visible on value "true". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_3944e62f_1 (data/evidence/run_t0_desktop_0.png, data/evidence/run_t1_desktop_0.png, data/evidence/run_t2_desktop_0.png, data/evidence/run_t3_desktop_0.png)

### 5. Post-event page still invites registration (6 of 15 pages) [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco" shows dates in the past (NOV 10-12, 2026) alongside active registration/apply language — a stale-content inconsistency. Also: Page "https://ai.engineer/code/2026/llms.txt" shows dates in the past (NOVEMBER 10-12, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_f91629dc_8 (data/evidence/exp_15f495ed_desktop_d0.png, data/evidence/exp_15f495ed_desktop_d1.png)

### 6. Desktop: missing site ID, page name, primary navigation, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (site ID, page name, primary navigation, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: site ID, page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_554d08b1 (data/evidence/exp_15f495ed_desktop_d1.png)

### 7. Desktop: missing page name, primary navigation, search, you-are-here indicator (trunk test fails) [M]
- Change: Add the missing trunk-test signals (page name, primary navigation, search, you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: page name, primary navigation, search, you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_009ced81 (data/evidence/exp_15f495ed_desktop_d1.png)

### 8. Dense link surface increases scan cost (12 of 15 pages) [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 407 distinct links compete for attention on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco". Also: 405 distinct links compete for attention on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco". 55 distinct links compete for attention on "Data / MCP / Skills · AI Engineer". 250 distinct links compete for attention on "Talks & reading editions | AI Engineer CODE 2026". 403 distinct links compete for attention on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco". 312 distinct links compete for attention on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco". 296 distinct links compete for attention on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco". 523 distinct links compete for attention on "What will you build when AI is 10× faster? | AI Engineer CODE 2026". 588 distinct links compete for attention on "Rethinking Claude Code Best Practices | AI Engineer CODE 2026". 615 distinct links compete for attention on "cloudflare is a neolab | AI Engineer CODE 2026". 501 distinct links compete for attention on "All Code Is Slop (Except Mine) | AI Engineer CODE 2026". 227 distinct links compete for attention on "Read the inference state before the agent acts | AI Engineer CODE 2026". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_5c4ea639_9

### 9. Desktop: homepage requires 16.01 screens of scrolling [S]
- Change: Pull the primary path and key facts into the first one or two screens; collapse or link out secondary sections.
- Rationale: The homepage is 14408px tall at a 900px viewport — 16.01 screens, roughly 24s of scanning before a visitor has seen everything. Scanners satisfice on what's near the top. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_long-scroll_566fbc10 (data/evidence/exp_15f495ed_desktop_d0.png, data/evidence/exp_15f495ed_desktop_d1.png)

### 10. Desktop: no single dominant call to action above the fold [S]
- Change: Make one primary action visibly dominant (size, fill, position) and demote the rest to secondary styling.
- Rationale: 9 above-the-fold actions are equally prominent by size ("WELCOME WELCOME WELCOME AIE Code Summit 2026", "WATCH & READ WATCH & READ WATCH & READ Recordings, essays & transcripts", "WHY ATTEND WHY ATTEND WHY ATTEND Built for practitioners", "APPLY TO ATTEND APPLY TO ATTEND APPLY TO ATTEND", "SPEAKERS SPEAKERS SPEAKERS First speakers announced", "PROGRAM PROGRAM PROGRAM Daily agenda", "VENUE VENUE VENUE Hilton Union Square, SF", "SIDE EVENTS Events around the summit") on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco", so visitors must stop and compare instead of making a mindless choice. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_metric_cta-ambiguity_23955fda (data/evidence/exp_15f495ed_desktop_d0.png, data/evidence/exp_15f495ed_desktop_d1.png)

### 11. Desktop: primary navigation has 68 items [S]
- Change: Group navigation into 7 or fewer top-level sections; move the rest into sub-navigation or the footer.
- Rationale: The top navigation exposes up to 68 visible items (more than 7), which makes the major sections harder to name at a glance. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_nav-overload_752dcb69 (data/evidence/exp_15f495ed_desktop_d0.png, data/evidence/exp_15f495ed_desktop_d1.png)

### 12. "How much does it cost?" has no answer path [S]
- Change: Decide whether visitors should get an answer to "How much does it cost?"; if so, add it (or a clearly labeled link to it) where they arrive, and point it at the action you want them to take next.
- Rationale: unanswered-question: visitors are likely to ask "How much does it cost?" (quotation, importance 0.75). None of the 15 discovered states or their links answer it (looked for pricing). [hypothesis; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_unanswered-question_cost (data/evidence/exp_15f495ed_desktop_d0.png)

### 13. Links labeled 'Schedule' behave inconsistently across pages [S]
- Change: Standardize every 'Schedule' link within the CODE 2026 experience to point consistently to https://ai.engineer/code/2026/schedule, and rename the talk-archive view toggle on the homepage (e.g., 'Session Order' vs. 'Companies A–Z').
- Rationale: Clicking 'Schedule' on https://ai.engineer/code/2026 navigates to https://ai.engineer/code/2026? (reloading the homepage talk-archive switcher), whereas clicking 'Schedule' in the header of subpages routes to https://ai.engineer/worldsfair/2025/schedule, and the actual 108-session conference agenda resides at https://ai.engineer/code/2026/schedule. [hypothesis; Do labels and interactions behave predictably?]
- Krug principle: conventions
- Evidence: finding f_23154df6_28

### 14. Contradictory pre-event and post-event messaging obscures whether attendance is open [S]
- Change: Clarify the current status of the event immediately above the fold—either clearly state that applications are open for the upcoming Nov 10–12, 2026 summit (separating past-year recordings) or explicitly label the event as concluded with registration closed.
- Rationale: The landing page promotes 'APPLY TO ATTEND', 'First speakers announced', and 'First sponsors announced' alongside full 'Recordings, essays & transcripts', YouTube livestreams for all 50 sessions, and a schedule marked 'updated Nov 13', leaving users uncertain whether the summit is upcoming or has already taken place. [hypothesis; Is the purpose of the page immediately apparent?]
- Krug principle: dont-make-me-think
- Evidence: finding f_89e93a32_29

### 15. Repeated text strings, binary headers, and duplicated link labels add visual noise [S]
- Change: Remove repeated decorative strings and non-functional text tokens from headings and action labels so each call to action is concise, single-instance, and immediately scannable.
- Rationale: The landing page text repeats labels multiple times ('//LOCATION //LOCATION //LOCATION', 'WELCOME WELCOME WELCOME', 'APPLY TO ATTEND APPLY TO ATTEND APPLY TO ATTEND', 'BECOME A SPONSOR BECOME A SPONSOR BECOME A SPONSOR') and leads with binary digits ('01000011 01001111...'), forcing users to wade through decorative text before finding actionable links. [hypothesis; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_dcf5220b_30

### 16. Stacked navigation bars and redundant per-talk links weaken visual hierarchy [S]
- Change: Consolidate navigation into a single clear global bar plus a contextual breadcrumb, and collapse redundant session links into a single clickable card or title link.
- Rationale: On https://ai.engineer/code/2026/talks, users encounter three stacked navigation groups ('Schedule / Workshops / Quick Actions', 'Upcoming Events / Past Events / Talks...', and 'Talks / Speakers / Topics...'). On the homepage, each session renders three consecutive links ('Read <Title>', '<Title>', and 'Read the talk →') pointing to the exact same URL. [hypothesis; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_c80f09a5_31

### 17. Broken recovery path when navigating back from subpages [S]
- Change: Ensure the primary 'Home' link and site logo consistently return users to https://ai.engineer/code/2026 (or clearly distinguish global 'AI Engineer Home' from 'CODE 2026 Home').
- Rationale: When a user navigates to /code/2026/schedule, /code/2026/talks, or the sign-in-gated /code/2026/guide/sponsorship page, the primary 'Home' link routes to https://ai.engineer/worldsfair/2025 rather than https://ai.engineer/code/2026, stranding users who attempt to backtrack via standard header conventions. [hypothesis; Can the user recover from an incorrect action?]
- Krug principle: navigation
- Evidence: finding f_219116fe_32

### 18. Generic 'button' labels and developer-centric routing increase cognitive effort [S]
- Change: Give every interactive button an explicit, descriptive accessible label and prioritize standard attendee tasks ('Schedule', 'Apply / Register', 'Venue') over developer/agent metadata endpoints.
- Rationale: Interactive elements on /code/2026/schedule and /code/2026/guide/sponsorship appear in the accessibility tree with the generic label 'button', while homepage navigation surfaces 'FOR AGENTS MCP, llms.txt & JSON' alongside unlabeled or non-obvious schedule filters, requiring extra interpretation to locate standard attendee actions. [hypothesis; How much interpretation does selecting an action require?]
- Krug principle: mindless-choices
- Evidence: finding f_32188f1b_33

### 19. Heading outline is broken: 3 h1 elements [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 5 page(s) have a heading outline with 3 h1 elements (h1: "A YEAR OF AGENTIC CODING. ONE ROOM.#", "A YEAR OF AGENTIC CODING. ONE ROOM.#", "A YEAR OF AGENTIC CODING. ONE ROOM.#"). Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_b178c0b6 (data/evidence/exp_15f495ed_desktop_d0.png, data/evidence/exp_15f495ed_desktop_d1.png)

### 20. Heading outline is broken: no h1 [S]
- Change: Use exactly one h1 naming the page, then nest h2/h3 without skipping levels.
- Rationale: 2 page(s) have a heading outline with no h1. Headings are the scanning skeleton; gaps and competing h1s blur what matters most. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_heading-outline_ee185a40 (data/evidence/exp_15f495ed_desktop_d1.png)

### 21. Desktop: largest text on the page is not the h1 [S]
- Change: Make the page's h1 the most prominent text, or promote the largest text to be the h1.
- Rationale: On 1 page(s) some other text renders larger than the h1, so visual prominence doesn't match importance. [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_metric_hierarchy-mismatch_ffa615dc (data/evidence/exp_15f495ed_desktop_d1.png)

### 22. Desktop: missing you-are-here indicator (trunk test fails) [S]
- Change: Add the missing trunk-test signals (you-are-here indicator) to the persistent header on every page.
- Rationale: On 1 page(s) a visitor dropped in cold can't find: you-are-here indicator. Persistent navigation should answer what site this is, what page they're on, the major sections, how to search and where they are. [reproducible-concern; Is the next relevant action discoverable and conventional?]
- Krug principle: navigation
- Evidence: finding f_metric_trunk-test_aee677af (data/evidence/exp_15f495ed_desktop_d1.png)

### 23. 1 of 23 expected visitor questions have no answer path [S]
- Change: Pick which questions the site should answer and which action each answer should lead to; start with "How much does it cost?".
- Rationale: unanswered-question summary: 22/23 likely visitor questions are answered by the 15 discovered states or their endpoints. Unanswered: "How much does it cost?". [hypothesis; Can the intended outcome be verified?]
- Krug principle: navigation
- Evidence: finding f_unanswered-questions-summary (data/evidence/exp_15f495ed_desktop_d0.png)

## Rebuild plan

### Phase 1: Core Registration & Navigation Repair
Goal: Restore goal completion for finding the schedule and registering, and pass all automated browser assertions.
- Decide and publish canonical event status (active Nov 10–12, 2026 registration vs. post-event recordings/waitlist) in the hero.
- Create/wire the /code/2026/register flow (with confirmation URL and visible confirmation UI) and link the primary hero and header CTAs directly to it.
- Fix all /code/2026/* header links so Home points to /code/2026 and Schedule points to /code/2026/schedule instead of /worldsfair/2025.
- Add ticket pricing and attendance cost details to the landing page and registration flow.

### Phase 2: Information Architecture & Trunk-Test Header
Goal: Give visitors instant orientation on every page and cut top-level navigation bloat.
- Build a single unified persistent header with CODE 2026 site ID, <=7 primary nav items, search bar, and active you-are-here indicator.
- Eliminate the 3 stacked navigation bars on /code/2026/talks and add consistent breadcrumbs on all subpages.
- Rename the homepage archive toggle ('Session Order' vs. 'Companies A–Z') so it no longer collides with 'Schedule'.
- Move developer/agent links (MCP, llms.txt, JSON) from primary navigation to a dedicated footer section.

### Phase 3: Homepage Compression & Visual Hierarchy
Goal: Reduce the 16-screen homepage to a focused, scannable entry point with one unmistakable CTA.
- Promote one dominant primary CTA above the fold, keep 'View Schedule' secondary, and demote the remaining 7 equal-sized hero cards.
- Shorten the homepage from 14,408px to 2–3 screens by moving full session directories to /code/2026/schedule and /code/2026/talks.
- Remove repeated decorative phrases ('WELCOME WELCOME WELCOME', '//LOCATION //LOCATION //LOCATION') and leading binary strings.
- Consolidate triple-linked talk rows into single-link session cards across the homepage and /talks.

### Phase 4: Semantic Outline, Accessibility & Verification
Goal: Ensure clean document structure, accessible controls, and verified end-to-end user journeys.
- Audit every route to enforce one descriptive <h1> (visually largest text) and sequential <h2>/<h3> nesting.
- Replace all generic 'button' accessibility labels on /code/2026/schedule filters and /code/2026/guide/sponsorship with explicit labels.
- Re-run desktop browser verification suite to confirm url-matches '.*(register|confirm).*', confirmation visibility, trunk-test, and link-density metrics pass.
