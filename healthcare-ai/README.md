# ClearSignal

| | |
|---|---|
| **Name** | Raja Manendra Surisetty |
| **Z-Number** | Z23879546 |
| **FAU Email** | rsurisetty2025@fau.edu |
| **Deployed App** | [healwithaura.netlify.app/chat](https://healwithaura.netlify.app/chat) |
| **Demo Video** | `[FILL IN — 3-5 min, see plan.md Week 6]` |
| **Planning Docs** | [`plan.md`](../plan.md), [`design.md`](../design.md) (repo root) |

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Backend / DB | Back4App (Parse Server / MongoDB) — full CRUD, ACL-scoped per user |
| Auth | Parse User (registration, login, session persistence) |
| AI — LLM | Groq, `llama-3.3-70b-versatile` (chat, rerank, query rewrite, handoff narrative, journal agent tool-calling) |
| AI — Voice | Groq `whisper-large-v3-turbo` (STT), Groq `playai-tts` (TTS), browser `SpeechSynthesis` fallback |
| Vector store | Upstash Vector (built-in embedding model, no separate embeddings key) |
| Keyword search | Hand-rolled Okapi BM25, fused with dense results via Reciprocal Rank Fusion |
| Validation | zod |
| Deployment | Netlify (`@netlify/plugin-nextjs`) — production; Docker (multi-stage, `node:20-alpine`) — portable/grading path, built and verified locally |
| Observability | Structured JSON logging (`lib/logger.ts`) + custom Back4App-backed request metrics (`lib/metrics.ts`) + `/admin` dashboard |

Full rationale for each choice is in [`design.md`](../design.md) section 8.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## ClearSignal: why this exists

**Sponsor chain:** HHS OASH → LymeX Innovation Accelerator → NIH ORWH (Office of
Research on Women's Health). The target is diagnostic delay and symptom dismissal
in invisible illness, which falls disproportionately on women.

**The problem is a timing problem, not an information problem.** Standard Lyme
disease serology detects the *antibody response*, not the bacterium — and that
response takes 3-6 weeks to develop. A patient with real, active early infection
most likely tests negative, and that negative result then anchors every later
clinician away from the correct diagnosis. Diagnosis without a reliable test falls
back on the *sequence* of events (exposure, onset timing, progression, migration,
episodicity) — a sequence that lives in no chart and that no patient can
reconstruct reliably inside a 12-minute appointment. Every feature below exists to
produce that sequence as usable evidence, or to close one specific failure mode
along the way:

| Feature | Failure mode it targets |
|---|---|
| `/api/chat` red-flag layer (`lib/red-flag.ts`) | Deterministic escalation for chest pain, stroke signs, anaphylaxis, sepsis, and crisis/suicidal ideation — runs before any model call, no model in the loop. |
| `/test-context` (negative-test contextualizer) | CDC-recommended retesting is rarely communicated; an early negative test gets treated as final when it may just be early. |
| `/journal` — symptom + function tracking, including good-day check-ins | Patients book on bad days and present on good ones; without good-day logging, episodic illness looks continuous. |
| `/journal` → Anchors tab | Patients can't recall exact symptom-onset dates, but can recall them relative to a personal event. |
| `/journal` → Exposure tab | Most confirmed Lyme patients never recall a tick bite, and "no" gets used as evidence against them — this cross-references activity against real CDC county data instead. |
| `/journal` → Rash Photos tab | Erythema migrans is diagnostic via its expansion over days; most patients' rash is gone by the time they're seen. No image classification — just a dated sequence. |
| Co-infection prompts (`lib/co-infection.ts`) | Untreated co-infection (babesiosis, anaplasmosis) is a documented reason patients don't improve after Lyme treatment, and isn't always asked about. |
| `/handoff` | Care fragments across specialists; no single chart has the full temporal pattern. |
| `/contested-territory` | Patients researching PTLDS/"chronic Lyme" usually get only one side of a genuinely contested clinical question. |
| `/providers` | Provider/trial lookup by specialty and location — never ranked by fit, which isn't this app's judgment to make. |
| Low-stimulation mode | Light sensitivity and cognitive fatigue are common in this population. |

**The Pfizer/Valneva vaccine candidate (PF-07307405)**, if approved, prevents new
infections. It does nothing for people already sick, and it does not fix the test.
The problem this app addresses stays open regardless of vaccine approval.

### Scope, stated honestly

**Lyme disease is implemented in depth. Other conditions are not implemented at
all in this pass.** The build spec (section 4) describes a condition-agnostic
engine plus a per-illness "condition profile" config (`symptoms[]`, `exposures[]`,
`redFlagRules[]`, `tests[]`, `differentials[]`, `corpusFilter`,
`patternDetectors[]`) that would let ME/CFS, long COVID, fibromyalgia, and
endometriosis plug into the same engine. **That config abstraction was not
built.** Red-flag rules, the RAG corpus, and the lay-vocabulary mapping table are
all hardcoded for Lyme disease throughout the codebase (`lib/red-flag.ts`,
`corpus/*.md`, `lib/vocabulary-map.ts`). The architecture generalizes in
principle — nothing here is Lyme-specific *by necessity* — but extracting the
condition-specific pieces into that config shape is real, unbuilt work, not a
detail. Pretending otherwise, or shipping other conditions without their own
clinically-reviewed content, would be unsafe. See the spec's own build order
(section 10) for what a real second condition profile would require.

### What's genuinely unverified — read before trusting any of this clinically

Several pieces here were AI-drafted and explicitly need a human clinical/legal
review pass before this touches a real patient. Each is marked in its own file,
collected here so a reviewer doesn't have to go hunting:

- **Red-flag escalation copy** (`lib/red-flag.ts`) — the trigger patterns and the
  static copy shown to users have not been clinically reviewed.
- **Gold eval set** (`evals/clearsignal-gold.jsonl`, see `evals/README.md`) — 42
  AI-drafted candidate questions, not the spec's target 150-200, and not
  hand-verified. This is the spec's own described first stage ("generated as
  candidates then hand-verified") — only the first half happened.
- **Lay-to-clinical vocabulary table** (`lib/vocabulary-map.ts`) — ~45 seeded
  entries, unverified, well short of the spec's 200-400 target.
- **Contested-territory citations** (`/contested-territory`) — the IDSA/AAN/ACR
  and ILADS positions are accurately characterized in general terms, but specific
  guideline titles/URLs/years are marked `[needs citation]` and were not
  independently verified (cdc.gov and similar sites block automated fetching in
  this environment).
- **Retention policy** (`docs/privacy.md`) — deletion works per-record; there is
  no automatic data-expiry policy yet, and chat/health-log notes are not
  encrypted client-side the way journal notes are.

None of this is hidden inside the code only — see each file's own header comment
and `docs/privacy.md` / `evals/README.md` for the full detail.

## RAG + voice setup

`/chat` is a single RAG-grounded assistant: it retrieves from a Lyme disease knowledge
base (CDC surveillance statistics + educational content) when relevant, and falls
through to general wellness guidance otherwise. Voice input/output are optional and
layer on top of the same chat pipeline.

1. Copy `.env.local.example` to `.env.local` and fill in `GROQ_API_KEY` and the
   Back4App keys as before.
2. Create a free [Upstash Vector](https://console.upstash.com/vector) index with a
   built-in embedding model attached (e.g. `mixedbread-ai/mxbai-embed-large-v1`), and
   add its REST URL/token to `.env.local` as `UPSTASH_VECTOR_REST_URL` /
   `UPSTASH_VECTOR_REST_TOKEN`.
3. Run `npm run ingest` to chunk `corpus/*.md` + `data/*_long.csv`, embed them via
   Upstash, and write `data/corpus.json` (the local BM25 keyword index) and
   `data/ingest-manifest.json` (idempotency tracking — safe to re-run any time the
   corpus changes; unchanged chunks are skipped). This runs offline, never at request
   time.
4. Run `npm run eval` to check retrieval quality against `evals/rag.jsonl` (hit rate
   on answerable questions, refusal rate on the unanswerable set).

Retrieval is hybrid: dense (Upstash) + BM25 keyword search, fused with Reciprocal Rank
Fusion, reranked with a Groq LLM call, and thresholded — if nothing clears the
relevance bar, no context is passed to the model and it says so rather than guessing.
Follow-up questions are rewritten against the last few turns before retrieval runs.

Voice mode (mic button in `/chat`) records via `MediaRecorder`, auto-stops on
silence or a 60s cap, transcribes through `/api/transcribe` (Groq
`whisper-large-v3-turbo`), and always shows the transcript in the composer for
review before sending — nothing is auto-sent. Spoken responses go through
`/api/speak` (Groq `playai-tts`), falling back to the browser's `SpeechSynthesis`
API if that call fails.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
