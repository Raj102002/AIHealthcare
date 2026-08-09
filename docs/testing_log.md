# Postman Testing Log — HealthAI Assistant

Tracks the API testing work done for the Week 3 assignment's Testing requirement
(test API/data-access operations, document endpoints, verify error/edge cases).
Companion to [`test_cases.md`](test_cases.md) (planned test cases) and
[`postman_collection.json`](postman_collection.json) (the importable collection).

---

## Setup

1. Installed Postman.
2. Imported `docs/postman_collection.json`.
3. Set collection **Variables** (Current Value column, not just Initial Value):
   - `base_url` = `http://localhost:3000`
   - `app_id` = Back4App App ID (from `healthcare-ai/.env.local`)
   - `js_key` = Back4App JavaScript Key (from `healthcare-ai/.env.local`)
   - `parse_url` = `https://parseapi.back4app.com` (default, unchanged)
4. Ran `npm run dev` in `healthcare-ai/` so the local AI routes (`/api/chat`,
   `/api/health-insights`) have a server to hit.

---

## Issue #1 — Every request returned 404

**Symptom:** All 14–15 requests in the collection returned `404` on the first
full collection run.

**Root cause:** The collection's `app_id`, `js_key`, and `base_url` variables
only had **Initial Value** set (from the import), not **Current Value** —
Postman sends Current Value at runtime, so requests went out with unresolved
or empty credentials. Back4App's Parse Server responds `404` (not a clearer
401/403) when the App ID isn't recognized.

**Fix:** Filled in the Current Value column for all four variables and saved
the collection.

**Result after fix:**
| Group | Status |
|---|---|
| AI Chat (valid input) | `200` ✅ |
| AI Chat — Emergency | `200` ✅ |
| AI Chat — Empty Messages (Error) | `400` ✅ (expected — testing bad-input handling) |
| AI Health Insights (valid input) | `200` ✅ |
| AI Health Insights — Empty Logs | `200` ✅ |
| AI Health Insights — Missing Logs (Error) | `400` ✅ (expected) |
| Register / Login / Logout | passing |
| Create / Get / Delete Health Log | passing |
| Save Conversation | passing |

---

## Issue #2 — `Get Conversations` and `Delete Conversation` still 404 (open)

**Symptom:** After fixing Issue #1, everything passes except these two requests.
Response body has no Parse-style `code` field:
```json
{ "message": "Not Found", "error": {} }
```

**Confirmed cause (from the collection file):** `Delete Conversation`'s URL
still contains the literal placeholder text `REPLACE_WITH_OBJECT_ID` instead
of a real `objectId` copied from a prior response:
```
{{parse_url}}/1/classes/Conversation/REPLACE_WITH_OBJECT_ID
```
This needs to be manually replaced with an actual object ID (e.g. from the
`Save Conversation` or `Get Conversations` response) before running.
`Delete Health Log` has the identical placeholder pattern and should be
double-checked too.

**Still unexplained:** `Get Conversations` has no object-ID placeholder and is
structurally identical to `Get Health Logs` (which passes), same headers,
same variable usage. Suspected causes, not yet confirmed:
- The `Conversation` class may not actually exist on Back4App yet if
  `Save Conversation` didn't really create a record.
- Something request-specific may differ in the live Postman app vs. the
  saved collection file.

**Next step:** Check what `Save Conversation` actually returned in that run
(did it return `201` with an `objectId`?), then inspect `Get Conversations`'
Headers/Request tabs in Postman to see the fully resolved URL and headers
that were sent.

---

## Status summary

- [x] Postman installed and collection imported
- [x] Collection variables populated with real Back4App credentials
- [x] Local dev server running for AI routes
- [x] AI Chat + AI Health Insights endpoints verified (success + error cases)
- [x] Auth, Health Log endpoints verified
- [x] Save Conversation verified
- [ ] Get Conversations — failing, root cause not yet confirmed
- [ ] Delete Conversation — failing, needs real objectId in place of placeholder
- [ ] Delete Health Log — re-verify placeholder was actually replaced with a real ID
