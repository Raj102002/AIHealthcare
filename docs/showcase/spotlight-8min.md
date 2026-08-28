# ClearSignal — 8-Minute Spotlight Talk Outline

AI HootCamp closing showcase. Target: 8:00 at a conversational pace (~130
wpm). Section timings are budgets, not a script — talk from the bullets.
Every factual claim below cites the file it comes from; nothing here is
invented. Model names reflect the current code (`lib/models.ts`), not the
older names still printed in `design.md`/`README.md` — see the note in
section 3.

---

## 1. The problem (0:00–1:45)

- Standard two-tier Lyme serology detects the *antibody response*, not the
  bacterium — and that response takes 3–6 weeks to develop. Sensitivity at
  first presentation is roughly **22–36%** (`plan.md` §1).
- So a patient with a real, active infection most likely **tests negative**
  at first — and that negative result anchors every later clinician away
  from the correct diagnosis, even though the test was early, not wrong.
- Without a reliable test, diagnosis falls back on the *sequence* of events —
  exposure, onset, progression, episodicity. That sequence lives in no
  chart, and no patient reconstructs it reliably in a 12-minute visit
  (`plan.md` §1).
- This falls disproportionately on women — vague symptoms plus a negative
  test get attributed to stress or anxiety (`plan.md` §1, `README.md`).
- This is the literal brief from HHS OASH via the LymeX Innovation
  Accelerator (with NIH ORWH): use federal open data to help Lyme and
  invisible-illness patients get diagnosis and care faster — e.g. a
  symptom-to-resource navigator or longitudinal symptom organizer, with
  source citations and uncertainty labels, **never free-form diagnosis**.

## 2. What ClearSignal is (1:45–2:45)

One line: a hybrid-RAG symptom-journey companion that turns the missing
sequence into evidence, under a deterministic safety layer that never
diagnoses.

- **Hybrid RAG chat** grounded in a CDC Lyme corpus — cites a source or says
  "I don't know," never guesses (`README.md`, `design.md` §2).
- **Negative-test contextualizer** (`/test-context`) — explains a negative
  result against real CDC sensitivity/timing data instead of letting it read
  as final.
- **Symptom + function journal** that captures good days, not just
  flare-ups — episodic illness looks continuous if only bad days get logged.
- **Timeline anchors + exposure reconstruction**, cross-referenced against
  CDC county exposure data, plus an agentic **"Ask Your Journal"** assistant
  (`/api/journal-agent`) — a real Groq tool-calling loop over 6 tools that
  computes actual severity-trend slopes and symptom-free intervals from the
  patient's own logged data (verified live: a real 1.08 pts/week slope, a
  real 10-day symptom-free median — `plan.md` §2.2).
- **AI-generated one-page clinician handoff**, with a deterministic template
  fallback if generation fails.
- **Deterministic red-flag layer** — chest pain, stroke signs, anaphylaxis,
  sepsis, crisis ideation — pattern-matched *before* any model call, no
  model in the loop (`lib/red-flag.ts`, `design.md` §2).

## 3. The AI-assisted engineering approach (2:45–4:15)

- This was built in direct collaboration with an AI coding agent (Claude
  Code — see `healthcare-ai/CLAUDE.md` / `AGENTS.md`). Verifiable, not
  claimed: **24 of the repo's 56 commits carry a `Co-Authored-By: Claude
  Sonnet 5` trailer** (`git log`).
- The working model: AI for velocity on drafting — routes, docs, the eval
  harness scaffolding, first-pass prompts — my judgment for verification and
  for anything safety- or clinically-adjacent.
- That split is explicit in the project's own docs, not something I'm
  characterizing after the fact: `plan.md`'s honesty note names the red-flag
  copy, the 42-question gold eval set, and the ~45-entry vocabulary table as
  **AI-drafted and not yet clinically/legally reviewed** — flagged in-repo,
  not hidden.
- The house rule that shaped this the most: **"verified live, not just
  typechecked."** Nothing in `plan.md` is marked done on the strength of a
  model's say-so — every claim there is either backed by a real run against
  the dev server / eval harness, or explicitly marked `[PLANNED]`.
- One correction worth naming here rather than glossing over: `design.md`
  and the top-level `README.md` still say the LLM is
  `llama-3.3-70b-versatile`. It isn't, as of `lib/models.ts` today — Groq
  revoked this account's access to both `llama-3.3-70b-versatile` and
  `llama-3.1-8b-instant` (live 404 `model_not_found` in production), and the
  app now runs `openai/gpt-oss-120b` (generation/rerank) and
  `openai/gpt-oss-20b` (rewrite). The docs are stale; the code is the source
  of truth I'm presenting from.

## 4. The engineering challenge: the reranker was confidently wrong (4:15–6:45)

This is the one I picked because it's the one with real before/after
numbers, not the one that sounds best.

- **The setup:** retrieval is hybrid — Upstash dense search + a hand-rolled
  Okapi BM25 index over a local corpus mirror, fused with Reciprocal Rank
  Fusion (`RRF_K = 60`), top-20 each side → fused top-20 → LLM rerank →
  top-5 above a relevance floor (`MIN_RELEVANCE_SCORE = 6`) (`lib/retrieval.ts`,
  `lib/rerank.ts`, `design.md` §2/§4).
- **The bug:** the first reranker model, `llama-3.1-8b-instant` (cheap/fast,
  the obvious first choice), reliably scored *wrong-disease* content near
  the top of the scale in the batch-scoring prompt — e.g. **10/10 for Lyme
  antibiotic info against a flu-treatment query** — regardless of how
  explicit the prompt's calibration instructions and worked examples were
  (`lib/rerank.ts` header comment, `plan.md` §2.2). Shared vocabulary
  ("treatment," "symptoms") was enough to fool it.
- **Why it mattered:** an over-relevant wrong-disease chunk clears the
  threshold, gets handed to the generation model as "context," and now
  you're one bad retrieval away from the app confidently answering with
  content about the wrong condition.
- **How I actually caught it — not by inspection, by running the eval
  harness against the real corpus** (`evals/rag.jsonl`'s unanswerable-question
  set). That's the judgment part: I didn't trust the prompt because it read
  well: I trusted the number.
- **The fix:** swap the reranker model to `llama-3.3-70b-versatile`, same
  prompt. Result, measured: the unanswerable-set refusal rate went from
  **20–40% to 100% (5/5)**, with **zero regression** on the 15 answerable
  cases (still 100% hit rate) (`lib/rerank.ts`, commit `665ea87` — "Fix
  rerank false positives: switch reranker model from 8b to 70b").
- **The honest postscript:** that reranker model was itself later swapped
  again (`openai/gpt-oss-120b`, section 3 above) — for account access, not
  accuracy. I have **not** re-run the eval harness against the new model
  yet, so I can't currently claim the same 100%/0-regression numbers hold
  under `gpt-oss-120b`. That's a real, open gap, not a filled-in assumption.

## 5. Results (6:45–7:45)

From the eval harness's last full run (`evals/results/run_1786293151073.json`,
gitSha `665ea87` — i.e., the numbers above, under the 70b reranker):

- **Escalation recall: 100%** (4/4 red-flag gold questions) · **false-positive
  rate: 0%**.
- **Citation validity: 100%** on that run.
- **Recall@5 / Recall@20: 83.3%** each.
- **Hallucination rate: 16.7%** on that run — a real, open number, not one
  I'm hiding because it's not flattering (`scripts/eval-clearsignal.ts` metric
  definitions).
- **Reading level: 9.45** (Flesch-Kincaid) against a 6th–8th-grade target —
  a known, unresolved gap, scheduled as Week 4 work (`plan.md` §3).
- Production engineering, separately verified: `npm audit` **11 → 4**
  vulnerabilities remediated (remainder transitive, documented risk
  rationale — `docs/security-audit.md`); retrieval caching measured
  **2224ms cold → 0ms** on a cache hit; Docker image built and booted live,
  non-root user confirmed; **$0/month** cost today, with a daily
  Groq-token-budget tracker as the monitored constraint (`plan.md` §2.2).

## 6. Close (7:45–8:00)

- What's still genuinely open, said plainly: the condition-agnostic engine
  (ME/CFS, long COVID, etc.) isn't built — everything is hardcoded for Lyme;
  the 50+-prompt adversarial red-team pass hasn't run; there's no CI
  enforcing `tsc`/`eslint`/`audit` yet (`plan.md` — Honesty note).
- Live app: **healwithaura.netlify.app/chat**. Demo video:
  **youtu.be/HF35uvYdDJ8**. Thank you — happy to go deeper on the reranker
  fix, the journal agent, or the safety layer in Q&A.
