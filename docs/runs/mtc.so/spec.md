# Rehearsal spec — https://mtc.so/

Goal: find how to join or start a chapter
Generated: 2026-11-13T21:15:39.469Z

## Summary
Rehearsal verified 5 browser runs against https://mtc.so/: 1 verified failure(s), 2 reproducible concern(s). 3 total findings mapped to 3 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "chapter" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t8_desktop (desktop) failed assertion url-matches on value "chapter". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_180a3889_4 (data/evidence/run_t8_desktop_0.png, data/evidence/run_t8_desktop_3.png, data/evidence/run_t8_desktop_6.png, data/evidence/run_t8_desktop_9.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Muslim Tech Collaborative" shows dates in the past (JANUARY 1, 2025) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_f7bb58ee_18 (data/evidence/exp_0fbd2916_desktop_d1.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 32 distinct links compete for attention on "Muslim Tech Collaborative". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_777819a7_7

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "chapter"
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
