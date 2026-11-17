# Rebuild wireframes

Rehearsal proposes UX changes, not a replacement visual identity. Every `/rb/` site uses one
paper-and-ink system, while its content and layout follow the visitor goal and rebuild spec.

## Shared language

| Decision | Value |
| --- | --- |
| Paper / ink | `#ffffff` / `#202020` |
| Secondary text / surface / rules | `#595959` / `#f5f5f5` / `#b4b4b4` |
| Font | System sans, no downloaded brand fonts |
| Headings | 30–40px h1, 22–28px h2, 18px h3 |
| Body / metadata | 16px / 14px, reading measure up to 70ch |
| Controls | 44px minimum height, 4px radius, visible keyboard focus |
| Hierarchy | Proximity, type weight, white space, rules, underlined links |
| Media | Content-bearing images only, grayscale; header uses the site name |
| Motion | Only short hover color transitions, disabled with reduced motion |

The tokens in `src/lib/rebuild/site-tokens.ts` are authoritative. Both deterministic and LLM
plans receive them. Planner-supplied theme overrides are ignored. The stylesheet also ignores
older stored brand tokens, so saved rebuilds adopt the system without a paid regeneration.
Saved content is retained; changing its composition still requires an explicit rebuild.

## Layout and interaction

Use familiar structures that fit the task: a resource list for discovery, a table for comparison,
readable prose for understanding, and native disclosure for secondary detail. A home page need
not have a marketing hero or feature grid. A hero is a compact page introduction. Repeated
entities may use cards; sections must not become an undifferentiated wall of cards.

Keep the actual content rather than drawing skeleton bars. Make the next action obvious, keep
same-site page navigation inside `/rb/`, and show active navigation. External destinations stay
external. The footer's explicitly labeled original-site and experiment links are provenance
exits, not rebuilt-site navigation. No pretend search, working forms or checkout controls.

## Proposal framing

Every page has a quiet Rehearsal wireframe notice, a native **Study goal** disclosure, and a
keyboard skip link. This keeps the visitor task available while someone reviews multiple pages
and states plainly that a proposed layout is not a verified improvement. Rebuild remains opt-in
after the findings/spec; these changes do not add model calls or publish a Browserbase Function.

## Next ideas

- Link each proposed layout decision to its spec change and evidence class.
- Offer a task walkthrough that records uncertainty rather than claiming a conversion lift.
- Compare two information architectures in the same wireframe system, holding styling constant.

These are follow-ups, not capabilities implemented by this change. Layout proposals should
always remain separate from observed browser evidence.
