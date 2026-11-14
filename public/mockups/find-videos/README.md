# Find and watch a CODE 2026 talk

A redesign mockup of https://ai.engineer/code/2026 built for one visitor goal: find a talk and start watching it.

Open `index.html` in a browser, or `/mockups/find-videos/index.html` on the dev server. It is one static file with no build step and no dependencies. The talk data (50 talks: title, speakers, company, day, track, summary, YouTube video id, start and end second) is inlined as JSON.

## How it works

- The page opens on the talk list. The h1, one line of context, a search box and the first talks fit in the first screen.
- Typing filters by title, speaker, company and summary, with matches highlighted. `/` focuses search, `Enter` plays the first result, `Esc` closes the player.
- Clicking a talk opens a YouTube player inline, cued to that talk's start and end inside the day's livestream. The visitor never leaves the page.
- Each talk has its own URL (`#simon-willison`). Opening that URL cues the player without autoplay.
- Below the player: a one-paragraph summary, the YouTube link with the timestamp, the transcript page and a copy-link button.

## Decisions and the findings behind them

Finding numbers refer to `docs/runs/ai.engineer/spec.md` in the repo.

| Decision | Finding | Krug principle |
| --- | --- | --- |
| Talks are the whole page. Venue, sponsors, side events, FAQ and the apply CTA are gone. | #9 homepage is 16 screens tall; #10 nine equally loud hero cards; #3 and #4 failed goal assertions | scanning-not-reading, mindless-choices |
| One click target per talk: the whole row. The live site renders three links per session ("Read <title>", the title, "Read the talk →") to one URL. | #16 redundant per-talk links; #8 250–523 links per page | scanning-not-reading |
| The player plays inline at the talk's own boundaries. On the live site, "Watch at 0:11:26" opens an 8-hour livestream in a new tab, and the bounded player sits on a separate talk page. | #8 talks sit behind heavy link surfaces | dont-make-me-think |
| Search is the first control, visible and sticky while scrolling. | #6, #7 trunk test fails on search | navigation |
| A single header: site ID, four links, "Talks" marked as the current page. Every header link stays inside CODE 2026. | #2 and #17 subpage nav routes to World's Fair 2025; #11 68 nav items; #22 no you-are-here indicator | navigation |
| The lede states the event took place Nov 11–12, so nobody wonders whether to register. | #5 post-event page still invites registration; #14 contradictory pre/post-event copy | omit-words, dont-make-me-think |
| One filter (All, Main stage, Online) and day headings in place of the Schedule / Companies A–Z switcher. "Schedule" in the header goes to the real schedule. | #13 "Schedule" means three different things | conventions |
| One h1 ("Watch the talks"), h2 per day, and the h1 is the largest text. | #19 three h1s; #20 no h1; #21 largest text is not the h1 | scanning-not-reading |
| No repeated decorative strings, binary digits or uppercase triplets. Labels say what they are: "Transcript", "Full day", "Copy link". | #15 repeated text strings; #18 generic button labels | omit-words, mindless-choices |
| MCP, llms.txt and JSON links move to a "For agents" footer column. Full-day livestreams and the transcript zip are in the footer too. | #18 developer links in primary nav; rebuild plan phase 2 | mindless-choices |
| Duration on every row, in tabular figures, so visitors can pick by length. | — (supports the watch goal) | scanning-not-reading |

Not addressed, because they belong to a registration goal: #1 and #12 (pricing and registration flow). A real rebuild would link "Next event" from the header once one is announced.

## Design

alikhani.co language: white background, `#111` ink, `#6b6b6b` muted text, `#ededed` hairlines, the `ui-sans-serif` system stack at weights 400 and 500, a 640px column and no eyebrows. Motion is limited to the player panel opening (240ms) and hover fills, and `prefers-reduced-motion` turns it off.

## Source data

`demo/aie-snapshot/` was not in the checkout. The talk list comes from the homepage snapshot in `tests/evals/fixtures/aie-code-2026.html`. The start and end seconds come from each live talk page (`https://ai.engineer/code/2026/talks/<slug>`, crawled Nov 13, 2026), which publishes the exact range its embedded player uses. The YouTube player loads only when a talk is opened.
