# Multi-site sweep

Headless `Orchestrator.runAll` against live sites with the keyless stack (local Playwright, fixture Jev/LLM).
Budget: maxStates 15, trajectories 300, verifyCount 4, desktop viewport, seed 1337.
Regenerate one site with `npm run site -- <url> --goal "..."`, all with `npm run site -- --all`.

Columns: HTTP = preflight status; goal % = simulated trajectories reaching the compiled assertion;
verify = browser runs that completed navigation and passed the goal assertion; assert = runs whose goal assertion held
(console errors are reported as a low-severity finding, not a verify failure);
endpoints = per endpoint class, reached by ≥1 seeded journey / found; findings = critical/high/medium/low; times in seconds.

| Site | Goal | Status | HTTP | States | Edges | Goal % | Verify | Assert | Endpoints reached/found | Findings c/h/m/l | Discover s | Verify s | Total s | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [brightdata.com](brightdata.com/summary.json) | find pricing for the Web Unlocker | blocked | 429 | 1 | 0 | 0 | 0/4 | 0/4 | – | 0/5/6/3 | 20 | 69 | 109 | Cloudflare challenge |
| [devpost.com](devpost.com/summary.json) | find an upcoming hackathon to join | complete | 200 | 15 | 110 | 95.3 | 2/4 | 3/4 | signup 3/3, contact-form 1/1, docs-answers 2/2, schedule-event 2/2 | 0/3/4/5 | 33 | 16 | 60 |  |
| [digitalocean.com](digitalocean.com/summary.json) | find droplet pricing | complete | 200 | 15 | 321 | 51.7 | 1/4 | 1/4 | pricing 5/5, signup 5/5, contact-form 2/5, docs-answers 0/5, demo-video 0/2, schedule-event 0/5 | 0/3/10/7 | 35 | 49 | 90 | 1 page failures |
| [heygen.com](heygen.com/summary.json) | find pricing and sign up | complete | 200 | 15 | 255 | 52.3 | 1/4 | 1/4 | pricing 2/5, signup 5/5, contact-form 1/3, docs-answers 4/5, demo-video 0/5, download 0/3, schedule-event 0/3 | 0/2/7/6 | 38 | 23 | 67 |  |
| [hyperframes.studio](hyperframes.studio/summary.json) | understand what the product does and request a demo | blocked | – | 0 | 0 | 0 | 0/0 | 0/0 | – | 0/0/0/0 | 34 | – | 99 | renderer unresponsive in headless Chromium |
| [keysight.com](keysight.com/summary.json) | find pricing or request a quote for an oscilloscope | complete | 200 | 15 | 52 | 26.3 | 1/4 | 1/4 | contact-form 5/5, signup 2/2, pricing 1/1, docs-answers 2/5, demo-video 2/3, download 0/5, schedule-event 0/5 | 0/2/7/4 | 192 | 17 | 219 | 1 page failures |
| [mlh.io](mlh.io/summary.json) | find the upcoming hackathon schedule | complete | 200 | 13 | 122 | 91 | 0/4 | 0/4 | schedule-event 5/5, signup 4/5, contact-form 1/2, docs-answers 1/5, demo-video 1/4 | 0/2/7/7 | 32 | 21 | 60 | 1 page failures |
| [mtc.so](mtc.so/summary.json) | find how to join or start a chapter | complete | 200 | 15 | 323 | 70 | 0/4 | 0/4 | signup 2/2, docs-answers 5/5, schedule-event 1/1, contact-form 2/2, next-steps 1/1 | 0/3/7/9 | 47 | 21 | 81 |  |
| [sentry.io](sentry.io/summary.json) | find pricing and start a trial | complete | 200 | 15 | 274 | 51.7 | 0/4 | 0/4 | pricing 2/5, signup 5/5, contact-form 1/2, docs-answers 4/5, demo-video 0/5, next-steps 0/5, schedule-event 0/5 | 0/3/8/8 | 36 | 35 | 77 |  |
| [snowflake.com](snowflake.com/summary.json) | start a free trial | complete | 200 | 15 | 143 | 1.7 | 0/4 | 0/4 | pricing 5/5, contact-form 2/5, signup 3/5, docs-answers 2/5, demo-video 0/5, download 0/5, next-steps 0/1, schedule-event 0/5 | 0/3/5/14 | 52 | 15 | 80 |  |
| [tigerdata.com](tigerdata.com/summary.json) | find pricing and sign up | complete | 200 | 15 | 139 | 45 | 0/4 | 1/4 | pricing 5/5, signup 3/4, contact-form 1/2, docs-answers 3/5, demo-video 0/1, download 0/4, schedule-event 0/2 | 0/3/4/5 | 32 | 21 | 57 |  |

Each site folder has `summary.json` (full metrics) and, when the pipeline completed, `spec.md`.
