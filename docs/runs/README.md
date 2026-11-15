# Multi-site sweep

Headless `Orchestrator.runAll` against live sites with the keyless stack (local Playwright, fixture Jev/LLM).
Budget: maxStates 15, trajectories 300, verifyCount 4, persona swarm 20 agents × ≤8 steps (3 concurrent), desktop viewport, seed 1337.
Regenerate one site with `npm run site -- <url> --goal "..."`, all with `npm run site -- --all`.

Columns: HTTP = preflight status; goal % = simulated trajectories reaching the compiled assertion;
verify = browser runs that completed navigation and passed the goal assertion; assert = runs whose goal assertion held
(console errors are reported as a low-severity finding, not a verify failure);
endpoints = per endpoint class, reached by ≥1 seeded journey / found; findings = critical/high/medium/low; times in seconds.

| Site | Goal | Status | HTTP | States | Edges | Goal % | Verify | Assert | Endpoints reached/found | Findings c/h/m/l | Discover s | Verify s | Total s | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [ai.engineer](ai.engineer/summary.json) | find the schedule and register to attend | complete | 200 | 15 | 176 | 100 | 0/4 | 0/4 | – | 2/5/11/5 | 159 | 47 | 283 |  |
| [brightdata.com](brightdata.com/summary.json) | find pricing for the Web Unlocker | complete | 200 | 15 | 240 | 15 | 1/4 | 1/4 | contact-form 1/1, pricing 3/3, docs-answers 3/5, demo-video 5/5, download 0/3, schedule-event 0/5 | 0/2/5/7 | 59 | 70 | 258 |  |
| [devpost.com](devpost.com/summary.json) | find an upcoming hackathon to join | complete | 200 | 15 | 97 | 80 | 2/4 | 2/4 | signup 3/3, contact-form 1/1, docs-answers 2/2, schedule-event 2/2 | 0/3/4/5 | 59 | 8 | 100 |  |
| [digitalocean.com](digitalocean.com/summary.json) | find droplet pricing | complete | 200 | 15 | 321 | 100 | 4/4 | 4/4 | pricing 5/5, signup 5/5, contact-form 2/5, docs-answers 0/5, demo-video 0/2, schedule-event 0/5 | 0/2/10/7 | 61 | 9 | 120 | 1 page failures |
| [heygen.com](heygen.com/summary.json) | find pricing and sign up | complete | 200 | 15 | 255 | 90 | 2/4 | 2/4 | pricing 2/5, signup 5/5, contact-form 1/3, docs-answers 4/5, demo-video 0/5, download 0/3, schedule-event 0/3 | 0/2/6/6 | 66 | 8 | 107 |  |
| [hyperframes.studio](hyperframes.studio/summary.json) | understand what the product does and request a demo | blocked | – | 0 | 0 | 0 | 0/0 | 0/0 | – | 0/0/0/0 | 32 | – | 66 | renderer unresponsive in headless Chromium |
| [keysight.com](keysight.com/summary.json) | find pricing or request a quote for an oscilloscope | complete | 200 | 15 | 65 | 55 | 1/4 | 1/4 | contact-form 5/5, pricing 2/2, signup 3/3, docs-answers 2/5, demo-video 0/5, download 0/5, schedule-event 0/5 | 0/3/11/3 | 237 | 12 | 306 | 2 page failures |
| [mlh.io](mlh.io/summary.json) | find the upcoming hackathon schedule | complete | 200 | 13 | 122 | 65 | 0/4 | 0/4 | schedule-event 5/5, signup 4/5, contact-form 1/2, docs-answers 1/5, demo-video 1/4, next-steps 0/1 | 0/2/7/8 | 59 | 18 | 122 | 1 page failures |
| [mtc.so](mtc.so/summary.json) | find how to join or start a chapter | complete | 200 | 15 | 308 | 5 | 1/4 | 1/4 | signup 2/2, schedule-event 2/2, docs-answers 5/5, contact-form 2/2, next-steps 1/2 | 0/2/6/7 | 99 | 34 | 226 |  |
| [sentry.io](sentry.io/summary.json) | find pricing and start a trial | complete | 200 | 15 | 274 | 75 | 0/4 | 0/4 | pricing 2/5, signup 5/5, contact-form 1/2, docs-answers 4/5, demo-video 0/5, next-steps 0/5, schedule-event 0/5 | 0/3/8/8 | 67 | 18 | 131 |  |
| [snowflake.com](snowflake.com/summary.json) | start a free trial | complete | 200 | 15 | 138 | 5 | 0/4 | 0/4 | pricing 5/5, contact-form 2/5, signup 3/5, docs-answers 2/5, demo-video 0/5, download 0/5, next-steps 0/1, schedule-event 0/5 | 0/3/5/14 | 59 | 7 | 109 |  |
| [tigerdata.com](tigerdata.com/summary.json) | find pricing and sign up | complete | 200 | 15 | 140 | 25 | 1/4 | 1/4 | pricing 5/5, signup 3/4, contact-form 1/2, docs-answers 3/5, demo-video 0/1, download 0/3, schedule-event 0/2 | 0/3/4/5 | 59 | 4 | 87 |  |

Each site folder has `summary.json` (full metrics) and, when the pipeline completed, `spec.md`.
