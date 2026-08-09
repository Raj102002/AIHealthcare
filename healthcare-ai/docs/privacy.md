# Data handling

Short version: journal content is encrypted before it leaves your browser, every
record is scoped to your account only, and everything you can create you can
delete. The sections below are the specifics, including the real limitations —
not just the parts that sound good.

## What is collected

| Data | Where | Notes |
|---|---|---|
| Account (username, email) | Back4App (Parse Server / MongoDB) | Required for login. |
| Health profile (allergies, conditions, medications, age, blood type, preferred language) | Back4App | Used to personalize chat responses. |
| Chat messages (`Conversation`) | Back4App | Plaintext. Not currently encrypted client-side — see "What is NOT yet encrypted" below. |
| Health logs (`HealthLog`) | Back4App | Plaintext, same caveat. |
| Symptom journal (`SymptomEntry`) | Back4App | `notes` field is encrypted client-side (AES-GCM); other fields (symptom label, severity, dates) are plaintext, since they're needed for the deterministic handoff-document analysis and aren't free-text narrative. |
| Function check-ins, timeline anchors, clinical encounters | Back4App | Plaintext structured data (domain/value/dates/specialty), no free-text narrative field to encrypt. |
| Rash photos (`RashPhoto`) | Back4App file storage | See file-URL caveat below. |
| Voice recordings | Never stored | Transcribed by Groq (`whisper-large-v3-turbo`) and immediately discarded — only the resulting text is saved, as part of the message it produced. |
| RAG corpus (Lyme disease CDC content) | Upstash Vector | Contains no patient data whatsoever — this is reference material, embedded once at ingestion time. |

## What is NOT yet encrypted

Only `SymptomEntry.notes` is client-side encrypted right now. Chat messages
and health log notes are stored as plaintext in Back4App. This is a real gap,
not an oversight to gloss over — if this ships for real patient use, those
should get the same treatment `SymptomEntry.notes` already has.

## How long data is retained

No automatic expiry is implemented. Data is retained until the user deletes
it. This is a gap against the spec's "explicit retention policy" requirement —
what exists today is deletion on request (see below), not a retention *policy*
with an expiry timeline. That's a real TODO, not a design decision.

## Who can access it

Every `Parse.Object` created by this app (`HealthLog`, `Conversation`,
`SymptomEntry`, `FunctionEntry`, `TimelineAnchor`, `ClinicalEncounter`,
`RashPhoto`) is saved with `new Parse.ACL(user)`, which restricts both read and
write to that one authenticated user — not just other users, but the
*public* and any other authenticated account too. This is verified by reading
`lib/journal-client.ts` and `lib/parse-client.ts`: every save path sets the
ACL before the object is ever persisted.

Two honest limitations:

1. **The Back4App Master Key bypasses ACLs entirely**, as it does for any
   Parse Server app. Whoever holds the app's master key (the app owner/admin)
   can read everything, same as any database administrator can read any
   database. ACLs protect users from each other, not from the operator.
2. **`RashPhoto.image` is a Parse File, not an ACL-protected Object.** The
   `SymptomEntry`/`RashPhoto` *record* is ACL-protected (only the owner can
   query for it), but the underlying file's URL, once known, is generally
   fetchable without re-checking that ACL — this is standard Parse/Back4App
   file-storage behavior, not something this app's code controls. The file
   name is a random, unguessable id, which is obscurity, not access control.
   Don't treat rash photo URLs as equivalent in protection to the journal
   entries referencing them.

## How to delete

Every journal class has a matching delete function in `lib/journal-client.ts`,
wired to a delete button on every list item in `/journal`:
`deleteSymptomEntry`, `deleteFunctionEntry`, `deleteTimelineAnchor`,
`deleteClinicalEncounter`, `deleteRashPhoto` — plus the pre-existing
`deleteHealthLog` and `deleteConversation`. There is currently no single
"delete my account and everything in it" action; a user has to delete entries
individually. A cascading account-deletion flow is a reasonable next step, not
yet built.

## The encryption-vs-retrieval tension

Client-side encryption means the **server cannot read `SymptomEntry.notes`**
to build a search/retrieval query against it — there's nothing for the server
to search. The resolution, if a future feature needs to search or reference
journal content (e.g. "ask the chat about patterns in my journal," which does
not exist in this build): **the query must be constructed client-side, from
the plaintext, before anything is encrypted or sent**, and only that derived
query — not the raw note text — gets sent to the backend. The backend then
retrieves against the RAG corpus (which contains no patient data) using that
derived query, same as it does today for a typed chat message.

As of this build, no feature sends journal note content into any retrieval or
generation call — `/api/chat`, `/api/exposure`, `/api/test-context`, and the
handoff narrative all operate on either the user's typed chat message or the
deterministic journal *statistics* (`lib/handoff-analysis.ts`'s output —
counts, dates, severities), never on decrypted note text. So this tension
doesn't currently manifest; it's documented here as the constraint any future
journal-search feature has to design around, not as a problem being solved
today.

## Voice mode disclosure

Voice mode shows a one-time disclosure (`components/VoiceDisclosure.tsx`) that
recordings are sent to Groq for transcription before any audio is captured.
