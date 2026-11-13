# Rehearsal spec — https://sentry.io/welcome/

Goal: find pricing and start a trial
Generated: 2026-11-13T21:22:57.785Z

## Summary
Rehearsal verified 5 browser runs against https://sentry.io/welcome/: 1 verified failure(s), 4 reproducible concern(s). 5 total findings mapped to 5 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "trial" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t137_desktop (desktop) failed assertion url-matches on value "trial". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_35e62a75_85 (data/evidence/run_t137_desktop_0.png, data/evidence/run_t137_desktop_3.png, data/evidence/run_t137_desktop_6.png, data/evidence/run_t137_desktop_9.png)

### 2. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 89 distinct links compete for attention on "Application Performance Monitoring & Error Tracking Software | Sentry". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_e2d670bf_89

### 3. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read More", "Read More", "read more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_ebe54e30_95 (data/evidence/exp_c214fbf0_desktop_d1.png)

### 4. Ambiguous link labels (2) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_2f9cd356_102 (data/evidence/exp_c214fbf0_desktop_d1.png)

### 5. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_cb07c236_107 (data/evidence/exp_c214fbf0_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "trial"

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost
- Ambiguous link labels (3)
- Ambiguous link labels (2)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
