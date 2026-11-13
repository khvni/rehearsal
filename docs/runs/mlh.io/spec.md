# Rehearsal spec — https://www.mlh.com/

Goal: find the upcoming hackathon schedule
Generated: 2026-11-13T21:21:02.903Z

## Summary
Rehearsal verified 5 browser runs against https://www.mlh.com/: 1 verified failure(s), 1 reproducible concern(s). 2 total findings mapped to 2 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "schedule" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t5_desktop (desktop) failed assertion url-matches on value "schedule". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_1773740c_55 (data/evidence/run_t5_desktop_0.png, data/evidence/run_t5_desktop_3.png, data/evidence/run_t5_desktop_6.png, data/evidence/run_t5_desktop_9.png)

### 2. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 43 distinct links compete for attention on "Major League Hacking | Hackathons and Developer Programs | Major League Hacking". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_d4c75063_59

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "schedule"

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
