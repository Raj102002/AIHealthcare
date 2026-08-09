# PLAN.md — HealthAI Assistant

## Concept

A full-stack AI-powered healthcare assistant that lets users describe symptoms and receive
general wellness guidance via a streaming LLM chat interface. All user data (health logs,
conversation history, profile) is stored per-user in Back4App (Parse Server) with ACL
enforcement so no user can see another's data.

## Problem it solves

People often Google symptoms and get either alarmist results or vague advice. HealthAI gives
a conversational, context-aware experience that incorporates the user's health profile
(allergies, conditions, medications) and flags genuine emergencies with hotline numbers.

## Scope (Week 2)

- User registration, login, logout (Back4App Parse auth)
- Health profile (allergies, conditions, medications, blood type, age) — persisted to Parse User
- Health Log CRUD — create, read, delete symptom/vital entries
- Conversation CRUD — save, read, delete chat sessions
- AI chat with streaming (Groq llama-3.3-70b-versatile via Next.js API route)
- Emergency detection — keyword scan triggers banner with 911 / crisis hotline
- Dashboard — stats, profile summary, tabbed log/conversation history

## Data Model

### User (Parse built-in)
| Field | Type | Notes |
|-------|------|-------|
| username | String | required, unique |
| email | String | required |
| password | String | hashed by Parse |
| allergies | Array\<String\> | default [] |
| conditions | Array\<String\> | default [] |
| medications | Array\<String\> | default [] |
| bloodType | String | optional |
| age | Number | optional |

### HealthLog
| Field | Type | Notes |
|-------|------|-------|
| objectId | String | auto |
| symptoms | String | required |
| severity | String | "low" \| "medium" \| "high" |
| notes | String | optional |
| vitals | Object | heartRate, bloodPressure, temperature, oxygenSaturation |
| userId | Pointer\<User\> | owner pointer |
| ACL | ACL | read/write restricted to owner |

### Conversation
| Field | Type | Notes |
|-------|------|-------|
| objectId | String | auto |
| title | String | first user message truncated |
| messages | Array\<Object\> | [{role, content}] |
| lastMessage | String | preview (120 chars) |
| userId | Pointer\<User\> | owner pointer |
| ACL | ACL | read/write restricted to owner |

## Architecture

```
Browser (Next.js React)
  ├── / (auth page)         → loginUser / registerUser → Back4App Parse REST
  ├── /chat                 → saveConversation         → Back4App
  │       └── POST /api/chat → Groq LLM API (streaming)
  └── /dashboard            → getHealthLogs / getConversations / deleteX → Back4App
```

## Key Design Decisions

1. **Back4App as BaaS** — avoids running a custom server; Parse handles auth, ACLs, schema
2. **ACL per object** — each HealthLog and Conversation gets `new Parse.ACL(user)` so the
   database enforces privacy even if client-side checks are bypassed
3. **Groq (not Anthropic)** — faster inference for chat streaming at zero cost during
   development; the API route is provider-agnostic and can be swapped
4. **Next.js API route for AI** — keeps the Groq API key server-side; the browser never
   sees it
5. **Client-side emergency detection** — a keyword scan runs before the LLM response so the
   emergency banner appears instantly, without waiting for streaming to complete
