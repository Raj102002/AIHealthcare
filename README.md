# HealthAI Assistant

**Name:** Rajamanendra Surisetty
**Z-Number:** Z23879546
**FAU Email:** rsurisetty2025@fau.edu

**Live App:** [https://alhealthcare.netlify.app/chat](https://alhealthcare.netlify.app/chat)
**Demo Video:** [https://youtu.be/WCrvW_IBQvQ](https://youtu.be/WCrvW_IBQvQ)

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

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript |
| Backend / Database | Back4App (Parse Server) — auth, data storage, ACL-based access control |
| AI | Groq API (`llama-3.3-70b-versatile`), streamed via Next.js API routes |
| Deployment | Netlify (`@netlify/plugin-nextjs`) |
| CI/CD | GitHub Actions (lint + build on push/PR) |

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
**Live URL:** [https://alhealthcare.netlify.app](https://alhealthcare.netlify.app)

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

## AI Features

### Feature 1 — Conversational Symptom Checker (chat)
- **Route:** `POST /api/chat`
- **Model:** Groq `llama-3.3-70b-versatile`
- **What it does:** Streaming AI chat that takes the user's full health profile (allergies,
  conditions, medications, age, blood type) as context and provides general wellness guidance.
  The system prompt instructs the model to ask follow-up questions before giving advice and
  to always recommend consulting a doctor.
- **Emergency detection:** Client-side regex scan fires before the AI response — if a
  red-flag keyword (chest pain, stroke, suicidal ideation, etc.) is detected, an emergency
  banner with 911 / 988 / Poison Control numbers appears immediately.

### Feature 2 — AI Health Log Analysis (insights)
- **Route:** `POST /api/health-insights`
- **Model:** Groq `llama-3.3-70b-versatile`
- **What it does:** Analyzes the user's stored health logs (up to 20) and generates a
  structured wellness report covering: symptom patterns, notable observations, wellness
  recommendations, and flags for when to seek care. Accessible from the dashboard via the
  "Analyze My Logs" button.

### Error Handling
- `400` returned for missing/invalid request bodies
- `429` detected and surfaced as a user-friendly "Rate limit reached" message
- `500` with plain error message for unexpected failures
- Loading spinners shown during all AI operations
- Stream abort on component unmount prevents memory leaks

---

## Design & Planning Documentation

- Wireframes: [`docs/wireframes.md`](docs/wireframes.md)
- Database schema: see [Data Model / Schema](#data-model--schema) above
- Architecture notes: see [Architecture](#architecture) above

## API & Testing Documentation

- Full endpoint reference: [`docs/api.md`](docs/api.md)
- Postman collection (importable): [`docs/postman_collection.json`](docs/postman_collection.json)
- Test cases: [`docs/test_cases.md`](docs/test_cases.md)
- Cost analysis: [`COST_ANALYSIS.md`](COST_ANALYSIS.md)

---

## Disclaimer

This application provides **general health information only** and is not a substitute for
professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare
provider for medical concerns.
