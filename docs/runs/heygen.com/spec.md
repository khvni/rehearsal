# Rehearsal spec — https://www.heygen.com/

Goal: find pricing and sign up
Generated: 2026-11-13T21:27:50.224Z

## Summary
Rehearsal verified 5 browser runs against https://www.heygen.com/: 1 verified failure(s), 2 reproducible concern(s). 3 total findings mapped to 3 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "pricing" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t98_desktop (desktop) failed assertion url-matches on value "pricing". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_43a525bc_162 (data/evidence/run_t98_desktop_0.png, data/evidence/run_t98_desktop_3.png, data/evidence/run_t98_desktop_6.png, data/evidence/run_t98_desktop_8.png)

### 2. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_d8ef68d8_165 (data/evidence/exp_c4693c99_desktop_d0.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 94 distinct links compete for attention on "HeyGen: Create AI Videos with Your Personal Avatar". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_4df78514_166

## Rebuild plan

### Truth pass
Goal: Remove anything stale or misleading — copy must match reality.
- Assertion failed in browser: url-matches "pricing"

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
