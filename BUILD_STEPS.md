# BUILD_STEPS.md — HealthAI Assistant

Incremental build steps following the PolyVote pattern.
Each step ends with a **Verify** checkpoint before moving on.

---

## Step 1 — Project scaffold

- `npx create-next-app@latest healthcare-ai --typescript --tailwind --app`
- Delete boilerplate content from `app/page.tsx` and `app/globals.css`
- Add `.env.local.example` with placeholder keys
- Add `.env.local` to `.gitignore`

**Verify:** `npm run dev` starts on localhost:3000 with a blank page and no errors.

**Commit:** `chore: initialize Next.js project with Tailwind and TypeScript`

---

## Step 2 — Data types and Back4App client

- Define TypeScript interfaces in `types/health.ts` (Message, HealthLog, UserProfile, Conversation)
- Install Parse SDK: `npm install parse`
- Create `lib/parse-client.ts` with:
  - `initializeParse()` — reads env vars, initializes once
  - `loginUser`, `registerUser`, `logoutUser`, `getCurrentUser`
  - `getUserProfile`, `updateUserProfile`
  - `saveHealthLog`, `getHealthLogs`, `deleteHealthLog`
  - `saveConversation`, `getConversations`, `deleteConversation`
- Create Back4App app, copy App ID and JS Key into `.env.local`

**Verify:** Open browser console, call `initializeParse()` manually — no errors.

**Commit:** `feat: define health data types and Back4App Parse client`

---

## Step 3 — Authentication page

- Build `app/page.tsx` (login/register toggle form)
- Redirect to `/chat` on success; redirect to `/` if no session on protected pages
- Add `app/layout.tsx` with metadata and global styles

**Verify:** Register a new account → appears in Back4App dashboard under User class.
Log in → redirected to `/chat`. Reload → still on `/chat`.

**Commit:** `feat: add user authentication with login and registration`

---

## Step 4 — AI chat interface

- Install Groq SDK: `npm install groq-sdk`
- Create `app/api/chat/route.ts` — POST handler, builds system prompt with user profile,
  streams Groq response
- Create `lib/emergency-detector.ts` — keyword list for chest pain, stroke signs, etc.
- Create `components/ChatMessage.tsx` — renders user/assistant bubbles
- Create `components/EmergencyBanner.tsx` — emergency hotline overlay
- Build `app/chat/page.tsx` — message list, input, streaming fetch, save-to-Back4App button

**Verify:** Send "I have chest pain" → emergency banner appears.
Send a normal question → streamed response renders word-by-word.
Save conversation → record appears in Back4App Conversation class.

**Commit:** `feat: implement AI chat interface with streaming and emergency detection`

---

## Step 5 — Health dashboard

- Create `components/HealthLogForm.tsx` — collapsible form for symptoms + vitals
- Create `components/UserProfilePanel.tsx` — edit allergies/conditions/medications
- Build `app/dashboard/page.tsx`:
  - Stats grid (log count, conversation count, severe count, conditions)
  - Health profile summary chips
  - Tabbed view: Health Logs | Chat History
  - Delete buttons on each row (calls `deleteHealthLog` / `deleteConversation`)

**Verify:** Log a symptom → appears immediately in the logs tab.
Delete a log → disappears from list and from Back4App dashboard.
Edit profile → allergies appear in profile summary.

**Commit:** `feat: add health dashboard with logs, vitals, and conversation history`

---

## Step 6 — Documentation

- Write `PLAN.md` (concept, data model, architecture, design decisions)
- Write `BUILD_STEPS.md` (this file)
- Update top-level `README.md` with ERD, correct AI provider, deployment notes

**Commit:** `docs: add PLAN.md, BUILD_STEPS.md, and update README`

---

## Step 7 — CI/CD and deployment

- Create `.github/workflows/ci.yml` — lint + build on push to `main`
- Create `healthcare-ai/netlify.toml` — build config for Netlify
- Deploy to Netlify: connect GitHub repo, set env vars in Netlify UI
- Smoke-test live URL

**Verify:** Push to `main` → GitHub Actions passes. Netlify deploy succeeds.
Visit live URL → login, log a symptom, chat works.

**Commit:** `chore: add Netlify deployment config and GitHub Actions CI`
