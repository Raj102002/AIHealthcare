# API Documentation — HealthAI Assistant

All Back4App (Parse REST API) calls require the headers below.  
Custom Next.js routes are relative to the deployment base URL.

---

## Common Headers (Back4App)

| Header | Value |
|--------|-------|
| `X-Parse-Application-Id` | Your Back4App App ID |
| `X-Parse-Javascript-Key` | Your Back4App JS Key |
| `X-Parse-Session-Token` | Returned on login — required for authenticated routes |
| `Content-Type` | `application/json` |

---

## 1. Authentication

### Register
`POST https://parseapi.back4app.com/1/users`

**Request body:**
```json
{
  "username": "johndoe",
  "password": "secret123",
  "email": "john@example.com",
  "allergies": [],
  "conditions": [],
  "medications": []
}
```

**Success 201:**
```json
{
  "objectId": "abc123",
  "createdAt": "2026-06-25T10:00:00.000Z",
  "sessionToken": "r:xxxx"
}
```

**Error (duplicate username) 400:**
```json
{ "code": 202, "error": "Account already exists for this username." }
```

---

### Login
`POST https://parseapi.back4app.com/1/login`

**Request body:**
```json
{ "username": "johndoe", "password": "secret123" }
```

**Success 200:**
```json
{
  "objectId": "abc123",
  "username": "johndoe",
  "sessionToken": "r:xxxx"
}
```

**Error (wrong password) 404:**
```json
{ "code": 101, "error": "Invalid username/password." }
```

---

### Logout
`POST https://parseapi.back4app.com/1/logout`

Requires `X-Parse-Session-Token` header. Returns `{}` on success.

---

## 2. Health Logs

### Create Health Log
`POST https://parseapi.back4app.com/1/classes/HealthLog`  
Requires session token.

**Request body:**
```json
{
  "symptoms": "headache and fatigue",
  "severity": "medium",
  "notes": "Started after lunch",
  "vitals": {
    "heartRate": 82,
    "bloodPressure": "120/80",
    "temperature": 99.1
  },
  "userId": {
    "__type": "Pointer",
    "className": "_User",
    "objectId": "abc123"
  }
}
```

**Success 201:**
```json
{ "objectId": "logId1", "createdAt": "2026-06-25T10:05:00.000Z" }
```

**Error (unauthenticated) 403:**
```json
{ "code": 209, "error": "Session token is expired." }
```

---

### Get Health Logs
`GET https://parseapi.back4app.com/1/classes/HealthLog?order=-createdAt&limit=50&where={"userId":{"__type":"Pointer","className":"_User","objectId":"abc123"}}`  
Requires session token.

**Success 200:**
```json
{
  "results": [
    {
      "objectId": "logId1",
      "symptoms": "headache and fatigue",
      "severity": "medium",
      "notes": "Started after lunch",
      "vitals": { "heartRate": 82 },
      "createdAt": "2026-06-25T10:05:00.000Z"
    }
  ]
}
```

---

### Delete Health Log
`DELETE https://parseapi.back4app.com/1/classes/HealthLog/{objectId}`  
Requires session token. Returns `{}` on success.

**Error (not owner) 403:**
```json
{ "code": 101, "error": "Object not found." }
```

---

## 3. Conversations

### Save Conversation
`POST https://parseapi.back4app.com/1/classes/Conversation`  
Requires session token.

**Request body:**
```json
{
  "title": "Headache symptoms",
  "messages": [
    { "role": "user", "content": "I have a headache" },
    { "role": "assistant", "content": "How long have you had it?" }
  ],
  "lastMessage": "How long have you had it?",
  "userId": {
    "__type": "Pointer",
    "className": "_User",
    "objectId": "abc123"
  }
}
```

**Success 201:**
```json
{ "objectId": "convId1", "createdAt": "2026-06-25T10:10:00.000Z" }
```

---

### Get Conversations
`GET https://parseapi.back4app.com/1/classes/Conversation?order=-createdAt&limit=20&where={"userId":{"__type":"Pointer","className":"_User","objectId":"abc123"}}`  
Requires session token.

---

### Delete Conversation
`DELETE https://parseapi.back4app.com/1/classes/Conversation/{objectId}`  
Requires session token. Returns `{}` on success.

---

## 4. AI Chat (Custom Next.js Route)

### Send Chat Message
`POST /api/chat`  
Server-side only — Groq API key never exposed to client.

**Request body:**
```json
{
  "messages": [
    { "role": "user", "content": "I have a sore throat" }
  ],
  "userProfile": {
    "allergies": ["penicillin"],
    "conditions": ["asthma"],
    "medications": ["inhaler"],
    "age": 28,
    "bloodType": "O+"
  }
}
```

**Success 200:** `text/plain` stream — chunks of assistant response text.

**Error 400:**
```json
{ "error": "Messages array is required" }
```

**Error 429 (rate limit):**
```json
{ "error": "Rate limit reached. Please wait a moment and try again." }
```

**Error 500:**
```json
{ "error": "Internal server error" }
```

---

## 5. AI Health Insights (Custom Next.js Route)

### Generate Health Log Analysis
`POST /api/health-insights`  
Analyzes up to 20 health logs and returns AI-generated wellness insights.

**Request body:**
```json
{
  "logs": [
    {
      "symptoms": "headache and fatigue",
      "severity": "medium",
      "notes": "After lunch",
      "createdAt": "2026-06-25T10:05:00.000Z",
      "vitals": { "heartRate": 82 }
    }
  ],
  "profile": {
    "age": 28,
    "bloodType": "O+",
    "allergies": ["penicillin"],
    "conditions": [],
    "medications": []
  }
}
```

**Success 200:**
```json
{
  "insights": "**Patterns**\nYou have logged headaches 3 times this week...\n\n**Observations**\n..."
}
```

**Error 400:**
```json
{ "error": "logs array is required" }
```

**Error 429:**
```json
{ "error": "Rate limit reached. Please wait a moment and try again." }
```
