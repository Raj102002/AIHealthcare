# Moderated Q&A — Working with AI in Engineering

Talking points for a moderated Q&A about the AI-assisted engineering
process behind ClearSignal. Every point below is grounded in something
verifiable in the repo — a commit trailer, a doc's own honesty section, or
a specific file. Nothing here describes a workflow I can't point to.

**Verification method, stated up front:** `git log` shows 56 commits total,
24 of which carry a `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
trailer — direct, checkable evidence of where an AI coding agent (Claude
Code — see `healthcare-ai/CLAUDE.md` / `AGENTS.md`) was in the loop, and
where it wasn't.

---

## Where AI assistance helped

- **Drafting velocity on scaffolding and docs.** Route handlers, the eval
  harness structure, first-pass prompts, and the planning docs themselves
  (`plan.md`, `design.md`) were drafted with AI assistance and then
  iterated on. The AI-co-authored ~43% of commits is a real number, not a
  vibe.
- **The discipline of writing down what's *not* done.** `plan.md` and
  `design.md`'s consistent use of **[PLANNED]** tags for unfinished work,
  and the standing "Honesty note" section at the end of `plan.md`, came out
  of that same drafting process — an AI collaborator that was pushed to
  separate "built and verified" from "designed but not built" rather than
  blur the two.
- **First-pass technical choices, fast.** E.g. the initial reranker model
  choice, the RRF fusion approach, the Zod validation schemas — all
  drafted quickly, then checked against real behavior (see "where judgment
  was required," directly below — drafting and verifying were two distinct
  steps, not one).

## Where my own judgment was required

- **Not trusting a well-written prompt over a measured number.** The
  reranker's first model (`llama-3.1-8b-instant`) scored wrong-disease
  content near-maximum relevance despite an explicit, well-calibrated
  prompt with worked examples telling it not to (`lib/rerank.ts`). Reading
  the prompt again wouldn't have caught this — running `evals/rag.jsonl`
  against the real corpus did (refusal rate on unanswerable questions:
  20–40%, should have been ~100%). The judgment call was *insisting on
  the eval run* before believing the feature worked, not any specific
  code fix.
- **Deciding what NOT to let AI generate.** `plan.md`'s honesty note is
  explicit: the 42-question gold eval set, the red-flag copy, and the
  ~45-entry vocabulary table are AI-drafted and **explicitly flagged as
  needing human clinical/legal review before real patient use** — they are
  not presented as validated. Equally deliberate: the condition-agnostic
  engine (ME/CFS, long COVID, fibromyalgia, endometriosis) was scoped out
  entirely rather than having AI generate clinical content for conditions
  nobody researched for this project (`README.md`, "Scope, stated
  honestly").
- **Security risk calls that needed a human trade-off, not a mechanical
  fix.** `npm audit` found 11 vulnerabilities; 7 were fixed with
  `npm audit fix` plus a same-major `next` bump. The remaining 4 are
  transitive from the `parse` SDK and would need a 3-major-version jump on
  the entire auth/data layer to close — deliberately **not** force-upgraded
  without dedicated regression testing, because the vulnerable code path
  (`Parse.LiveQuery`) is one this app never calls (`docs/security-audit.md`,
  `plan.md` §2.2). That's a risk-acceptance judgment, not something an
  audit tool decides.
- **Catching a stale-docs drift.** `design.md` and the top-level
  `README.md` still describe the LLM as `llama-3.3-70b-versatile`.
  `lib/models.ts` shows the account lost access to that model entirely and
  the app now runs `openai/gpt-oss-120b`/`openai/gpt-oss-20b`. Reconciling
  "what the docs say" against "what the code actually does" before
  presenting either is a check I did by hand, tracing it through git
  history to confirm the order of events (rerank-fix commit `665ea87` on
  the old model, account-access-swap commits `e115e68`/`0c04d11` afterward).

## What I'd do differently

- **Re-run the eval harness after every model swap, not just after
  feature changes.** The reranker's before/after numbers (20–40% → 100%
  refusal rate) were measured against `llama-3.3-70b-versatile`. That
  model was later swapped to `openai/gpt-oss-120b` for account-access
  reasons, and the eval harness has not been re-run since. I don't
  currently know whether those numbers still hold — that gap should have
  been closed immediately after the model swap, not left open.
- **Finish the two-stage eval process the spec itself describes.** The
  42-question gold set is explicitly only "stage one" (AI-generated
  candidates) — `evals/README.md` says outright that the hand-verification
  stage (checking `gold_chunks` mappings and `must_contain` phrase lists
  against real model output) hasn't happened, and the set itself is scaled
  down from the spec's 150–200 target.
- **Run the adversarial red-team pass before claiming the safety layer is
  robust, not after.** The spec calls for 50+ adversarial prompt-injection
  prompts; that pass has not been run (`plan.md` — Honesty note, "Explicitly
  out of scope"). Prompt-injection detection exists and is logged, but it's
  untested against a real adversarial set.
- **Wire up a CI pipeline earlier**, so `tsc`/`eslint`/`npm audit` are
  enforced automatically instead of relying on me remembering to run them
  by hand every session (`plan.md` — Honesty note).
- **Address the hallucination-rate and reading-level findings, not just
  measure them.** The last eval run recorded a 16.7% hallucination rate and
  a 9.45 Flesch-Kincaid reading level against a 6th–8th-grade target
  (`evals/results/run_1786293151073.json`, `plan.md` §2.2). Both are real,
  logged findings that are scheduled as Week 4 work but not yet fixed — I'd
  prioritize them over some of the "nice to have" feature work I did
  instead (rash-photo timeline, contested-territory page) if I were
  resequencing.
