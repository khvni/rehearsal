# Rehearsal spec — https://ai.engineer/code/2026

Goal: find the conference schedule
Generated: 2026-11-13T20:14:26.731Z

## Summary
Rehearsal verified 10 browser runs against https://ai.engineer/code/2026: 1 verified failure(s), 2 reproducible concern(s). 3 total findings mapped to 3 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "schedule" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t2_desktop (desktop) failed assertion url-matches on value "schedule". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_948d5ded_0 (/home/ubuntu/repos/rehearsal/data/evidence/run_t2_desktop_0.png, /home/ubuntu/repos/rehearsal/data/evidence/run_t2_desktop_3.png, /home/ubuntu/repos/rehearsal/data/evidence/run_t2_desktop_6.png, /home/ubuntu/repos/rehearsal/data/evidence/run_t2_desktop_7.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco" shows dates in the past (NOV 10-12, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_767b2b9d_5 (/home/ubuntu/repos/rehearsal/data/evidence/exp_6b02c50a_desktop_d0.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 407 distinct links compete for attention on "AI Engineer Code Summit 2026: AI Engineering Conference, Nov 10-12, San Francisco". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_696be275_6

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "schedule"
- Post-event page still invites registration

### Hierarchy pass
Goal: One obvious primary action; scanning-friendly structure.
- Rebuild nav to ~7 items max
- Single dominant CTA above the fold
- Dense link surface increases scan cost

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
