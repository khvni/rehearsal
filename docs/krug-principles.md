# Krug Principles — the eval rubric

Distilled from Steve Krug, *Don't Make Me Think, Revisited* (3rd ed.). This file is the agent's
design canon: the analysis prompt embeds it verbatim, every `Finding.krugPrinciple` cites one of
these keys, and the eval suite asserts rubric coverage.

## The nine principles

### K1 `dont-make-me-think` — Don't make me think
A page is self-evident when a person of average ability can tell what it is and how to use it
without expending effort thinking about it. Every element that forces a question — *"Where am I?
Where should I begin? Where did they put ___? What are the most important things? Why did they
call it that?"* — adds cognitive overhead and erodes confidence. Name things by what they do.
If a label needs a second of thought, it's wrong.

### K2 `scanning-not-reading` — Design for scanning, not reading
Users glance, pick the first reasonable option, and muddle through (*satisficing*). Consequences:
- Build a clear visual hierarchy: prominence matches importance.
- Use conventions; don't invent where a convention exists.
- Break pages into clearly defined areas.
- Make obvious what's clickable.
- Eliminate visual noise: disorganization, clutter, things that shout.
- Format text for scanning: headlines, short paragraphs, bulleted lists, highlighted key terms.

### K3 `conventions` — Conventions are your friends
Conventions let users apply knowledge from one site to the next. Innovate only when you're sure
the new idea delivers more value than the convention it displaces — and the burden of proof is
high. Where convention is missing, be consistent within the site.

### K4 `mindless-choices` — Mindless, unambiguous choices
It's not the *number* of clicks that matters but the *mental effort* and *confidence* each one
requires. Three mindless clicks beat one hard-won click. Every decision point should present an
unambiguous best answer.

### K5 `omit-words` — Omit needless words
Get rid of half the words on each page, then half of what's left. Cut welcome blather, happy talk,
and instructions nobody reads. Prominent text should say one thing.

### K6 `navigation` — Street signs, breadcrumbs, and "you are here"
Persistent navigation answers: What site is this? What page am I on? What are the major sections?
What are my options at this level? Where am I in the scheme of things? How can I search?

**The trunk test** — from any page, in one glance you can name: the site ID, the page name, the
primary sections, the local navigation options, and "you are here" indicators. Fail the trunk
test on a deep page → finding.

### K7 `homepage` — The homepage is constrained waterfront property
It must answer in one glance: What is this? What do they have here? What can I do here? Why should
I be here and not somewhere else? Everything above the fold fights for inclusion — the tagline
and welcome blurb carry the whole burden.

### K8 `farmers-and-cowmen` — Pull vs. browse
Some users search, some browse. Navigation must serve both: a visible, conventional search affordance
and well-organized browsable hierarchy. Neither should ever be missing.

### K9 `testing-beats-arguing` — Usability testing beats religious debate
Debates about "what users like" are wasted effort; test instead, early and cheap. Focus groups are
not usability tests. This is Rehearsal's reason for existing: *test the interface, don't argue about it.*

## Eval dimensions (used by `src/lib/analysis/rubric.ts`)

| Dimension | Krug basis | Evaluator question |
|---|---|---|
| `clarity` | K1, K7 | Is the purpose of the page immediately apparent? |
| `navigation` | K6, K8 | Is the next relevant action discoverable and conventional? |
| `hierarchy` | K2, K7 | Are important elements visually/semantically prioritized? |
| `cognitive-effort` | K1, K4 | How much interpretation does selecting an action require? |
| `feedback` | K1 | Does the interface clearly respond to input? |
| `consistency` | K3 | Do labels and interactions behave predictably? |
| `recovery` | K6 | Can the user recover from an incorrect action? |
| `copy-economy` | K5 | Is text free of needless words, happy talk, stale claims? |
| `responsive` | K2, K4 | Does the same workflow remain functional on mobile? |
| `goal-completion` | K4, K9 | Can the intended outcome be verified? |

## Severity heuristic (Krug-informed)

A problem is serious when it persists across pages/states, blocks the goal, or forces repeated
unresolvable questions. `critical` = goal unverifiable; `high` = verified failure or trunk-test
collapse; `medium` = reproducible concern (ambiguity, stale copy, hierarchy); `low` = hypothesis
or polish.
