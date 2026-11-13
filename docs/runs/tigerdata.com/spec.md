# Rehearsal spec — https://www.tigerdata.com/

Goal: find pricing and sign up
Generated: 2026-11-13T21:21:43.743Z

## Summary
Rehearsal verified 5 browser runs against https://www.tigerdata.com/: 1 verified failure(s), 4 reproducible concern(s). 5 total findings mapped to 5 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "pricing" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t29_desktop (desktop) failed assertion url-matches on value "pricing". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_7befe95d_72 (data/evidence/run_t29_desktop_0.png, data/evidence/run_t29_desktop_3.png, data/evidence/run_t29_desktop_6.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Privacy Policy | Tiger Data" shows dates in the past (NOVEMBER 6, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_ab8477a1_77 (data/evidence/exp_dee62d4f_desktop_d1.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 70 distinct links compete for attention on "Time-Series PostgreSQL at Petabyte Scale". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_fedc6bb1_75

### 4. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "here" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_eb9ee837_78 (data/evidence/exp_dee62d4f_desktop_d1.png)

### 5. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_6dd583f7_82 (data/evidence/exp_dee62d4f_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "pricing"
- Post-event page still invites registration

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost
- Ambiguous link labels (1)
- Ambiguous link labels (3)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
