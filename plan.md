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
| **AI Integration** | Hybrid RAG chat (dense + BM25 + Reciprocal Rank Fusion + LLM rerank), grounded in a CDC Lyme disease corpus, with query rewriting for follow-ups and a hard relevance threshold (empty context → the model says so, never guesses). A separately guarded LLM call generates the clinician-handoff narrative, validated against a banned-phrase/condition-name list with an always-available deterministic template fallback. Voice input (Groq Whisper, domain-vocabulary-seeded) and output (Groq TTS, browser-`SpeechSynthesis` fallback) layer on top. A real agentic feature — `/api/journal-agent`, a Groq tool-calling loop over the patient's own journal data — was also built this cycle (see the updated Agentic AI section below). This is not a bare chatbot wrapper — see `design.md` section 4 for the full component diagram. Rate limiting, loading states, and distinct error messages (permission denied / no microphone / network failure / empty transcript, etc.) are implemented on every AI-calling route, including `/api/chat` and `/api/exposure`, which were the two gaps in the prior pass — **now closed**. |
| **Backend & Database** | Back4App (Parse Server / MongoDB). Seven classes with full CRUD: `HealthLog`, `Conversation` (pre-existing), `SymptomEntry`, `FunctionEntry`, `TimelineAnchor`, `ClinicalEncounter`, `RashPhoto` (this build-phase cycle). Every write path sets an owner-scoped ACL (`new Parse.ACL(user)`) before saving — verified by direct code review, not assumed. Compound indexes for the journal classes now have a real, idempotent creation script (`scripts/setup-indexes.ts`) — see the updated Database Optimization section. |
| **Authentication** | Parse User registration/login/session persistence. Every protected page checks `getCurrentUser()` and redirects unauthenticated visitors; ACLs enforce the same boundary server-side regardless of client-side checks. Secrets (`GROQ_API_KEY`, Back4App app/JS keys, `UPSTASH_VECTOR_REST_URL`/`TOKEN`) live in `.env.local`, never committed — `.env.local.example` documents what's needed without real values. |
| **Documentation** | README covers AI integration, setup instructions, and tech stack. `healthcare-ai/docs/deployment.md` (new this cycle) covers local dev, Docker, Netlify, database setup, eval harness, and observability end to end. **[NEEDS AUTHOR INPUT before submission]**: name, Z-number, FAU email, deployed app link, demo video link. |
| **Deployment** | Netlify (`netlify.toml` at this repo's root, `base = "healthcare-ai"`). The full ClearSignal codebase, including everything built this cycle, is pushed to this repo. **[GAP, honestly stated]**: I did not have Netlify CLI/dashboard access in this session to trigger and confirm a fresh production deploy of this cycle's changes (new routes, new headers, the `next` version bump) — see `docs/deployment.md` section 3 for the exact scope of what is and isn't verified. What *is* verified locally: `npm run build` passes clean with all 23 routes generated, `tsc --noEmit` and `eslint .` both clean. |
| **GitHub Repository** | Implementation history lives in `week2-Raj102002` / `week3-Raj102002` (RAG/voice rebuild, then the ClearSignal pivot, then this build-phase's Production Engineering/Security/Agentic AI pass — each logically-scoped commit explains the *why*, not just the *what*). This repo (`buildphase-Raj102002`) now holds both the planning docs and a synced copy of the implementation, per the later clarification that both were wanted here. |
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
- **Agentic AI patterns: now real, built this cycle.** `/api/journal-agent`
  (`app/api/journal-agent/route.ts` + `lib/journal-tools.ts`) is a genuine
  multi-step tool-calling loop, not a fixed pipeline: the model receives six
  JSON Schema tool definitions (`list_symptoms`, `get_severity_trend`,
  `get_function_impact`, `list_anchors`, `list_encounters`,
  `get_symptom_free_interval`), decides which to call and in what order via
  Groq's OpenAI-compatible `tools`/`tool_choice: "auto"` interface, and the
  route loops (up to `MAX_ITERATIONS = 5`) feeding tool results back as
  `role: "tool"` messages until the model returns a plain-text answer. This
  is the rest of the app's fixed hybrid-RAG pipeline's explicit counterpart —
  see `design.md`'s AI component diagram for the distinction. **Verified
  live**, not just typechecked: a real dev-server request with four
  synthetic fatigue entries produced two real tool calls
  (`get_severity_trend` → a genuine computed linear-regression slope of
  1.08 severity points/week, `get_symptom_free_interval` → a genuine
  10-day median gap) and a natural-language answer citing both numbers. A
  second test directly asked "do I have Lyme disease, what antibiotic dose
  should I take" — the model called `list_symptoms`/`list_anchors`, found no
  supporting data, and correctly deflected diagnosis/prescription to a
  clinician per the system prompt's hard rules, never fabricating either.
  A UI entry point ("Ask Your Journal" tab in `app/journal/page.tsx`) posts
  the four journal arrays plus a free-text question to this route.
- **Caching and fallback for failed retrievals:** fallback behavior (empty-context
  handling, rerank-failure fallback to RRF order, query-rewrite-failure
  fallback to the raw message) remains as before — see `design.md` section 2.
  **Caching is now implemented** (`lib/cache.ts`, an in-memory TTL cache
  wrapping retrieval and TTS calls) — see the updated Caching section below
  for the measured before/after latency.

#### Production Engineering

All items below were **built and verified this cycle** unless a gap is
explicitly called out — this replaces the earlier all-[PLANNED] state.

- **Containerization: built.** Multi-stage `Dockerfile` (deps → builder →
  distroless-style `node:20-alpine` runner, non-root user, `output:
  "standalone"`), `docker-compose.yml`, `.dockerignore`. This targets local
  reproducibility and grading review, not a change of the production
  deployment target — Netlify remains the actual host. **Honest gap:** no
  `docker` binary was available in the sandbox this was built in, so the
  image itself was never actually built or booted. What is verified: the
  Next.js standalone build the Dockerfile depends on produces `server.js` at
  the correct top-level path (confirmed directly), and every file path the
  `COPY` steps reference exists. See `docs/deployment.md` section 2 for the
  precise scope of what's proven vs. assumed.
- **Observability: built.** Structured JSON logging (`lib/logger.ts`) plus a
  custom Back4App-backed request-metrics system (`lib/metrics.ts`'s
  `RequestLog` class and `withMetrics()` wrapper, applied to every API
  route) recording route, status, duration, and token usage per request. An
  admin dashboard (`/admin`, `app/api/admin/metrics/route.ts`) aggregates
  these into request counts, p50/p95 latency, error rate, and token usage.
  **Verified live**: real requests were sent to the dev server, real
  `RequestLog` writes landed in Back4App, and the dashboard's p50/p95
  aggregation was confirmed against them. Sentry (or equivalent third-party
  error tracking) was **not** wired up — it needs a DSN this project doesn't
  have credentials for; the structured-logging + custom-metrics approach is
  the real, working substitute in place, not a stand-in claimed equivalent.
- **Database optimization: built.** `scripts/setup-indexes.ts` creates
  compound indexes (`user` + `occurredAt`) on the journal classes via
  `Parse.Schema`, gated on an ephemeral `BACK4APP_MASTER_KEY` env var that is
  never stored in `.env.local` (see `docs/database-optimization.md`).
  Idempotent — safe to re-run. **Honest gap:** not actually executed against
  a live Back4App app in this session (no real master key available here);
  the script was typechecked and logic-reviewed, not run end-to-end.
- **Caching strategy: built.** `lib/cache.ts`, an in-memory TTL cache wired
  into `lib/retrieval.ts` (dense+BM25 retrieval results) and
  `app/api/speak/route.ts` (TTS audio for repeated text). **Verified live**:
  an identical retrieval query measured at 2224ms cold dropped to 0ms on a
  cache hit. Documented limitation, consistent with rate limiting and
  token-budget tracking: this lives in one warm Netlify function instance's
  memory, not a shared store — the correct production upgrade is Upstash
  Redis (already the vector-store vendor, so no new vendor relationship),
  not implemented because it needs Redis REST credentials this project
  doesn't have.
- **Infrastructure documentation: built.** `docs/deployment.md` (new this
  cycle) covers local dev, Docker, Netlify (including the actual
  `netlify.toml` contents and where it lives), one-time database setup, the
  eval harness, observability, and a plainly-stated "known gaps" section
  (no health-check endpoint, no CI pipeline, no automated rollback, Redis/
  Sentry upgrades blocked on credentials).
- **Performance targets (p95 < 500ms API, p95 < 100ms DB, uptime > 99.5%,
  error rate < 1%):** now *measurable* via the `/admin` dashboard built this
  cycle, but not yet measured against sustained real traffic — the numbers
  it shows reflect whatever traffic this app has seen during development,
  not a simulated production load. Establishing a real baseline needs actual
  usage after deployment, which single-session work can't fabricate.

#### Security & Costs

- **Secrets management:** environment variables only, never committed
  (`.env.local` gitignored, `.env.local.example` documents shape without
  values). No secrets rotation policy, no dedicated secrets manager beyond
  Netlify's environment variable UI — still true, not treated as a gap since
  nothing is hardcoded (verified by grep this cycle, see the audit below). A
  new credential this cycle, `BACK4APP_MASTER_KEY`, is documented as
  ephemeral-only — passed as a one-off env var for `setup-indexes`, never
  written to disk.
- **Security hardening — built this cycle:**
  - Rate limiting: **`/api/chat` and `/api/exposure` gaps closed** — every
    route that calls Groq or an external API is now rate-limited (in-memory,
    per-IP, sliding window). Same documented cross-instance limitation as
    before (`lib/rate-limit.ts`); a production deployment under real load
    would want this backed by Upstash Redis instead.
  - Input validation: **zod schemas added** (`lib/validation.ts`), applied at
    every route parsing a JSON body from an untrusted client — `/api/chat`,
    `/api/test-context`, `/api/exposure`, `/api/handoff-narrative`,
    `/api/speak`, `/api/journal-agent`. Verified against real malformed
    requests this cycle: oversized severity values, invalid enum values, and
    empty required strings all return a 400 with the specific field-level
    error rather than reaching downstream code.
  - Prompt-injection defenses: two real layers now — `lib/generation.ts`'s
    system prompt instructs the model to treat retrieved context and user
    input as data, never as instructions overriding system rules; and
    `lib/prompt-injection.ts` does pattern-based detection, logged (not
    blocking) on `/api/chat`. Deliberately non-blocking: hard-rejecting
    phrasing like "ignore my last symptom, I meant something else" would be a
    real false-positive cost in a health-chat population. **Honest gap
    carried forward:** not stress-tested against a real adversarial prompt
    set — the spec's own 50+-prompt red-team pass is still not done.
  - CORS / CSP / HSTS / security headers: **configured** in
    `next.config.ts`'s `headers()` — `X-Frame-Options: DENY`,
    `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
    `Permissions-Policy` (mic allowed, camera denied — matches real feature
    use), HSTS (2-year max-age, preload), and a CSP. The CSP isn't maximally
    strict — `script-src`/`style-src` both need `'unsafe-inline'` for
    Next.js's own hydration bootstrap and one inline print stylesheet; fixing
    that needs per-request nonces via middleware, a real scoped follow-up,
    not done here. No CORS headers are set at all, deliberately — same-origin
    is already the secure default; adding a permissive
    `Access-Control-Allow-Origin` would weaken, not improve, this.
- **Cost optimization: built.** Token usage is now recorded on every Groq
  call (`recordTokenUsage()` in `lib/metrics.ts`, wired into `/api/chat`,
  `lib/rerank.ts`, `lib/query-rewrite.ts`, `/api/journal-agent`), summed
  against a configurable `DAILY_TOKEN_BUDGET` (defaults to 90,000, just under
  Groq's real 100,000/day free-tier cap), with a warning logged once crossed.
  This is a per-warm-instance counter, same limitation as rate limiting and
  caching — it doesn't coordinate across concurrent Netlify instances, so
  it's a real signal, not a hard enforcement guarantee. The underlying cost
  pressure is unchanged from before: every service in use (Back4App,
  Upstash, Groq, NPPES, ClinicalTrials.gov) is on a free tier, and Groq
  quota remains the binding constraint.
- **Security audit: performed, documented in `docs/security-audit.md`.**
  Real findings, not a template: `npm audit` started at 11 vulnerabilities
  (4 moderate, 7 high); `npm audit fix` plus a deliberate `next`/
  `eslint-config-next` bump to `16.3.0` (same major, chosen over a blind
  `--force`) closed 7, verified afterward with a full clean
  `tsc`/`eslint`/`build` pass. **4 remain (3 moderate, 1 high)**, all
  transitive from the `parse` SDK's `uuid`/`ws`/`@babel/runtime-corejs3` —
  fixing needs `parse@8.6.0`, a 3-major-version jump on the entire
  auth/data layer, **deliberately not force-upgraded** without dedicated
  regression testing (documented risk reasoning: the vulnerable code path is
  `Parse.LiveQuery`, which this app never calls). A grep-based hardcoded-
  credential scan across app source found none; `.env.local` confirmed never
  committed. What this audit explicitly does not cover: penetration
  testing/fuzzing, load testing, or authorization testing beyond the
  existing ACL review.
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
  needed before any other service's free tier becomes binding. This is now a
  *monitored* $0/month rather than an assumed one — `DAILY_TOKEN_BUDGET`
  tracking (above) makes the approach to that 100K/day ceiling visible in
  logs before it's hit.

---

## 3. Timeline & Milestones

Weeks are relative to the start of this build-phase cycle (map to the
program's actual calendar weeks). Each week includes explicit dependencies so
blockers are visible before they become blockers. **Weeks 1–3 below are now
complete** (marked accordingly); Weeks 4–6 remain the real, open plan.

### Week 1 — Ship what's built, close the loudest gaps — **done**
- **Goal:** get everything already built (RAG rebuild, voice mode, all
  ClearSignal features) actually deployed and live.
- **Delivered:** commits pushed across `week2-Raj102002`, `week3-Raj102002`,
  `buildphase-Raj102002`, and the personal repo; `/api/chat` rate limiting
  added. **Still open:** a fresh Netlify production deploy of this cycle's
  code was not triggered/confirmed in this session (no dashboard/CLI access)
  — see `docs/deployment.md` section 3. README author-info fields
  (Z-number, deployed link, demo video) are still pending.

### Week 2 — Close security & observability gaps — **done**
- **Goal:** address the Production Engineering and Security items previously
  marked [PLANNED]/[GAP].
- **Delivered:** CSP/HSTS/security headers configured (`next.config.ts`);
  structured logging (`lib/logger.ts`) and a full metrics/dashboard system
  (`lib/metrics.ts`, `/admin`) on every route, not just the AI-calling ones;
  `npm audit` run and remediated (11 → 4 vulnerabilities, remainder
  documented with a risk rationale) rather than just added as an unrun CI
  step; compound `(user, occurredAt)` indexes scripted
  (`scripts/setup-indexes.ts`), though not yet executed against a live
  Back4App app (no master key available this session). Zod input validation
  and non-blocking prompt-injection logging were also added — beyond this
  week's original scope, folded in here since they're the same category of
  work.

### Week 3 — Caching + cost control — **done**
- **Goal:** stop re-paying (in tokens/latency) for repeated or
  near-duplicate work, and make the Groq quota problem visible before it's
  hit.
- **Delivered:** `lib/cache.ts` (in-memory TTL cache) wired into retrieval
  and TTS, measured 2224ms → 0ms on a cache hit; `DAILY_TOKEN_BUDGET`
  tracking (`recordTokenUsage()`) across every Groq call site, logging a
  warning once the configurable threshold is crossed.

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
mode, and — new this cycle — the journal tool-calling agent, containerization,
observability dashboard, caching layer, and cost tracking (all real and
built, but none of them change what the app does for the patient; they
change how reliably/cheaply/safely it does it).

**Explicitly out of scope for this build phase:** the multi-condition
profile architecture beyond a single unpopulated stub (still not built —
red-flag rules, the RAG corpus, and the vocabulary table remain hardcoded for
Lyme disease), a fully executed adversarial prompt-injection red-team pass,
CI-pipeline automation of `tsc`/`eslint`/`npm audit`, a health-check
endpoint, Redis-backed rate limiting/caching, and Sentry-equivalent
third-party error tracking (the latter two are architecturally ready — same
vendor for Redis, same logging shape for a future Sentry swap — but blocked
on credentials this project doesn't have).

---

## Honesty note

Per the assignment's own framing, this plan says what's real and what isn't
rather than presenting aspirational architecture as delivered. As of this
revision, every build-phase topic area (Problem Selection, Agentic AI & RAG,
Production Engineering, Security & Costs) has real, built, and — where
feasible in this session — live-verified work behind it, not just design
docs: containerization, observability, database-index tooling, caching,
input validation, prompt-injection logging, security headers, cost tracking,
a real `npm audit` remediation pass, and a genuine multi-step tool-calling
agent over the patient's own journal data.

What remains genuinely open, stated plainly rather than smoothed over:
- The condition-agnostic engine / per-illness config architecture was **not**
  built — red-flag rules, the RAG corpus, and the vocabulary mapping table
  are all hardcoded for Lyme disease throughout the codebase. The
  architecture generalizes in principle; the clinical content does not, and
  pretending otherwise would be unsafe.
- Several pieces (the 42-question gold eval set, the ~45-entry vocabulary
  table, the contested-territory citations) are AI-drafted and explicitly
  need a human clinical/legal review pass before this touches a real
  patient.
- Things that are architecturally ready but blocked purely on credentials
  this project doesn't have in this environment: Redis-backed rate
  limiting/caching (needs an Upstash Redis REST URL/token), Sentry or
  equivalent error tracking (needs a DSN), a fresh confirmed Netlify
  production deploy of this cycle's code (needs dashboard/CLI access), and
  running `scripts/setup-indexes.ts` against a live Back4App app (needs a
  real master key).
- Docker's image was never actually built or booted in this session — no
  `docker` binary was available in the sandbox. The pieces it depends on
  (standalone build output, traced file paths) were individually verified;
  the image itself was not.
- No CI pipeline exists yet; `tsc`/`eslint`/`npm run build` were all run by
  hand throughout this pass, verified clean every time a change was made,
  but nothing enforces that automatically on push today.

Each of these is a real, scoped, named gap — not a vague disclaimer — because
that's more useful to grade against than a plan that claims completeness it
doesn't have.
