# plan.md — ClearSignal Build Plan

Architecture, diagrams, schema, and API details live in `design.md`. This
document covers what's being built, why, the requirement mapping, and the
timeline. Where something described here isn't built yet, it's marked
**[PLANNED]** rather than presented as done — this is a living document and
will be updated as the build phase progresses.

---

## 1. Project Summary

**Project title:** ClearSignal

**Selected problem / sponsor:** LymeX Innovation Accelerator, sponsored via HHS
OASH and the NIH Office of Research on Women's Health (ORWH). Problem category:
diagnostic delay and symptom dismissal in invisible illness. Lyme disease is
the reference implementation; the architecture is meant to generalize to other
invisible illnesses (ME/CFS, long COVID, fibromyalgia, endometriosis) via
per-condition configuration, though that generalization is **[PLANNED, not yet
built]** — see section 2.2 and the honesty note at the end of this document.

**Target users and stakeholders:**
- **Primary:** patients navigating undiagnosed or recently-diagnosed Lyme
  disease. This population is disproportionately women, whose symptoms are
  more likely to be attributed to stress or anxiety once a negative test
  enters the chart.
- **Secondary:** the clinicians those patients see, who receive the handoff
  document this app generates.
- **Institutional:** HHS OASH / LymeX / NIH ORWH, evaluating whether this
  closes a real, named gap in diagnostic delay for their target population.

**Core value proposition:** The diagnostic failure in Lyme disease is a timing
problem, not an information problem. Standard two-tier serology detects the
patient's antibody response, not the bacterium — and that response takes 3–6
weeks to develop, so sensitivity at first presentation is roughly 22–36%. A
patient with a real, active early infection most likely tests negative, and
that negative result anchors every subsequent clinician away from the correct
diagnosis. When the test fails, diagnosis falls back on the *sequence* of
events — exposure, onset timing, progression, migration, episodicity — and
that sequence lives in no chart and isn't something most patients can
reconstruct reliably inside a 12-minute appointment. ClearSignal's job is to
produce that sequence as usable evidence: contextualizing a negative test
against real CDC timing data, capturing longitudinal symptom/function data
*including good days* (most logging tools only capture bad days, which makes
episodic illness look continuous), and compiling it into a one-page,
clinician-readable handoff document — all under a deterministic safety layer
that never diagnoses.

---

## 2. Requirements

### 2.1 Core Requirements (Week 3 Gate)

| Requirement | Status & how this plan addresses it |
|---|---|
| **AI Integration** | Hybrid RAG chat (dense + BM25 + Reciprocal Rank Fusion + LLM rerank), grounded in a CDC Lyme disease corpus, with query rewriting for follow-ups and a hard relevance threshold (empty context → the model says so, never guesses). A separately guarded LLM call generates the clinician-handoff narrative, validated against a banned-phrase/condition-name list with an always-available deterministic template fallback. Voice input (Groq Whisper, domain-vocabulary-seeded) and output (Groq TTS, browser-`SpeechSynthesis` fallback) layer on top. This is not a bare chatbot wrapper — see `design.md` section 4 for the full component diagram. Rate limiting, loading states, and distinct error messages (permission denied / no microphone / network failure / empty transcript, etc.) are implemented; the one route missing rate limiting today is `/api/chat` itself — **[GAP, Week 1 fix]**. |
| **Backend & Database** | Back4App (Parse Server / MongoDB). Seven classes with full CRUD: `HealthLog`, `Conversation` (pre-existing), `SymptomEntry`, `FunctionEntry`, `TimelineAnchor`, `ClinicalEncounter`, `RashPhoto` (this build-phase cycle). Every write path sets an owner-scoped ACL (`new Parse.ACL(user)`) before saving — verified by direct code review, not assumed. |
| **Authentication** | Parse User registration/login/session persistence. Every protected page checks `getCurrentUser()` and redirects unauthenticated visitors; ACLs enforce the same boundary server-side regardless of client-side checks. Secrets (`GROQ_API_KEY`, Back4App app/JS keys, `UPSTASH_VECTOR_REST_URL`/`TOKEN`) live in `.env.local`, never committed — `.env.local.example` documents what's needed without real values. |
| **Documentation** | README covers AI integration, setup instructions, and tech stack. **[NEEDS AUTHOR INPUT before submission]**: name, Z-number, FAU email, deployed app link, demo video link. |
| **Deployment** | Netlify. **[GAP — not yet deployed this cycle]**: this build-phase's work (RAG rebuild, voice mode, all ClearSignal features) is built and locally verified (`npm run build` passes) but not yet pushed to the branch Netlify deploys from. First milestone below. |
| **GitHub Repository** | Implementation history lives in `week2-Raj102002` / `week3-Raj102002` (9+ logically-scoped commits for the RAG/voice rebuild: ingestion pipeline, hybrid retrieval, unified chat endpoint, eval harness, voice STT/TTS, voice UX — each with a message explaining the *why*, not just the *what*). This repo (`buildphase-Raj102002`) holds planning docs only, per the assignment's own separation. |
| **Demo Video** | **[NOT YET RECORDED]** — scheduled for the week the deployed MVP is stable (see timeline). |
| **Canvas Submission** | Submitted by the author after this repo is pushed. |

### 2.2 Build-Phase Requirements

#### Problem Selection & Technical Specification

- **Deeper problem analysis:** done — see section 1 above and the failure
  modes this targets (undercounted exposure recall, untold retest guidance,
  episodic-illness under-logging, fragmented care records, PTLDS being
  presented as settled when it isn't). Domain research came from the LymeX
  problem brief directly (CDC sensitivity/timing figures, IDSA vs. ILADS
  positions) rather than independently sourced citations — see the honesty
  note on unverified citations below.
- **Technical feasibility study:** conducted empirically, not just on paper —
  real findings from this build phase:
  - Upstash Vector indexes default to raw-vector mode; sending text via the
    `data` field (needed to avoid running a local embedding model) fails
    outright unless a built-in embedding model is explicitly selected at
    index-creation time. Discovered by actually running ingestion against a
    live index, not by reading docs first.
  - The first reranker model tried (`llama-3.1-8b-instant`) reliably scored
    wrong-disease content near-maximum relevance in a batch JSON-scoring
    prompt (e.g. 10/10 for Lyme antibiotic info against a flu-treatment
    query) — regardless of how explicit the prompt's calibration instructions
    were, even with matching worked examples. Switching to
    `llama-3.3-70b-versatile` fixed it outright. This was only caught because
    the eval harness was run against the real corpus, not trusted on paper.
  - Groq's free-tier daily token limit (100,000 TPD) is easy to exhaust
    running a 42-question eval suite once generation + reranking + judging
    calls are counted — a real, measured constraint on how often the eval can
    run, not a hypothetical one. See cost section below.
- **High-level system architecture + diagrams:** `design.md` sections 1, 2, 3, 4, 7.
- **Tech stack justification:** `design.md` section 8.
- **Database schema + API structure:** `design.md` sections 5 and 6.
- **Weekly milestones / critical path:** section 3 below.
- **Success metrics / KPIs:** the eval harness (`scripts/eval-clearsignal.ts`)
  reports concrete, tracked numbers: recall@5/@20, escalation recall (spec
  requires 100% — currently measured at 100% on the 4 red-flag gold questions
  after a real fix, see below), red-flag false-positive rate (currently 0%),
  citation validity rate (100% in the last clean sample), hallucination rate,
  and mean reading level (target 6th–8th grade / Flesch-Kincaid; **currently
  measuring ~9.4 on partial data — above target, a real finding to act on**,
  not yet resolved). Results are stored per-run with `gitSha` so metrics can
  be plotted across commits — **[the plotting/dashboard itself is PLANNED,
  not built]**.
- **MVP vs. nice-to-have:** see section 4.

#### Agentic AI & RAG

- **Vector database:** Upstash Vector, built-in embedding model (no separate
  embeddings key). Rationale in `design.md` section 8.
- **Document ingestion and chunking:** `scripts/ingest.ts`, offline only, never
  on the request path. Markdown docs are split by heading then recursively
  chunked (~600 token target, 100 token overlap, sentence-safe); CSV
  surveillance data is chunked per county/state/race rollup. Every chunk is
  content-hashed against a manifest so re-running ingestion only re-upserts
  what actually changed (idempotent).
- **Embedding generation:** delegated to Upstash's built-in model — the app
  never runs its own embedding model, on ingestion or on query. (The
  *previous* version of this app bundled a 22MB ONNX model into the Netlify
  function for this; that's gone.)
- **Semantic search:** hybrid — Upstash dense search + a from-scratch Okapi
  BM25 implementation over a local JSON mirror of the corpus, fused with
  Reciprocal Rank Fusion, then reranked by an LLM call with a hard minimum
  relevance score. Full detail and measured numbers in `design.md` section 4.
- **Agentic AI patterns: honestly, largely absent.** This is a fixed
  multi-stage pipeline, not an agent that dynamically selects tools or plans
  multi-step actions. See `design.md` section 4 for the explicit "what this
  is and isn't" note — claiming agentic behavior here would be overclaiming.
  If a real agentic feature is added this build phase, the most plausible
  candidate is a "search my journal for patterns" tool-calling flow where the
  model decides which deterministic analysis function (`lib/handoff-analysis.ts`)
  to invoke — **[PLANNED, not started]**.
- **Caching and fallback for failed retrievals:** fallback behavior is real
  and implemented (empty-context handling, rerank-failure fallback to RRF
  order, query-rewrite-failure fallback to the raw message) — see `design.md`
  section 2. **Caching is not implemented — [PLANNED]**, and given the
  measured Groq quota constraint above, it's a near-term priority, not a
  nice-to-have.

#### Production Engineering

All items in this subsection are **[PLANNED]** unless noted otherwise — none
of the following exist in the codebase today:

- **Containerization:** not present. The app runs on Netlify's managed
  Next.js runtime; no Dockerfile exists because there's no container host in
  the current deployment path. Would be added only if a portable/self-hosted
  deployment target becomes necessary.
- **Observability:** no structured logging, no Sentry (or equivalent) error
  tracking, no performance dashboards. Current debugging relies on Netlify's
  function logs and manual `console.log`/`console.warn` in a handful of
  fallback paths (e.g. `scripts/ingest.ts`, `lib/rerank.ts`).
- **Database optimization:** Back4App/MongoDB connection pooling and backups
  are handled at the platform level, not configured by this project. Custom
  compound indexes on `(userId, occurredAt)` for the journal classes are
  identified as valuable in `design.md` section 5 but not yet added in the
  Back4App dashboard.
- **Caching strategy:** none. No Redis, no CDN cache-control tuning beyond
  Netlify's defaults for static assets, no explicit cache-expiration policy.
- **Infrastructure documentation:** `README.md` covers app setup; there is no
  separate infrastructure-as-code or reproducible deployment script beyond
  `netlify.toml`.
- **Performance targets (p95 < 500ms API, p95 < 100ms DB, uptime > 99.5%,
  error rate < 1%):** not measured. No instrumentation exists to report
  these numbers today. Establishing a baseline is a Week 2 milestone below.

#### Security & Costs

- **Secrets management:** environment variables only, never committed
  (`.env.local` gitignored, `.env.local.example` documents shape without
  values). No secrets rotation policy, no dedicated secrets manager beyond
  Netlify's environment variable UI — **[PLANNED to formalize, not currently
  a gap in practice since nothing is hardcoded]**. A manual review of the
  codebase for hardcoded credentials found none as of this snapshot.
- **Security hardening:**
  - Rate limiting: implemented on `/api/transcribe`, `/api/speak`,
    `/api/test-context`, `/api/handoff-narrative`, `/api/providers`,
    `/api/trials` (in-memory, per-IP, sliding window — see `design.md`
    section 6 for the documented limitation that this doesn't coordinate
    across concurrent function instances). **`/api/chat` itself is not yet
    rate-limited — [GAP]**.
  - Input validation: present but minimal — required-field checks on forms,
    date validity checks on `/api/test-context`. No schema-level validation
    library (e.g. zod) in use yet.
  - Prompt-injection defenses: none beyond the system prompt's own
    instructions to only use retrieved context for factual claims. Retrieved
    corpus content is trusted content (CDC-sourced, ingested by the project
    itself), which limits the practical injection surface today, but this
    hasn't been stress-tested — **[PLANNED: adversarial prompt testing]**.
  - CORS / CSP / HSTS / other security headers: not configured — **[GAP]**.
- **Cost optimization:** no token-counting or budget-alert system exists.
  What's known from actual usage this build phase: Groq's free/on-demand tier
  caps at 100,000 tokens/day, and that limit was hit and exceeded running eval
  suites during this cycle (see feasibility notes above) — the real, measured
  cost pressure on this project is Groq quota, not dollar cost, since every
  service in use (Back4App, Upstash, Groq, NPPES, ClinicalTrials.gov) is
  currently on a free tier.
- **Security audit plan:** not yet performed. No dependency-vulnerability
  scanning (e.g. `npm audit` as a CI step), no formal auth/authz flow review
  beyond the ACL verification already done for the journal classes (documented
  in `docs/privacy.md` in the implementation repo).
- **Cost analysis (projected monthly, current usage scale — single developer,
  pre-launch):**

  | Service | Tier | Cost today | Constraint that would force upgrade |
  |---|---|---|---|
  | Back4App | Free | $0 | Request volume / storage caps at real user scale |
  | Upstash Vector | Free | $0 | ~3,200 chunks used; free tier covers well beyond this corpus size |
  | Groq | Free / on-demand | $0 | **Already the binding constraint** — 100K tokens/day exhausted by moderate eval + dev usage |
  | Netlify | Free | $0 | Function invocation / bandwidth limits at real user scale |
  | NPPES / ClinicalTrials.gov | Public, no key | $0 | Public rate limits (not hit yet) |

  **Total today: $0/month.** The first real cost driver at any meaningful
  usage scale would be Groq — moving to a paid tier is more likely to be
  needed before any other service's free tier becomes binding.

---

## 3. Timeline & Milestones

Weeks are relative to the start of this build-phase cycle (map to the
program's actual calendar weeks). Each week includes explicit dependencies so
blockers are visible before they become blockers.

### Week 1 — Ship what's built, close the loudest gaps
- **Goal:** get everything already built (RAG rebuild, voice mode, all
  ClearSignal features) actually deployed and live, since it currently isn't.
- **Deliverables:** commits pushed to `main`, Netlify deployment verified
  live, `/api/chat` rate limiting added, README updated with deployed link.
- **Dependencies:** none — this is unblocked, existing work.
- **Blocker risk:** Groq daily quota exhaustion could delay verifying the
  live deployment's AI features end-to-end; plan around it by testing
  Groq-free paths (`/api/exposure`, journal CRUD, provider/trial lookup)
  first, AI paths once quota resets.

### Week 2 — Close security & observability gaps
- **Goal:** address the Production Engineering and Security items marked
  [PLANNED]/[GAP] above that are cheapest to close first.
- **Deliverables:** CSP/HSTS/CORS headers configured; basic structured
  logging on the AI-calling routes; `npm audit` added as a CI step;
  compound `(userId, occurredAt)` indexes added in Back4App.
- **Dependencies:** Week 1's deployment must be live to verify header/CORS
  behavior against the real deployed origin, not just `localhost`.

### Week 3 — Caching + cost control
- **Goal:** stop re-paying (in tokens) for repeated or near-duplicate work.
- **Deliverables:** cache layer for Groq rerank/generation calls on
  identical/near-identical queries; basic token-usage logging so the Groq
  quota problem is visible before it's hit, not after.
- **Dependencies:** Week 2's observability work (logging) is a prerequisite
  for measuring whether caching is actually reducing usage.

### Week 4 — Eval-driven quality pass
- **Goal:** use `scripts/eval-clearsignal.ts` results to fix real
  measured problems, starting with the reading-level finding (9.4 vs. a 6-8
  target) and expanding the gold set toward the spec's 150-200 target with
  real hand-verification (not just AI-drafted candidates).
- **Deliverables:** a documented before/after eval run (needs a full clean
  run, which needs Groq quota headroom — schedule for early in the day/week
  to avoid the daily cap), reading-level fix in the generation prompt,
  vocabulary table expanded toward the 200-400 target.
- **Dependencies:** Week 3's caching should reduce how much of the daily
  quota a full eval run consumes, making this more repeatable.

### Week 5 — Condition-profile architecture (stretch, not MVP)
- **Goal:** attempt the condition-agnostic engine / condition-profile
  extraction described in the original spec, IF the above weeks are on
  track. This is explicitly a stretch goal, not required for the MVP — see
  MVP scoping below.
- **Deliverables:** at minimum, one additional condition profile *stub*
  (config shape only, clearly marked unpopulated, per the spec's own
  instruction not to fake clinical content for conditions not researched).
- **Dependencies:** requires Weeks 1-4's core Lyme implementation to be
  stable, since this is a refactor of working code, not new-feature work.

### Week 6 — Demo prep + buffer
- **Goal:** integration testing, demo video recording, final documentation
  pass, buffer for anything that slipped from Weeks 1-5.
- **Deliverables:** demo video (3-5 min, all features + AI capabilities),
  final README pass (name/Z-number/FAU email/links), Canvas submission.
- **Dependencies:** everything above should be feature-complete going into
  this week; this week is explicitly buffer, not new scope.

### MVP scope vs. nice-to-have

**MVP (must work for the demo):** red-flag layer, RAG chat, negative-test
contextualizer, symptom/function journal with good-day logging, handoff
document generation, deployed and live.

**Nice-to-have (built, but not load-bearing for the core value prop):**
exposure reconstruction, rash photo timeline, co-infection prompts,
contested-territory page, provider/trial lookup, low-stimulation mode, voice
mode.

**Explicitly out of scope for this build phase:** the multi-condition
profile architecture beyond a single unpopulated stub, any real agentic
tool-calling loop, containerization, and a fully staffed observability stack
(structured logging is in scope; a dashboard product is not).

---

## Honesty note

Per the assignment's own framing, this plan says what's real and what isn't
rather than presenting aspirational architecture as delivered. The single
biggest scope gap against the original problem spec is that the
condition-agnostic engine / per-illness config architecture was not built —
red-flag rules, the RAG corpus, and the vocabulary mapping table are all
hardcoded for Lyme disease throughout the codebase. The architecture
generalizes in principle; the clinical content does not, and pretending
otherwise would be unsafe. Several other pieces (the 42-question gold eval
set, the ~45-entry vocabulary table, the contested-territory citations) are
AI-drafted and explicitly need a human clinical/legal review pass before this
touches a real patient — each is marked in its own file in the implementation
repo, not just here.
