---
name: pg-write-simply
description: Write prose the way Paul Graham does — ordinary words, simple sentences, ideas that leap into the reader's head. Use when drafting or revising essays, blog posts, landing copy, docs, or any text meant to be read. Invoke with /pg-write-simply.
user-invocable: true
triggers:
  - user
  - model
---

# Write Simply (after Paul Graham)

Write the way Paul Graham does: ordinary words and simple sentences. The goal is *saltintesta* — the ideas leap into the reader's head and they barely notice the words that got them there.

Apply this skill to any text you are drafting or revising: essays, blog posts, landing pages, docs, comments, emails, READMEs, marketing copy. If the user passes arguments (`$ARGUMENTS`), treat them as the subject, draft, or file to write or revise.

## Core principles

1. **Use ordinary words and simple sentences.** Fancy prose is friction. The less energy readers spend on your sentences, the more they have left for your ideas — and the further they'll read.

2. **Aim for *saltintesta*, not poetry.** Writing will never be pure ideas, and you might not even want it to be. But for most writers, most of the time, closing the gap between prose and idea is the goal. The gap is rarely filled with poetry.

3. **Be considerate.** Writing in a fancy way to impress people makes them do extra work so you can seem cool — like trailing a long train they have to carry.

4. **Assume non-native readers.** Many readers won't be native English speakers. Their grasp of ideas may be far ahead of their grasp of English. A difficult topic does not license difficult words.

5. **Write simply to stay honest.** Fancy writing can conceal the lack of ideas — which is why some people write that way. If you say nothing simply, it's obvious to everyone, including you.

6. **Build to last.** Future readers sit where foreign readers sit today: the culture and language will have changed. Lasting isn't vanity — it's the sign of a good job, like a chair built to last.

7. **Let bad prose offend you.** The deepest reason to write simply is that complicated sentences and unnecessarily intellectual words aren't fancy — they're clumsy. Treat them as defects.

8. **Use complexity only on purpose.** There are times you want a complicated sentence or fancy word for effect. Never do it by accident.

9. **Write fast, then edit by cutting.** Draft quickly, then spend the bulk of effort editing — much of it cutting. Cutting makes simple writing simpler.

## How to apply

When drafting:
- Start with the idea, not the sentence. Get the thought down fast in plain language.
- Prefer the short word to the long one when they mean the same thing.
- Prefer one simple sentence over a clause-stacked compound.
- Cut every word that isn't doing work.

When revising (`$ARGUMENTS` may be a draft or file):
- Read each sentence and ask: *is this the simplest way to say this?*
- Flag every unnecessarily intellectual word, every clause that could be its own sentence, every phrase that exists to sound smart rather than carry meaning.
- Cut ruthlessly. Then cut again.
- If a sentence is complex, justify it. If you can't, simplify it.
- Preserve the author's voice and meaning — you are reducing friction, not rewriting the ideas.

## Anti-patterns to remove

- Thesaurus-swapped "fancy" synonyms (`utilize` → `use`, `leverage` → `use`, `commence` → `start`).
- Hedge stacks ("It might perhaps arguably be the case that...").
- Nominalizations ("make a decision" → "decide").
- Long Latin/Greek words where an Anglo-Saxon one works.
- Sentences that exist to sound impressive rather than to convey an idea.
- Complexity used by accident — only by intent.

## Output

- For drafts: produce clean, simple prose that carries the ideas with minimal friction.
- For revisions: return the rewritten text, optionally with a short list of the main cuts and why. Do not pad the output with meta-commentary unless asked.

## Attribution

Based on Paul Graham's essay [Write Simply](https://paulgraham.com/simply.html) (March 2021).
