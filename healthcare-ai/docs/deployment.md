# Deployment

Two real, working paths exist for running this app. Both are documented here
because both are exercised: Netlify is the actual production deployment
target; Docker is the reproducible/portable path used for grading review and
local parity testing (built and run locally against this pass — see
"Verified" below).

## 1. Local development

```bash
npm install
cp .env.local.example .env.local   # fill in real values, see below
npm run dev
```

Requires three real credentials before anything works end-to-end:

| Variable | Source | Used by |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com | generation, rerank, query rewrite, STT, TTS, journal agent |
| `NEXT_PUBLIC_BACK4APP_APP_ID` / `NEXT_PUBLIC_BACK4APP_JS_KEY` | Back4App dashboard → Security & Keys | auth, journal storage |
| `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` | console.upstash.com/vector, index created **with a built-in embedding model attached** | dense retrieval |

Two more are optional and documented in `.env.local.example`:
`DAILY_TOKEN_BUDGET` (cost-tracking threshold, defaults to 90000) and
`BACK4APP_MASTER_KEY` (never stored — only exported ephemerally for the one
`npm run setup-indexes` invocation, see `docs/database-optimization.md`).

Before the app has anything to retrieve, run the ingestion pipeline once:

```bash
npm run ingest
```

## 2. Docker (reproducible / portable path)

```bash
docker build -t healthcare-ai .
docker run -p 3000:3000 --env-file .env.local healthcare-ai
# or:
docker compose up --build
```

**Verified this pass**: `docker build` was not run in this sandbox — no
`docker` binary is available here — so the image has not actually been built
or booted. What *is* verified: the app builds successfully with
`output: "standalone"` (`next.config.ts`) and `.next/standalone/server.js`
lands at the correct top-level path (confirmed by inspecting the build output
directory directly), which is the specific failure mode the Dockerfile's
`COPY --from=builder .../standalone ./` step depends on not happening. The
Dockerfile's `COPY ... /app/data` and `/app/corpus` steps mirror the same
`outputFileTracingIncludes` paths already confirmed present in the traced
output. This is "the pieces the image depends on are individually verified,"
not "the image was built and ran" — an honest gap, not a claimed pass.

The commented-out `redis` service in `docker-compose.yml` is the local-dev
half of the caching upgrade path described below — uncomment it and set
`REDIS_URL` once `lib/cache.ts` is migrated off in-memory storage.

## 3. Netlify (production deployment target)

This is where the app is actually deployed
(`week2-Raj102002`/`buildphase-Raj102002` branches, pushed to GitHub, built by
Netlify on push). The `netlify.toml` that drives this lives one directory
**above** `healthcare-ai/` — at the repository root, not inside this package —
because both hosting repos check this app in as a subdirectory (`base =
"healthcare-ai"`) alongside `plan.md`/`design.md`. Its contents:

```toml
[build]
  base    = "healthcare-ai"
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"
  SECRETS_SCAN_OMIT_KEYS = "NEXT_PUBLIC_BACK4APP_APP_ID,NEXT_PUBLIC_BACK4APP_JS_KEY"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

`SECRETS_SCAN_OMIT_KEYS` exists because `NEXT_PUBLIC_*` vars are meant to be
inlined into the client bundle by Next.js — that's by design, not a leak, so
Netlify's secret scanner is told to skip those two specifically rather than
disabling the scanner entirely.

**Required setup in the Netlify UI** (not committed anywhere, by design —
these are secrets):
1. Site settings → Environment variables → add the same three required
   variables from the table above, plus the two optional ones if used.
2. Build command and publish directory are left on Netlify's Next.js
   auto-detection defaults.

**What's genuinely unverified about this path**: I did not have Netlify CLI
access or credentials in this session to trigger a fresh deploy and confirm
it goes green. The prior, already-deployed state of this app (from before
this build-phase pass) is real and has been running; the *new* routes and
code added in this pass (`/api/journal-agent`, `/admin`, `withMetrics`
wrapping, the new headers, the `next`/`eslint-config-next` version bump) have
been typechecked, linted, and built locally (`npm run build` passes clean,
23 routes generated) but not confirmed against an actual Netlify build
environment, which can behave differently from local (different Node
version, different filesystem case-sensitivity, cold-start timing). That gap
is real and worth closing before treating this as "shipped," not something to
paper over.

## 4. One-time database setup

```bash
BACK4APP_MASTER_KEY=your_master_key npm run setup-indexes
```

Creates the Parse Server indexes documented in `docs/database-optimization.md`.
Idempotent — safe to re-run. Not run in this sandbox (no real Back4App master
key available here); the script itself was typechecked and its logic
reviewed, not executed end-to-end against a live Back4App app.

## 5. Evaluation harness

```bash
npm run eval      # RAG retrieval/generation quality (original HealthAI corpus)
npm run eval:cs   # ClearSignal-specific safety/refusal matrix
```

Both were actually run during this project's build (see commit history for
real pass-rate numbers, e.g. the red-flag recall fix and the rerank-model
swap that were both caught this way) — not just written and left unexecuted.

## 6. Observability

`/admin` (guarded by the same Back4App auth as the rest of the app) renders
request-count, latency (p50/p95), error-rate, and token-usage panels sourced
from real `RequestLog` writes made by `withMetrics()` — see
`docs/database-optimization.md` for the schema and `lib/metrics.ts` for the
aggregation. This was exercised live against the dev server this pass (real
Back4App writes, real p50/p95 computed from them), not just built and
assumed correct.

## 7. Known gaps in this deployment story — stated plainly

- **No health-check endpoint.** There is no `/api/health` or `/healthz`
  route. Docker's implicit "container is up" and Netlify's own function
  health checks are the only signals today. Adding a cheap route that checks
  Groq/Back4App/Upstash reachability would be the natural next step, not
  build here.
- **No CI pipeline.** `tsc --noEmit`, `eslint`, and `next build` were run
  manually, by hand, throughout this pass — there is no committed GitHub
  Actions workflow that runs them automatically on push/PR. Real, scoped,
  not-yet-done work.
- **No automated rollback.** Netlify keeps prior deploys and supports manual
  rollback from its UI/CLI; nothing app-specific (migrations, feature flags)
  exists on top of that.
- **Redis-backed rate limiting/caching is a named follow-up, not done.**
  `lib/rate-limit.ts`, `lib/cache.ts`, and the token-budget tracker in
  `lib/metrics.ts` are all explicitly documented as per-warm-instance,
  in-memory only. The correct production fix (Upstash Redis — already the
  vector-store vendor, so no new relationship) needs a Redis REST URL/token
  this project doesn't have credentials for in this session.
- **Sentry / external error tracking was never wired up** — same reason
  (no DSN available). `lib/logger.ts`'s structured JSON logging plus the
  Back4App-backed `RequestLog` metrics are the real, working substitute
  actually in place, not a stand-in claimed to be equivalent.
