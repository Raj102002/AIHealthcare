# Database optimization

## Indexes

Every list query against the journal classes follows the same shape (see
`lib/journal-client.ts`):

```ts
query.equalTo("userId", user);
query.descending("occurredAt");
query.limit(500); // or 200 for ClinicalEncounter
```

A compound index on `(userId, occurredAt)` matches this exactly — filter field
first, sort field second, matching MongoDB's index-usage rules for a
find+sort query. `scripts/setup-indexes.ts` adds this index to all five
journal classes (`SymptomEntry`, `FunctionEntry`, `TimelineAnchor`,
`ClinicalEncounter`, `RashPhoto`) using Parse's Schema API.

**This script has not been run against the live database.** It requires the
Back4App master key, which bypasses every ACL in the app — not something to
pass around or have an AI agent execute automatically. Run it yourself:

```bash
BACK4APP_MASTER_KEY=<from Back4App dashboard> npm run setup-indexes
```

The master key is deliberately not part of `.env.local.example` or anything
the deployed app reads at runtime — it's a one-time, developer-run operation.

Without this index, MongoDB falls back to a collection scan filtered by
`userId` then sorted in memory — functionally correct today (query result
sets are small: a few hundred entries per user at most, `RequestLog` similarly
bounded by the 1000-row query in `/api/admin/metrics`), but this is exactly
the kind of thing that degrades silently as data grows, which is why it's
worth doing before it's a measured problem rather than after.

## Connection pooling & backups

Both are managed by Back4App at the platform level (managed MongoDB) — there
is no application-level configuration for either. If Back4App's managed
backup schedule/retention isn't sufficient for a real deployment, that's a
Back4App plan/tier decision, not a code change.

## Slow-query review

Current query patterns reviewed for this pass:

- All journal `get*Entries()` functions: `equalTo` + `descending` + `limit` —
  addressed by the index above.
- `RequestLog` queries (`/api/admin/metrics`): `descending("createdAt")` +
  `limit(1000)` — `createdAt` is auto-indexed by Parse Server by default, so
  no additional index needed here.
- No query in this codebase does a full unindexed scan across all users' data
  (every query is scoped to the current user via `equalTo("userId", user)`,
  or in `RequestLog`'s case, is small enough that the default index suffices).

No `select()` field-limiting was added — every query already returns a small
number of scalar/short-string fields per object (no large blobs are queried
this way; `RashPhoto.image` is a `Parse.File` reference, not inline binary
data, so fetching the list doesn't pull image bytes).
