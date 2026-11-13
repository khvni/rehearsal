# Rehearsal spec — https://www.snowflake.com/en/

Goal: start a free trial
Generated: 2026-11-13T21:23:55.233Z

## Summary
Rehearsal verified 5 browser runs against https://www.snowflake.com/en/: 1 verified failure(s), 3 reproducible concern(s). 4 total findings mapped to 4 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "trial" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t92_desktop (desktop) failed assertion url-matches on value "trial". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_2fd2fc0a_109 (data/evidence/run_t92_desktop_0.png, data/evidence/run_t92_desktop_3.png, data/evidence/run_t92_desktop_6.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Snowflake AI Data Cloud" shows dates in the past (JULY 31, 2025) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_7c74d0f9_113 (data/evidence/exp_51469c5d_desktop_d0.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 110 distinct links compete for attention on "Snowflake AI Data Cloud". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_21046a6b_114

### 4. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_8d5b008a_116 (data/evidence/exp_51469c5d_desktop_d1.png)

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "trial"
- Post-event page still invites registration

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost
- Ambiguous link labels (1)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
