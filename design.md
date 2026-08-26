# design.md — ClearSignal Technical Design

This document describes how ClearSignal is actually built as of this snapshot of
the build phase. Diagrams are Mermaid (renders natively on GitHub). Where a
described component is not yet implemented, it's labeled **[PLANNED]** rather
than presented as done — see `plan.md` for the build-phase items still ahead.

---

## 1. System Architecture

```mermaid
graph TB
    subgraph Client["Browser — Next.js 16 App Router, React 19"]
        UI["Pages: /chat /journal /handoff /test-context<br/>/providers /contested-territory /dashboard"]
        Crypto["Web Crypto AES-GCM<br/>(journal notes encrypted before save)"]
    end

    subgraph Netlify["Netlify — serverless functions (withMetrics-wrapped)"]
        ChatAPI["/api/chat"]
        TranscribeAPI["/api/transcribe"]
        SpeakAPI["/api/speak"]
        TestContextAPI["/api/test-context"]
        ExposureAPI["/api/exposure"]
        HandoffAPI["/api/handoff-narrative"]
        ProvidersAPI["/api/providers"]
        TrialsAPI["/api/trials"]
        JournalAgentAPI["/api/journal-agent<br/>(tool-calling loop)"]
        MetricsAPI["/api/admin/metrics"]
    end

    subgraph ObsCache["Observability & Caching (new)"]
        Logger["lib/logger.ts — structured JSON logs"]
        Metrics["lib/metrics.ts — RequestLog + token-budget tracking"]
        Cache["lib/cache.ts — in-memory TTL cache<br/>(retrieval + TTS)"]
    end

    subgraph AI["AI Services"]
        Groq["Groq API<br/>llama-3.3-70b-versatile (chat, rerank, rewrite, narrative)<br/>whisper-large-v3-turbo (STT)<br/>playai-tts (TTS)"]
        Upstash["Upstash Vector<br/>dense retrieval, built-in embedding model"]
    end

    subgraph Data["Data Layer"]
        Back4App["Back4App — Parse Server / MongoDB<br/>Users, HealthLog, Conversation, SymptomEntry,<br/>FunctionEntry, TimelineAnchor, ClinicalEncounter, RashPhoto"]
        CorpusJSON["data/corpus.json<br/>text mirror bundled with the function, used for BM25"]
    end

    subgraph External["Public External APIs (no key required)"]
        NPPES["NPPES NPI Registry"]
        CTGov["ClinicalTrials.gov API v2"]
    end

    UI -->|fetch, JSON/stream| ChatAPI
    UI -->|fetch| TranscribeAPI
    UI -->|fetch| SpeakAPI
    UI -->|fetch| TestContextAPI
    UI -->|fetch| ExposureAPI
    UI -->|fetch| HandoffAPI
    UI -->|fetch| ProvidersAPI
    UI -->|fetch| TrialsAPI
    UI -->|Parse JS SDK, direct from browser| Back4App
    UI -->|fetch, posts journal arrays already held client-side| JournalAgentAPI
    Crypto -.applies to.-> UI

    ChatAPI --> Groq
    ChatAPI --> Upstash
    ChatAPI --> CorpusJSON
    TestContextAPI --> Groq
    TestContextAPI --> Upstash
    ExposureAPI --> CorpusJSON
    HandoffAPI --> Groq
    TranscribeAPI --> Groq
    SpeakAPI --> Groq
    ProvidersAPI --> NPPES
    TrialsAPI --> CTGov
    JournalAgentAPI --> Groq

    ChatAPI -.wraps every route.-> Metrics
    Metrics --> Logger
    Metrics -->|RequestLog writes| Back4App
    ChatAPI -.retrieval + TTS.-> Cache
```

**Note on the auth/data path:** the browser talks to Back4App directly via the
Parse JS SDK (not proxied through a Netlify function) for all CRUD on
`HealthLog`, `Conversation`, and the five journal classes. This is the same
pattern the project started with — Back4App issues session tokens and enforces
ACLs server-side, so there's no meaningful security reason to add a proxy layer
in front of it, and doing so would add latency for no benefit.

---

## 2. Data Flow — RAG Chat Request

The core AI feature. Every other AI-calling route (`/api/test-context`,
`/api/handoff-narrative`) follows a smaller version of the same shape: red flag
check where applicable → retrieval where applicable → generation → validation.

```mermaid
sequenceDiagram
    participant U as Browser
    participant C as /api/chat
    participant RF as lib/red-flag.ts
    participant QR as lib/query-rewrite.ts
    participant BM as lib/bm25.ts (in-memory)
    participant UV as Upstash Vector
    participant RR as lib/rerank.ts
    participant G as Groq

    U->>C: POST { messages[], userProfile }
    C->>RF: screenRedFlags(lastMessage)
    alt red flag matched (crisis/emergency/urgent)
        RF-->>C: static copy + severity
        C-->>U: static copy, X-Red-Flag header — no model call at all
    else no red flag
        C->>QR: rewriteQuery(history, message)
        QR->>G: small rewrite call (llama-3.3-70b)
        G-->>QR: standalone query
        C->>BM: bm25Search(expandedQuery, 20)
        C->>UV: dense query(expandedQuery, 20)
        BM-->>C: top-20 sparse
        UV-->>C: top-20 dense
        Note over C: Reciprocal Rank Fusion -> fused top-20
        C->>RR: rerank(query, fused, groq)
        RR->>G: score each candidate 0-10
        G-->>RR: scores
        Note over RR: drop below MIN_RELEVANCE_SCORE (6) -> may return []
        RR-->>C: top-5 (or empty)
        Note over C: buildContext() caps at token budget,<br/>truncates lowest-score-first
        C->>G: system + numbered context + history + query, stream:true
        G-->>C: streamed tokens
        C-->>U: streamed text, X-RAG-Sources header (base64 JSON),<br/>X-Coinfection-Notes header if signals detected
    end
```

**Failure/fallback behavior actually implemented:**
- Empty retrieval (nothing clears the relevance bar) → the model is instructed
  to say it doesn't have that information rather than answer from parametric
  knowledge, per the system prompt in `lib/generation.ts`.
- Malformed rerank JSON from Groq → falls back to raw RRF fusion order rather
  than failing the request (`lib/rerank.ts`).
- Query rewrite failure → falls back to the raw user message (`lib/query-rewrite.ts`).
- TTS failure → falls back to the browser's `SpeechSynthesis` API (`hooks/useSpeechOutput.ts`).
- Handoff narrative generation failure or banned-phrase/condition-name violation
  → falls back to a fully deterministic templated summary (`lib/handoff-narrative.ts`).

**Caching: implemented.** `lib/cache.ts` (in-memory TTL cache) sits in front of
`lib/retrieval.ts`'s dense+BM25 lookup and `app/api/speak/route.ts`'s TTS call
— an identical retrieval request measured at 2224ms cold, 0ms on a cache hit.
Given the free-tier daily token limit is easy to exhaust (documented in
`plan.md`'s cost section), this directly reduces how often that ceiling gets
hit. Same per-warm-instance limitation as rate limiting (below): does not
share state across concurrent Netlify function instances or survive a cold
start. The Groq generation call itself is intentionally *not* cached — chat
answers should reflect the live conversation, not a stale cached response.

---

## 3. User Flow

```mermaid
flowchart LR
    Start([Visit site]) --> Auth{Logged in?}
    Auth -- No --> Login[Register / Login — Parse auth]
    Login --> Auth
    Auth -- Yes --> Chat["/chat — ask a question,<br/>type or voice"]
    Chat --> Journal["/journal — Symptoms / Function /<br/>Anchors / Encounters / Rash Photos / Exposure tabs"]
    Journal --> TestCtx["/test-context — contextualize<br/>a negative test result"]
    Journal --> Handoff["/handoff — one-page document,<br/>print / save as PDF"]
    Chat --> Contested["/contested-territory —<br/>PTLDS debate, both sides"]
    Chat --> Providers["/providers — specialist or<br/>trial lookup by location"]
    Handoff --> Clinician([Patient brings printed<br/>document to appointment])
```

---

## 4. AI Component Diagram

```mermaid
graph TB
    subgraph Ingestion["Ingestion — offline, npm run ingest, never on request path"]
        MD["corpus/*.md"] --> Chunker["Recursive chunker<br/>~600 tok target, 100 tok overlap,<br/>never splits mid-sentence"]
        CSV["data/*_long.csv"] --> TabChunker["Tabular chunk builder<br/>(county/state/race rollups)"]
        Chunker --> Hash["Content hash vs. manifest —<br/>skip unchanged, upsert by ID"]
        TabChunker --> Hash
        Hash --> UpstashUpsert["Upstash Vector upsert<br/>(built-in embedding model,<br/>text sent raw, no local embedding step)"]
        Hash --> CorpusOut["data/corpus.json<br/>text+metadata mirror, for BM25"]
    end

    subgraph Retrieval["Retrieval — request time"]
        Query["Rewritten query"] --> VocabExpand["lib/vocabulary-map.ts<br/>lay <-> clinical term expansion"]
        VocabExpand --> Dense["Upstash dense search (top-20)"]
        VocabExpand --> Sparse["BM25 local search (top-20)"]
        Dense --> RRF["Reciprocal Rank Fusion"]
        Sparse --> RRF
        RRF --> Rerank["Groq LLM rerank + min-relevance threshold<br/>(llama-3.3-70b — 8b tried first,<br/>proved unreliable at disease-mismatch judgment)"]
        Rerank --> Context["Numbered context block, token-budget capped"]
    end

    subgraph Generation
        Context --> Prompt["System safety rules + context<br/>+ chat history + query"]
        Prompt --> LLM["Groq llama-3.3-70b-versatile, streamed"]
        LLM --> CiteCheck["Citation number validity check"]
        CiteCheck --> Output["Answer + numbered sources"]
    end

    subgraph Deterministic["Deterministic, no-model-in-the-loop logic"]
        RedFlag["lib/red-flag.ts — pattern screen"] -.short-circuits.-> Prompt
        CoInfection["lib/co-infection.ts — pattern screen"] -.adds note, non-blocking.-> Output
        JournalStats["lib/handoff-analysis.ts —<br/>frequency/migratory/episodic/trend/<br/>function-impact/coverage stats"] --> HandoffLLM["Guarded narrative LLM call<br/>(150-word cap, banned-phrase rules)"]
        HandoffLLM --> HandoffValidate["Banned-phrase + condition-name validation"]
        HandoffValidate -->|fail or unavailable| Template["Deterministic templated narrative<br/>(always available, no model needed)"]
        HandoffValidate -->|pass| HandoffOut["Generated narrative"]
    end

    subgraph Agent["Real agentic loop — /api/journal-agent (new this cycle)"]
        Question["Patient's free-text question<br/>+ journal arrays already fetched client-side"] --> AgentLLM["Groq llama-3.3-70b-versatile<br/>tools + tool_choice: auto"]
        AgentLLM -->|tool_calls present| Dispatch["dispatchTool() —<br/>list_symptoms / get_severity_trend /<br/>get_function_impact / list_anchors /<br/>list_encounters / get_symptom_free_interval"]
        Dispatch -->|tool results appended as role:tool messages| AgentLLM
        AgentLLM -->|no tool_calls, or MAX_ITERATIONS=5 reached| AgentOut["Final answer —<br/>never diagnoses, never prescribes<br/>(system-prompt hard rule)"]
    end
```

**Agentic AI patterns: real, built this cycle — `/api/journal-agent`.** The
rest of the app above (screen → rewrite → retrieve → rerank → generate →
validate) is still an honest, fixed *pipeline*: no step there lets the model
choose what happens next, and calling that agentic would still be
overclaiming. But the journal agent is a genuine multi-step tool-calling
loop: the model receives six JSON-Schema tool definitions (`Agent` subgraph
above), decides which to call, in what order, and whether it needs more than
one before it can answer — the route loops feeding results back until the
model stops requesting tools or `MAX_ITERATIONS` (5) is hit. **Verified
live** against the dev server: a "is my fatigue getting worse, and how often
do I get symptom-free breaks" question triggered two real, model-chosen tool
calls (`get_severity_trend` then `get_symptom_free_interval`) and a correct
natural-language synthesis of both results (a computed 1.08-point/week slope,
a computed 10-day median gap); a direct "do I have Lyme disease, what
antibiotic dose" question triggered `list_symptoms`/`list_anchors` lookups
and then correctly refused both the diagnosis and the prescription per the
system prompt's hard rules, deflecting to a clinician instead. The reranker
and query rewriter elsewhere in the app remain single-shot, fixed-role LLM
calls, not agentic — that distinction is now backed by a real contrasting
example in the same codebase rather than asserted abstractly.

---

## 5. Database Schema (Back4App / Parse)

Every class below uses `new Parse.ACL(user)` at creation time, which restricts
both read and write to that one authenticated user — verified against every
save path in `lib/parse-client.ts` and `lib/journal-client.ts`. See
`docs/privacy.md` in the implementation repo for the full detail, including the
two real limitations (master-key bypass, and `RashPhoto.image` file URLs not
being ACL-protected the way the owning record is).

```mermaid
erDiagram
    USER ||--o{ HEALTHLOG : owns
    USER ||--o{ CONVERSATION : owns
    USER ||--o{ SYMPTOMENTRY : owns
    USER ||--o{ FUNCTIONENTRY : owns
    USER ||--o{ TIMELINEANCHOR : owns
    USER ||--o{ CLINICALENCOUNTER : owns
    USER ||--o{ RASHPHOTO : owns

    USER {
        string username
        string email
        array allergies
        array conditions
        array medications
        string bloodType
        number age
        string preferredLanguage
    }
    HEALTHLOG {
        string symptoms
        string severity "low | medium | high"
        string notes
        object vitals
        pointer userId
    }
    CONVERSATION {
        string title
        array messages "[{role, content}]"
        string lastMessage
        pointer userId
    }
    SYMPTOMENTRY {
        date occurredAt "when it happened"
        date createdAt "when logged — gap is meaningful"
        string datePrecision "exact|week|month|approximate"
        string symptomCode "normalized"
        string symptomLabel "patient's own words"
        number severity "0-10"
        string bodySite
        number durationMinutes
        string notes "AES-GCM encrypted client-side"
        array context
        pointer userId
    }
    FUNCTIONENTRY {
        date occurredAt
        string domain "stairs|work_hours|driving|cooking|showering|leaving_home"
        number value
        string note
        pointer userId
    }
    TIMELINEANCHOR {
        string type "tick_bite|rash_onset|travel|outdoor_exposure|antibiotic_start|antibiotic_end|symptom_onset|test_taken|test_result|personal_event"
        date occurredAt
        string precision "exact|week|month|approximate"
        string detail
        pointer userId
    }
    CLINICALENCOUNTER {
        date occurredAt
        string specialty
        string toldWhat
        array ruledOut
        array testsOrdered
        pointer userId
    }
    RASHPHOTO {
        date occurredAt
        file image "not ACL-protected at the file-URL level"
        string note
        pointer userId
    }
```

**Indexes: scripted, not yet executed.** Parse Server auto-indexes `objectId`
and `createdAt`. All list queries filter on `user` and sort on `occurredAt`
(`lib/journal-client.ts`), so `scripts/setup-indexes.ts` (new this cycle)
creates a compound `(user, occurredAt)` index per journal class via
`Parse.Schema`, gated on an ephemeral `BACK4APP_MASTER_KEY` env var (never
stored in `.env.local` — see `docs/database-optimization.md`). Idempotent, so
safe to re-run. **Honest gap:** not actually run against a live Back4App app
in this session — no real master key was available in this environment. The
script itself was typechecked and reviewed, not executed end-to-end.

**Connection pooling / backups:** handled at the Back4App platform level (managed
MongoDB); no custom configuration has been done on this project's part.

---

## 6. API Architecture

All routes are Next.js App Router route handlers (`app/api/*/route.ts`),
deployed as individual Netlify functions. None currently have OpenAPI/Swagger
docs generated — this table is the source of truth today.

| Route | Method | Request | Response | Notes |
|---|---|---|---|---|
| `/api/chat` | POST | `{ messages: {role,content}[], userProfile? }` | `text/plain` stream; headers `X-RAG-Sources` (base64 JSON), `X-Coinfection-Notes` (base64 JSON, optional), `X-Red-Flag` (severity, on short-circuit) | Red-flag screened before any model call. Zod-validated and rate-limited (added this cycle, previously the one gap). |
| `/api/transcribe` | POST | `multipart/form-data`: `audio` (File), `language?` | `{ text: string }` | Groq `whisper-large-v3-turbo`, prompt-seeded with domain vocabulary. Rate-limited (30 req / 10 min / IP). |
| `/api/speak` | POST | `{ text: string }` | `audio/mpeg` binary | Groq `playai-tts`. Rate-limited (30 req / 10 min / IP). Client falls back to `SpeechSynthesis` on failure. |
| `/api/test-context` | POST | `{ symptomOnsetDate: string, testDate: string }` | `{ daysFromOnset, window, message, sources[], contextAvailable }` | Date math is deterministic; only the sourced explanation text is retrieved. Rate-limited (20/10min/IP). |
| `/api/exposure` | POST | `{ state, county, months: [{month,year,activities[]}] }` | `{ found: boolean, message, sources? }` | No Groq call — direct deterministic lookup against `data/corpus.json` by chunk ID. |
| `/api/handoff-narrative` | POST | `{ analysis: HandoffAnalysis }` | `{ narrative: string, source: "generated"\|"templated" }` | Falls back to template on any validation failure. Rate-limited (10/10min/IP). |
| `/api/providers` | GET | Query params: `specialty`, `state` (required), `city?` | `{ providers: [{npi,name,credential,specialty,city,state,phone}] }` | Proxies NPPES NPI Registry, no key required. Rate-limited (30/10min/IP). |
| `/api/trials` | GET | Query params: `location?` | `{ trials: [{nctId,title,status,locations[],url}] }` | Proxies ClinicalTrials.gov v2, condition fixed to "Lyme Disease", no key required. Rate-limited (30/10min/IP). |
| `/api/journal-agent` | POST | `{ question: string, journalData: { symptoms[], functionEntries[], anchors[], encounters[] } }` | `{ answer: string, toolCalls: {tool,args}[], iterations: number }` | New this cycle. Real Groq tool-calling loop (see design section 4) over journal data the authenticated client already fetched and sends — this route never independently queries Back4App. Zod-validated, rate-limited (15/10min/IP). |
| `/api/admin/metrics` | GET | — | `{ routes: [{route, count, p50, p95, errorRate, tokenUsage}] }` | New this cycle. Aggregates real `RequestLog` writes from `withMetrics()`, which now wraps every route in this table. Powers the `/admin` dashboard. |
| `/api/health-insights` | POST | Pre-existing route from the original project baseline | — | Not modified in this build-phase cycle. |

**Rate limiting: `/api/chat` and `/api/exposure` gaps closed this cycle** —
every route that calls Groq or an external API is now rate-limited, not just
the ones listed as such in the prior revision of this document.

**Auth on API routes: [GAP].** None of these routes currently verify a Parse
session token server-side — they're either public-data proxies (providers,
trials), operate on data the client already possesses (test-context, exposure,
chat), or process data the client sends directly (handoff-narrative). This is
acceptable for the current no-PII-in-request-body shape, but should be
revisited if any route starts accepting patient-identifying data in the
request body.

**Rate limiting implementation:** in-memory, per-IP, sliding window
(`lib/rate-limit.ts`). This only bounds abuse within a single warm Netlify
function instance — it does not coordinate across concurrent instances and
resets on cold start. That's a deliberate, documented tradeoff (no separate
rate-limiting service/Redis instance needed), not an oversight — see cost
notes in `plan.md`.

---

## 7. Deployment Architecture

```mermaid
graph LR
    Dev["Local dev — npm run dev"] -->|git push| GitHub["GitHub<br/>week2/week3-Raj102002, buildphase-Raj102002,<br/>personal repo"]
    GitHub -->|auto-deploy on push| Netlify["Netlify<br/>netlify.toml: base=healthcare-ai<br/>@netlify/plugin-nextjs"]
    Netlify --> Functions["Serverless functions,<br/>one per API route"]
    Netlify --> StaticPages["Static/prerendered pages,<br/>CDN-served"]
    Functions --> GroqSvc["Groq API"]
    Functions --> UpstashSvc["Upstash Vector"]
    Functions --> Back4AppSvc["Back4App REST API"]
    Functions --> PublicAPIs["NPPES / ClinicalTrials.gov"]
    EndUser["End-user browser"] --> StaticPages
    EndUser --> Functions
    EndUser -->|Parse JS SDK, direct| Back4AppSvc

    Dev -.alternate path.-> Docker["Docker — multi-stage build<br/>node:20-alpine, output: standalone"]
    Docker --> Portable["Portable / self-hosted deploy target<br/>(grading review, local parity — not production)"]
```

**Current status: live and confirmed.** All of this document's code — the RAG
rebuild, every ClearSignal feature, and this cycle's Production
Engineering/Security/Agentic AI work — is pushed to `week2-Raj102002`,
`week3-Raj102002`, `buildphase-Raj102002`, and the personal repo, and deployed
at **[healwithaura.netlify.app/chat](https://healwithaura.netlify.app/chat)**.
The earlier "deploy not confirmed" gap is closed: direct HTTP checks against
the live site confirm `/`, `/chat`, `/journal`, and `/admin` all return 200,
and this cycle's new routes specifically (`/api/journal-agent`,
`/api/admin/metrics`) are present and responding — not just that *some*
version of the app is live, but that *this cycle's* code is. `npm run build`
also produces all 23 routes cleanly locally, and `tsc --noEmit`/`eslint .` are
both clean. See `docs/deployment.md` section 3.

**CI/CD:** still no automated CI pipeline running `tsc`/`eslint`/`npm audit`/
the eval scripts on push — `tsc --noEmit`, `eslint .`, and `npm run build`
were run by hand after every change this cycle (verified clean each time),
not automated. Named, scoped follow-up work, not done.

**Containerization: real and live-verified** — see the `Docker` branch of the
diagram above. Multi-stage `Dockerfile` targeting `output: "standalone"`,
`docker-compose.yml`, `.dockerignore`. This is explicitly the
portable/reproducibility path for grading review and local parity, not a
change to the production deployment target (Netlify remains that). **Gap
closed:** `docker build -t clearsignal:local .` ran clean (all 23 routes,
301MB final image), `docker run` booted it without any secrets supplied,
and live checks against the running container confirmed: non-root `nextjs`
user, `/`, `/chat`, `/journal`, `/admin` all HTTP 200, every security header
from `next.config.ts` present on the real response, `/api/providers`
(keyless) returning 200, and `/api/chat` (Groq-dependent) failing gracefully
with a structured JSON 500 rather than crashing when `GROQ_API_KEY` is
absent. See `docs/deployment.md` section 2. Not yet exercised: a run with a
real `.env.local` against live Groq/Back4App/Upstash, and the optional Redis
service commented out in `docker-compose.yml`.

---

## 8. Technology Stack — Rationale

| Choice | Why | Alternative considered |
|---|---|---|
| **Next.js (App Router) on Netlify** | Inherited from the original project baseline; App Router route handlers map cleanly onto Netlify functions, and `@netlify/plugin-nextjs` handles the wiring. | Vercel (native Next.js host) — not used because the project's existing Netlify deployment and domain were already established before this build-phase cycle started. |
| **Back4App (Parse Server / MongoDB)** | Already in place from the original baseline; gives ACL-enforced per-user data isolation out of the box (`new Parse.ACL(user)`), which is exactly the access-control shape this app needs, with zero custom auth code. | Supabase (Postgres + RLS) was evaluated per the assignment's suggested stack — it would give SQL joins and pgvector in one place, but migrating off Back4App mid-build-phase would touch every CRUD path (`lib/parse-client.ts`, `lib/journal-client.ts`) for no functional gain given ACLs already solve the actual requirement. Kept Back4App; see `plan.md` for the tradeoff written out in full. |
| **Upstash Vector** (not Supabase/pgvector) | Back4App/MongoDB has no vector search. Upstash's built-in embedding models mean the app sends raw text and Upstash embeds server-side — no separate embeddings API key, and no local embedding model bundled into the serverless function (the *previous* version of this app shipped a 22MB ONNX model in the function, which this replaces). Free tier comfortably covers the ~3,200-chunk corpus. | pgvector (would need a Postgres instance not otherwise used); an in-memory index (would need to re-embed on every cold start, or ship the ONNX model again). |
| **Groq (llama-3.3-70b-versatile)** | Already the project's LLM provider; fast inference, generous free tier for prototyping. Used for chat generation, query rewriting, reranking, and the handoff narrative. | Anthropic/OpenAI — not swapped in because Groq's speed matters for the streaming chat UX and the free tier suits build-phase iteration; the API routes are provider-agnostic enough to swap later if the free-tier limits (see `plan.md` cost section) become a blocker. |
| **BM25 in-memory (own implementation) + Upstash dense, fused with RRF** | Dense-only retrieval was the actual, measured failure mode of the previous version of this app (see `plan.md`'s technical feasibility notes) — exact terms and proper nouns (drug names, place names) get blurred by embeddings alone. BM25 catches what dense search misses, RRF combines both without needing to hand-tune a blend weight. | A hosted hybrid-search vector DB (e.g. Weaviate) would remove the need for a hand-rolled BM25 implementation, but was not adopted mid-cycle for the same reason Supabase wasn't: Upstash was already working, and swapping vector stores has no functional payoff without also swapping off Back4App-adjacent constraints. |
| **Web Crypto API (client-side AES-GCM)** | No server dependency, no key-management service needed for prototyping; matches the explicit design requirement that journal notes must never be readable server-side. | A managed secrets/KMS-backed encryption service — deferred; the honest limitation (key lives only in `localStorage`, no cross-device recovery) is documented rather than hidden, see `docs/privacy.md`. |
| **Parse User auth** (not a separate auth provider like Clerk/Auth0/Supabase Auth) | Comes bundled with Back4App; session tokens, password hashing, and `Parse.User.current()` session persistence are handled without extra integration work. | A dedicated auth provider would be redundant given Back4App already provides this, and would mean maintaining two identity systems for the ACL scoping to reference. |
| **zod** (input validation, new this cycle) | Schema-first validation with structured, field-level error messages (`formatZodError()`), applied at every route parsing untrusted JSON — matches the TypeScript types already in use rather than duplicating shapes by hand. | Hand-written `if` checks (what existed before) don't scale past a couple of fields without becoming their own source of bugs; a heavier framework (e.g. a full OpenAPI-generated validator) was unnecessary for route handlers this small. |
| **In-memory cache/rate-limit/token-budget** (not Redis, yet) | Zero new infrastructure to stand up mid-build-phase; correct within the "per warm instance" caveat documented throughout. | Upstash Redis is the deliberate, named next step — same vendor as the vector store already in use, so no new vendor relationship — not implemented because it needs Redis REST credentials this project doesn't have in this environment. Architected so the swap is additive (`lib/cache.ts`'s function signatures don't leak the in-memory implementation detail to callers). |
