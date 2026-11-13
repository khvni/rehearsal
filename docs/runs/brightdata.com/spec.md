# Rehearsal spec — https://brightdata.com/

Goal: find pricing for the Web Unlocker
Generated: 2026-11-13T21:30:20.466Z

## Summary
Rehearsal verified 5 browser runs against https://brightdata.com/: 1 verified failure(s), 2 reproducible concern(s). 3 total findings mapped to 3 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "unlocker" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t5_desktop (desktop) failed assertion url-matches on value "unlocker". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_206f1681_0 (data/evidence/run_t5_desktop_0.png, data/evidence/run_t5_desktop_3.png, data/evidence/run_t5_desktop_4.png)

### 2. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_c14b01d6_3 (data/evidence/exp_fb9f7d9d_desktop_d0.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 172 distinct links compete for attention on "Bright Data: Web Data Infrastructure for Humans & Agents". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_10975777_4

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "unlocker"

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Ambiguous link labels (1)
- Dense link surface increases scan cost

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
