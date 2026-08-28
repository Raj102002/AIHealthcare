# ClearSignal — Directory Entry

## Description (word-capped at 150)

ClearSignal is an AI symptom-journey companion for Lyme disease, built for
the HHS OASH / LymeX Innovation Accelerator's invisible-illness problem
(with NIH ORWH). Standard Lyme serology detects the antibody response, not
the bacterium, and that response takes 3–6 weeks to develop — so a patient
with a real, active infection usually tests negative at first, and that
negative result anchors every later clinician away from the correct
diagnosis. ClearSignal turns the missing sequence into usable evidence: a
hybrid RAG chat grounded in CDC data that cites its sources or says "I don't
know," a negative-test contextualizer, a symptom/function journal that
captures good days as well as flare-ups, timeline and exposure
reconstruction, and an AI-generated one-page clinician handoff — all behind
a deterministic red-flag safety layer that runs before any model call and
never diagnoses. Live at healwithaura.netlify.app/chat.

*(138 words — verified by count, under the 150-word cap.)*

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Backend / DB:** Back4App (Parse Server / MongoDB), full CRUD, per-user
  ACLs
- **Auth:** Parse User — registration, login, session persistence
- **AI — LLM:** Groq `openai/gpt-oss-120b` (chat, rerank, handoff narrative,
  journal agent) + `openai/gpt-oss-20b` (query rewrite) — swapped from
  `llama-3.3-70b-versatile` after a Groq account access change
  (`lib/models.ts`)
- **AI — Voice:** Groq `whisper-large-v3-turbo` (STT) + Groq `playai-tts`
  (TTS), browser `SpeechSynthesis` fallback
- **Retrieval:** Upstash Vector (dense) + hand-rolled Okapi BM25 (sparse),
  fused via Reciprocal Rank Fusion, LLM-reranked above a relevance floor
- **Validation:** zod, on every route parsing untrusted JSON
- **Deployment:** Netlify (production) + multi-stage Docker (portable /
  grading path, built and booted live)
- **Observability:** structured JSON logging + custom Back4App-backed
  request metrics + `/admin` dashboard

## Role

Solo builder — sole author across the repo's 56 commits, 24 of them
carrying a `Co-Authored-By: Claude Sonnet 5` trailer for AI-assisted
development (verified via `git log`). Owned architecture, the hybrid RAG
pipeline, the deterministic safety layer, the eval harness, security
hardening, deployment, and documentation end to end.
