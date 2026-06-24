# HealthAI Assistant — Week 2

An AI-powered healthcare assistant built with Next.js, Back4App (Parse Server), and Groq
(llama-3.3-70b-versatile). Users can register, log symptoms, track vitals, and chat with
an AI that incorporates their personal health profile.

---

## Project Overview

HealthAI solves the problem of people getting alarmist or vague results when Googling
symptoms. It provides a conversational, context-aware experience that:

- Incorporates the user's health profile (allergies, conditions, medications) into every AI response
- Detects genuine emergencies (chest pain, stroke signs, suicidal ideation) and immediately
  surfaces emergency hotline numbers
- Lets users log and review symptoms/vitals over time
- Stores all data privately per-user with Parse ACLs

---

## Architecture

```
Browser (Next.js 16 / React 19 / Tailwind CSS 4)
  │
  ├── app/page.tsx          — login / register
  ├── app/chat/page.tsx     — AI chat interface
  ├── app/dashboard/page.tsx — health logs + conversation history
  │
  ├── lib/parse-client.ts   — all Back4App CRUD + auth calls
  └── app/api/chat/route.ts — server-side Groq API proxy (keeps API key secret)
                                     │
                              Back4App (Parse Server)          Groq API
                              User, HealthLog, Conversation    llama-3.3-70b
```

---

## Data Model / Schema

### Entity-Relationship Diagram

```
┌─────────────────────────────┐
│           User              │
├─────────────────────────────┤
│ objectId      String (PK)   │
│ username      String        │
│ email         String        │
│ password      String (hash) │
│ allergies     String[]      │
│ conditions    String[]      │
│ medications   String[]      │
│ bloodType     String?       │
│ age           Number?       │
└──────────┬──────────────────┘
           │ 1
           │
     ┌─────┴─────┐
     │           │
     │ *         │ *
┌────┴────────┐  ┌───────────────────┐
│  HealthLog  │  │   Conversation    │
├─────────────┤  ├───────────────────┤
│ objectId    │  │ objectId          │
│ symptoms    │  │ title             │
│ severity    │  │ messages  JSON[]  │
│ notes       │  │ lastMessage       │
│ vitals JSON │  │ userId  →User(FK) │
│ userId →User│  │ ACL (owner-only)  │
│ ACL         │  └───────────────────┘
└─────────────┘

vitals JSON shape:
{ heartRate?: number, bloodPressure?: string,
  temperature?: number, oxygenSaturation?: number }
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Back4App (Parse) as BaaS | Avoids running a custom server; handles auth, schema, ACLs |
| ACL per object | Each HealthLog/Conversation gets `new Parse.ACL(user)` — DB enforces privacy |
| Groq for AI | Fast free-tier streaming; API key stays server-side in Next.js API route |
| Client-side emergency detection | Keyword scan fires before LLM response — banner appears instantly |
| Next.js App Router | Supports streaming responses natively via `ReadableStream` |

---

## Installation & Setup

### Prerequisites

- Node.js 20+
- A [Back4App](https://back4app.com) account with a new app created
- A [Groq](https://console.groq.com) account (free tier works)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd week2-Raj102002/healthcare-ai
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

| Variable | Where to get it |
|----------|----------------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `NEXT_PUBLIC_BACK4APP_APP_ID` | Back4App Dashboard → App Settings → Security & Keys |
| `NEXT_PUBLIC_BACK4APP_JS_KEY` | Same location |

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage Guide

1. **Register** — enter a username, email, and password on the home page
2. **Chat** — describe symptoms; the AI asks follow-up questions and gives wellness info
3. **Emergency detection** — type "chest pain" or similar → red banner with 911 / hotlines
4. **Save conversation** — click "Save Chat" to persist the session to Back4App
5. **Log symptoms** — on the dashboard, expand "Log Symptom / Vital", fill in the form
6. **Update profile** — add allergies, conditions, medications; AI uses these in every reply
7. **Delete records** — trash icon on each log or conversation row removes it permanently
8. **Dashboard** — view stats, all health logs, and saved conversations

---

## Deployment

The app is deployed on **Netlify** using `@netlify/plugin-nextjs`.

### Steps to deploy

1. Push this repository to GitHub
2. In Netlify: New site → Import from GitHub → select this repo
3. Set build settings (auto-detected via `netlify.toml`):
   - Base directory: `healthcare-ai`
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Add environment variables in Netlify UI (Site settings → Environment variables):
   - `GROQ_API_KEY`
   - `NEXT_PUBLIC_BACK4APP_APP_ID`
   - `NEXT_PUBLIC_BACK4APP_JS_KEY`
5. Deploy — subsequent pushes to `main` trigger automatic re-deploys

### CI/CD

GitHub Actions runs lint + build on every push and pull request to `main`
(see `.github/workflows/ci.yml`). Secrets must be added in GitHub repository settings.

---

## Disclaimer

This application provides **general health information only** and is not a substitute for
professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare
provider for medical concerns.
