# Rehearsal spec — https://devpost.com/

Goal: find an upcoming hackathon to join
Generated: 2026-11-13T21:19:40.968Z

## Summary
Rehearsal verified 5 browser runs against https://devpost.com/: 1 verified failure(s), 2 reproducible concern(s). 3 total findings mapped to 3 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "hackathon" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t34_desktop (desktop) failed assertion url-matches on value "hackathon". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_34e837b1_33 (data/evidence/run_t34_desktop_0.png, data/evidence/run_t34_desktop_2.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "New & upcoming hackathons · Devpost" shows dates in the past (JUL 16, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_619d4cc7_37 (data/evidence/exp_f5452ed1_desktop_d1.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 113 distinct links compete for attention on "Devpost - The home for hackathons". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_7a72a27a_34

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "hackathon"
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
