# Multi-site sweep

Headless `Orchestrator.runAll` against live sites with the keyless stack (local Playwright, fixture Jev/LLM).
Budget: maxStates 15, trajectories 300, verifyCount 4, desktop viewport, seed 1337.
Regenerate one site with `npm run site -- <url> --goal "..."`, all with `npm run site -- --all`.

Columns: HTTP = preflight status; goal % = simulated trajectories reaching the compiled assertion;
verify = browser runs that completed navigation and passed the goal assertion; assert = runs whose goal assertion held
(console errors are reported as a low-severity finding, not a verify failure);
findings = critical/high/medium/low; times in seconds.

| Site | Goal | Status | HTTP | States | Edges | Goal % | Verify | Assert | Findings c/h/m/l | Discover s | Verify s | Total s | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [ai.engineer](ai.engineer/summary.json) | find the schedule and register to attend | complete | 200 | 15 | 176 | 100 | 0/4 | 0/4 | 2/5/11/5 | 159 | 47 | 283 |  |
| [brightdata.com](brightdata.com/summary.json) | find pricing for the Web Unlocker | complete | 200 | 15 | 191 | 24.3 | 0/4 | 1/4 | 0/1/2/0 | 83 | 32 | 123 |  |
| [devpost.com](devpost.com/summary.json) | find an upcoming hackathon to join | complete | 200 | 15 | 110 | 97 | 1/4 | 2/4 | 0/8/18/5 | 33 | 15 | 62 |  |
| [digitalocean.com](digitalocean.com/summary.json) | find droplet pricing | complete | 200 | 15 | 321 | 54 | 0/4 | 1/4 | 0/2/8/0 | 34 | 33 | 73 | 1 page failures |
| [heygen.com](heygen.com/summary.json) | find pricing and sign up | complete | 200 | 15 | 255 | 52 | 0/4 | 1/4 | 0/1/2/0 | 36 | 18 | 62 |  |
| [hyperframes.studio](hyperframes.studio/summary.json) | understand what the product does and request a demo | blocked | – | 0 | 0 | 0 | 0/0 | 0/0 | 0/0/0/0 | 34 | – | 100 | renderer unresponsive in headless Chromium |
| [keysight.com](keysight.com/summary.json) | find pricing or request a quote for an oscilloscope | blocked | 200 | 1 | 0 | 0 | 0/4 | 0/4 | 0/1/0/0 | 20 | 27 | 54 | Cloudflare challenge |
| [mlh.io](mlh.io/summary.json) | find the upcoming hackathon schedule | complete | 200 | 13 | 122 | 0 | 0/4 | 0/4 | 0/1/1/0 | 32 | 42 | 82 | 1 page failures |
| [mtc.so](mtc.so/summary.json) | find how to join or start a chapter | complete | 200 | 15 | 308 | 25 | 0/4 | 1/4 | 0/2/1/0 | 56 | 58 | 136 |  |
| [sentry.io](sentry.io/summary.json) | find pricing and start a trial | complete | 200 | 15 | 274 | 0 | 0/4 | 0/4 | 0/1/4/0 | 36 | 30 | 74 |  |
| [snowflake.com](snowflake.com/summary.json) | start a free trial | complete | 200 | 15 | 143 | 0 | 0/4 | 0/4 | 0/2/2/0 | 45 | 8 | 57 |  |
| [tigerdata.com](tigerdata.com/summary.json) | find pricing and sign up | complete | 200 | 15 | 136 | 44.3 | 0/4 | 1/4 | 0/2/3/0 | 32 | 5 | 41 |  |

Each site folder has `summary.json` (full metrics) and, when the pipeline completed, `spec.md`.
