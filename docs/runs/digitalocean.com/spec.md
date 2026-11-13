# Rehearsal spec — https://www.digitalocean.com/

Goal: find droplet pricing
Generated: 2026-11-13T21:25:08.658Z

## Summary
Rehearsal verified 5 browser runs against https://www.digitalocean.com/: 1 verified failure(s), 9 reproducible concern(s). 10 total findings mapped to 10 proposed changes.

## Changes (by impact)

### 1. Assertion failed in browser: url-matches "pricing" [M]
- Change: Inspect the failed assertion against the live page and correct the mismatch.
- Rationale: Browser run run_t77_desktop (desktop) failed assertion url-matches on value "pricing". [verified-failure; Can the intended outcome be verified?]
- Krug principle: testing-beats-arguing
- Evidence: finding f_1658eb8d_132 (data/evidence/run_t77_desktop_0.png, data/evidence/run_t77_desktop_3.png, data/evidence/run_t77_desktop_6.png, data/evidence/run_t77_desktop_7.png)

### 2. Post-event page still invites registration [M]
- Change: Replace the apply/register CTA with a post-event path (recordings, next-year waitlist) or add a visible 'event has ended' notice.
- Rationale: Page "Pricing Calculator | DigitalOcean" shows dates in the past (JANUARY 1, 2026) alongside active registration/apply language — a stale-content inconsistency. [reproducible-concern; Is text free of needless words, happy talk, stale claims?]
- Krug principle: omit-words
- Evidence: finding f_423d072b_143 (data/evidence/exp_300cfd04_desktop_d1.png)

### 3. Dense link surface increases scan cost [S]
- Change: Group secondary links; keep the primary path visually dominant.
- Rationale: 156 distinct links compete for attention on "AI-Native Cloud | DigitalOcean". [reproducible-concern; Are important elements visually and semantically prioritized?]
- Krug principle: scanning-not-reading
- Evidence: finding f_6b5f3fae_135

### 4. Ambiguous link labels (3) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_3c1900f4_137 (data/evidence/exp_300cfd04_desktop_d1.png)

### 5. Ambiguous link labels (1) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "here" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_8ff92cc5_139 (data/evidence/exp_300cfd04_desktop_d1.png)

### 6. Ambiguous link labels (11) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Read more", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More", "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_6bdb9c4a_141 (data/evidence/exp_300cfd04_desktop_d1.png)

### 7. Ambiguous link labels (63) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more", "Read more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_42825ebd_149 (data/evidence/exp_300cfd04_desktop_d1.png)

### 8. Ambiguous link labels (6) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Read more", "Read more", "Read more", "Learn more", "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_9f2a2bc6_151 (data/evidence/exp_300cfd04_desktop_d1.png)

### 9. Ambiguous link labels (4) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn More", "Learn More", "Learn More" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_bacf0314_154 (data/evidence/exp_300cfd04_desktop_d1.png)

### 10. Ambiguous link labels (2) [S]
- Change: Rename vague labels to describe their destination explicitly.
- Rationale: Actions like "Learn more", "Learn more" force users to guess where they lead. [reproducible-concern; How much interpretation does selecting an action require?]
- Krug principle: dont-make-me-think
- Evidence: finding f_4fb082c4_156 (data/evidence/exp_300cfd04_desktop_d1.png)

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
- Ambiguous link labels (3)
- Ambiguous link labels (1)

### Verification loop
Goal: Rehearse the rebuild against the same assertions before shipping.
- Re-run experiment on staging
- Compare baseline vs. rebuild deltas
