# Review policy

Lint is the source of truth for repo rules. Review is for what a script cannot check.

## Blocking vs non-blocking findings

| Finding | Source | Merge |
| --- | --- | --- |
| `bug` | Devin Review / human | **Blocks.** Fix before merge. |
| `security` | Devin Review / human | **Blocks.** Fix before merge. |
| Failing `npm run check` or `npm run test:e2e` | CI | **Blocks.** |
| `code_quality`, style, naming, nits | Devin Review / human | Non-blocking. Fix in the same round if cheap, otherwise leave a reply. Never spend an extra review round on it. |

A non-blocking finding that the author disagrees with gets a one-line reply and is resolved; it does not hold the PR.

## Back pressure: encode repeated feedback

When a human or reviewer pushes back **twice on the same pattern**, encode it as a lint rule (`eslint-rules/`) or an eval (`tests/evals/`) in the next PR. After that the rule, not the reviewer, enforces it, and the review comment no longer needs to be made.

Judgment checks should not do a script's job.

## Rules enforced by lint (`npm run lint`, part of `npm run check`)

| Rule | What it enforces |
| --- | --- |
| `rehearsal/contracts-first` | No exported `type`/`interface`/`enum`/zod schema or type re-export in `src/**` outside `src/lib/contracts/**` (AGENTS.md #1). React `*Props` types in `.tsx` files are allowed. Fix: move the type to `src/lib/contracts` (`index.ts` or a sibling re-exported from it), or drop `export` if it is module-private. |
| `rehearsal/finding-cites-krug` | In `src/lib/analysis/**` and `src/lib/intents/**`, an object literal with `category` and `title` is a Finding and must set `krugPrinciple` (AGENTS.md #5). |
| `@typescript-eslint/no-explicit-any` | No `any`; use `unknown` and narrow, or a contract type. |
| `no-console` | No `console.*` outside `scripts/**`; use `logEvent` (telemetry). Lint runs with `--max-warnings 0`, so warnings fail CI. |

Custom rules live in `eslint-rules/` (local flat-config plugin) with tests in `tests/unit/eslint-rules.test.ts`.
