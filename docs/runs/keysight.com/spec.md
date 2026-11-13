# Rehearsal spec — https://www.keysight.com/us/en/home.html

Goal: find pricing or request a quote for an oscilloscope
Generated: 2026-11-13T21:13:23.667Z

## Summary
Rehearsal verified 5 browser runs against https://www.keysight.com/us/en/home.html: 1 verified failure(s), 0 reproducible concern(s). 1 total findings mapped to 1 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "oscilloscope" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t0_desktop (desktop) failed assertion url-matches on value "oscilloscope". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_b3d2863f_0 (data/evidence/run_t0_desktop_0.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "oscilloscope"

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
