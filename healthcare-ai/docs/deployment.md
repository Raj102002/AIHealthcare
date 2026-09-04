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

**Verified live this pass**: `docker build -t clearsignal:local .` was run
against the real Dockerfile — clean build, all 23 routes generated, final
image 301MB. The image was then booted with `docker run` (no `.env.local`
supplied, matching a from-scratch grading clone) and checked directly against
the running container:

- Container reached ready state (`✓ Ready in 0ms`) and stayed up.
- Runs as the non-root `nextjs` user (`docker exec clearsignal-test whoami`
  → `nextjs`), matching the Dockerfile's `USER nextjs` line.
- `/`, `/chat`, `/journal`, `/admin` all returned HTTP 200.
- The full security-header set from `next.config.ts`'s `headers()` (CSP,
  HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`) was present on the live response,
  not just configured in source.
- `/api/providers` (no API key required) returned 200.
- `/api/chat` (Groq-dependent) failed *gracefully* — a structured JSON 500
  naming the missing `GROQ_API_KEY` — rather than crashing the process, when
  no secrets were supplied. Correct behavior for a secret-less container run.

**Still not exercised**: a run with a real `.env.local` against live
Groq/Back4App/Upstash (full functional smoke test, not just boot-and-route
checks), and the commented-out `redis` service below.

The commented-out `redis` service in `docker-compose.yml` is the local-dev
half of the caching upgrade path described below — uncomment it and set
`REDIS_URL` once `lib/cache.ts` is migrated off in-memory storage.

## 3. Netlify (production deployment target)

This is where the app is actually deployed:
**[healwithaura.netlify.app/chat](https://healwithaura.netlify.app/chat)**
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

**Confirmed live**: direct HTTP checks against
`https://healwithaura.netlify.app` confirm `/`, `/chat`, `/journal`, and
`/admin` all return 200, and this pass's *new* routes specifically
(`/api/journal-agent` — 405 on GET, i.e. present and routed, not 404;
`/api/admin/metrics` — 200) are live on the deployed site, not just built
locally. This closes the earlier gap where the new-routes deploy hadn't been
confirmed against an actual Netlify build environment. `npm run build` also
passes clean locally (23 routes, `tsc --noEmit`/`eslint .` clean).

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

## 7. Vestibular screening (`/vestibular-screening`) — Python dependency, Netlify-incompatible

`app/api/vestibular-screening/route.ts` shells out to `vestibular-ai/run_screening.py`
(the vendored [vestibular-ai](../vestibular-ai/README.md) pupil-detection/
nystagmus-characterization/disorder-screening pipeline — PyTorch, OpenCV,
MediaPipe) rather than calling an HTTP model API like every other analysis
route in this app. That only works where a Python interpreter with
`vestibular-ai/requirements.txt` installed is reachable on the same machine
running `node`:

```bash
cd vestibular-ai
pip install -r requirements.txt
cd ..
npm run dev
# optional: set VESTIBULAR_PYTHON if `python3`/`python` isn't the right binary
```

- **Local dev**: works once the step above is done.
- **Docker**: the `node:20-alpine` runtime image has no Python at all — the
  route will 501 in a container built from the current `Dockerfile` until a
  Python+CV stage is added to it (real follow-up work, not done here — these
  are heavy, slow-to-build dependencies (`torch`, `opencv-contrib-python`,
  `mediapipe`) that don't belong in the default image without a deliberate
  decision to accept the size/build-time cost).
- **Netlify (production)**: no Python runtime exists in a Netlify Function at
  all. The route detects this (an `ENOENT` trying every candidate in
  `VESTIBULAR_PYTHON`/`python3`/`python`) and returns a 501 with an
  explanatory message instead of crashing — the same graceful-degradation
  pattern `/api/rash-analysis` uses when `GROQ_VISION_MODEL` is unset. In
  other words: this feature is real and runnable, but not yet reachable on
  the deployed `healwithaura.netlify.app` site.

## 8. Known gaps in this deployment story — stated plainly

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
