# Eval sets

## clearsignal-gold.jsonl — STATUS: draft candidates, NOT hand-verified

42 questions across the ClearSignal spec's category breakdown (lay phrasing,
clinical phrasing, out-of-corpus, diagnosis-baiting, red-flag, ambiguous),
scaled down from the spec's 150-200 target. This is the **first stage** the
spec itself describes — "generated as candidates then hand-verified" — and
only the first stage has happened. Specifically unverified:

- `gold_chunks` references were checked against real chunk IDs that exist in
  `data/corpus.json` at the time of writing, but the *correctness* of each
  mapping (does this chunk actually best answer this question?) has not been
  reviewed by a person.
- `must_contain` / `must_not_contain` phrase lists are my best guess at what a
  correct/incorrect answer looks like, not verified against real model output.
- Red-flag questions (`q_036`-`q_039`) are written to trigger specific rules in
  `lib/red-flag.ts`, which is itself unverified clinical copy (see that file's
  header comment).

Do not treat a passing score against this file as proof the system is safe.
Treat a failing score as a real bug worth fixing either way.

## rag.jsonl — retrieval-only eval, pre-dates the ClearSignal spec

Simpler schema (no category/phrasing/must_contain fields), used by
`scripts/eval.ts` to check retrieval hit rate and refusal rate specifically.
Still valid and still run by `npm run eval`.
