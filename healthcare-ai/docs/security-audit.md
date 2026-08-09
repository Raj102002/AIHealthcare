# Security audit

This document is built incrementally as security decisions get made during the
build phase, not written once at the end. Section headers stay stable so code
comments can link to a specific section.

## CORS policy

No explicit CORS headers are set. This is deliberate, not an oversight: every
API route in this app is called from this app's own frontend, same-origin.
Browsers already block cross-origin JavaScript from reading a response unless
the server explicitly opts in via `Access-Control-Allow-Origin` — so the
*absence* of that header is the secure default, not a gap. Adding a permissive
`Access-Control-Allow-Origin: *` would *weaken* security by letting any other
website's JavaScript call these routes cross-origin (rate limits and input
validation still apply, but it removes a layer). If a future requirement needs
a specific external origin to call this API, add a narrow allowlist for that
one origin then — not a wildcard.

## Security headers

Set in `next.config.ts`'s `headers()`: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (microphone allowed for
self, camera denied — matches actual feature use), `Strict-Transport-Security`
(HSTS, 2-year max-age with preload), and a `Content-Security-Policy`.

The CSP is not maximally strict: `script-src` and `style-src` both need
`'unsafe-inline'`. Why, specifically:
- `script-src 'unsafe-inline'`: Next.js injects its own hydration bootstrap
  (`__NEXT_DATA__`) as an inline `<script>` tag on every page. Removing this
  requires per-request CSP nonces via Next.js middleware, which is real,
  scoped follow-up work — not done in this pass.
- `style-src 'unsafe-inline'`: `app/handoff/page.tsx` uses a literal
  `<style>{...}</style>` block for the print stylesheet. Same nonce-based fix
  would apply, or moving that stylesheet to a CSS module.

No `'unsafe-eval'` is present — removing that was straightforward and done.

HTTPS/SSL is provided by Netlify automatically for the deployed domain; no
in-app configuration exists or is needed for it.

## Prompt-injection defenses

Two layers — see `lib/generation.ts` (system prompt instructs the model to
treat RETRIEVED CONTEXT and user input as data, never as instructions that
override the system rules) and `lib/prompt-injection.ts` (pattern-based
detection, logged via `lib/logger.ts` when matched on `/api/chat`).

**Deliberately not blocking on match.** A health chat legitimately contains
phrasing that overlaps with injection patterns — "ignore my last symptom, I
meant something else," "disregard what I said about the rash" — and
hard-rejecting those would be a real, harmful false-positive rate in exactly
the population this app serves. The pattern match is observability (so a
spike in matches is visible in logs), not a filter.

**Not tested against adversarial prompts in this pass.** Real red-teaming
(the spec's own section 7 calls for 50+ adversarial prompts attempting to
extract a diagnosis, including injection-flavored ones) has not been run
against this specific defense. That's real, unfinished work, not something to
claim as validated.

## Input validation

`lib/validation.ts` — zod schemas on every route that parses a JSON body from
an untrusted client (`/api/chat`, `/api/test-context`, `/api/exposure`,
`/api/handoff-narrative`, `/api/speak`). Verified working against real
malformed requests (oversized numeric fields, missing required fields, empty
strings) during this build-phase pass — see the commit history for the actual
curl output.

## Rate limiting

Every route that calls Groq or an external API is rate-limited (in-memory,
per-IP, sliding window — `lib/rate-limit.ts`). `/api/chat` and `/api/exposure`
were the two gaps found and closed during this pass — every other route
already had it from the prior build-phase cycle. The documented limitation
(per-warm-instance only, doesn't coordinate across concurrent Netlify function
instances) still applies; a production deployment under real load would want
this backed by Upstash Redis instead.

## Secrets

`.env.local` is gitignored; `.env.local.example` documents the shape without
values. A grep across the codebase for hardcoded API keys, tokens, or
passwords found none — see the "Findings" section below for the actual command
run and its output. No secrets manager is integrated (Netlify's environment
variable UI is the current mechanism); no rotation schedule exists.

**`BACK4APP_MASTER_KEY`** is the one credential this project's tooling
(`scripts/setup-indexes.ts`) references but does not store anywhere — it must
be passed as an ephemeral env var for that one script invocation, never
written to `.env.local`. Documented in `docs/database-optimization.md`.

## Dependency / hardcoded-credential scan — findings

### npm audit

Initial state: **11 vulnerabilities (4 moderate, 7 high)**. `next` was pinned
at an exact version (`16.2.9`, no `^`), so `npm audit fix` alone couldn't
touch it. Actions taken:

1. `npm audit fix` (non-breaking) — resolved 4 issues, down to 7.
2. Bumped `next` and `eslint-config-next` to `16.3.0` (same major version,
   deliberately chosen — not a blind `--force`) — this pulled in patched
   `postcss` and `sharp` transitively and fixed the Next.js-specific
   advisories (middleware/proxy bypass, several SSRF and DoS issues, cache
   confusion, unauthenticated Server Function endpoint disclosure). Verified
   afterward: `tsc --noEmit`, `eslint .`, and `npm run build` all still pass
   clean with all 20 routes present.

**Remaining: 4 vulnerabilities (3 moderate, 1 high)**, all transitive from the
`parse` SDK (currently `^5.3.0`) — `uuid`, `ws`, and `@babel/runtime-corejs3`.
Fixing these requires `parse@8.6.0`, three major versions up. **Deliberately
not force-upgraded in this pass**: this SDK is the entire auth/data layer
(`lib/parse-client.ts`, `lib/journal-client.ts`, every journal CRUD path,
`lib/metrics.ts`'s server-side Parse usage), and a 3-major-version jump
without dedicated regression testing of login/CRUD/ACL behavior is a real risk
of silently breaking auth — worse than the vulnerability it would fix.

Assessed practical exploitability of what's left: `ws` and `uuid` are used
internally by the Parse JS SDK for **LiveQuery** (real-time subscriptions).
This app never calls `Parse.LiveQuery` anywhere — every data access is a
plain `Parse.Query`/`Parse.Object` REST call. The vulnerable code is present
in `node_modules` but not on any path this app actually executes. Real risk
today: low. Still real, unresolved technical debt: yes — the `parse` major
upgrade is a named, scoped follow-up task (see `plan.md`), not something to
leave open indefinitely.

### Hardcoded credentials

```bash
grep -rnE "sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|gsk_[a-zA-Z0-9]{20,}" (app source, excluding node_modules)
grep -rniE "(password|secret|api_key|apikey)\s*[:=]\s*[\"'][a-zA-Z0-9_-]{10,}[\"']" (app source)
git ls-files | grep -i "\.env"
```

**No matches** for either pattern scan. `git ls-files | grep -i "\.env"`
returns only `.env.local.example` — the real `.env.local` has never been
committed.

## What this audit does not cover

- No penetration testing or fuzzing was performed.
- No authenticated-flow-specific authorization testing beyond the ACL review
  already documented in `docs/privacy.md`.
- No load testing — the rate limits and performance numbers in
  `app/api/admin/metrics` reflect whatever traffic this app has actually seen
  during development, not a simulated production load.
