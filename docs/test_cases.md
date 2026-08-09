# Test Cases — HealthAI Assistant

Test these cases using Postman (import `postman_collection.json`) or Thunder Client.  
Replace `{{session_token}}` with the token returned from login.

---

## 1. Authentication

### TC-AUTH-01: Register with valid data
- **Method:** POST `/1/users`
- **Input:** `{ username: "testuser1", password: "pass123", email: "test@example.com" }`
- **Expected:** 201, body contains `objectId` and `sessionToken`

### TC-AUTH-02: Register with duplicate username
- **Method:** POST `/1/users`
- **Input:** Same username as TC-AUTH-01
- **Expected:** 400, `{ "code": 202, "error": "Account already exists..." }`

### TC-AUTH-03: Register with missing password
- **Method:** POST `/1/users`
- **Input:** `{ username: "testuser2", email: "t@t.com" }` (no password)
- **Expected:** 400, Parse error about required field

### TC-AUTH-04: Login with valid credentials
- **Method:** POST `/1/login`
- **Input:** `{ username: "testuser1", password: "pass123" }`
- **Expected:** 200, body contains `sessionToken`

### TC-AUTH-05: Login with wrong password
- **Method:** POST `/1/login`
- **Input:** `{ username: "testuser1", password: "wrongpass" }`
- **Expected:** 404, `{ "code": 101, "error": "Invalid username/password." }`

### TC-AUTH-06: Login with non-existent user
- **Method:** POST `/1/login`
- **Input:** `{ username: "doesnotexist", password: "pass123" }`
- **Expected:** 404, code 101 error

---

## 2. Health Logs

### TC-LOG-01: Create health log (authenticated)
- **Method:** POST `/1/classes/HealthLog`
- **Headers:** Include valid session token
- **Input:** `{ symptoms: "headache", severity: "low", notes: "", vitals: {} }`
- **Expected:** 201, body contains `objectId`

### TC-LOG-02: Create health log (unauthenticated)
- **Method:** POST `/1/classes/HealthLog`
- **Headers:** No session token
- **Input:** Same as TC-LOG-01
- **Expected:** 403, ACL or session error (Parse rejects based on Class-Level Permissions)

### TC-LOG-03: Read health logs (authenticated)
- **Method:** GET `/1/classes/HealthLog?order=-createdAt&limit=50`
- **Headers:** Include valid session token
- **Expected:** 200, `results` array (only own records due to ACL)

### TC-LOG-04: Read health logs (unauthenticated)
- **Method:** GET `/1/classes/HealthLog`
- **Headers:** No session token
- **Expected:** 200 with empty results or 403, depending on CLP — own records are ACL-protected

### TC-LOG-05: Delete health log (owner)
- **Method:** DELETE `/1/classes/HealthLog/{objectId}` (use id from TC-LOG-01)
- **Headers:** Include valid session token
- **Expected:** 200, `{}`

### TC-LOG-06: Delete health log (non-owner)
- **Method:** DELETE `/1/classes/HealthLog/{objectId}`
- **Headers:** Session token of a *different* user
- **Expected:** 404/403, object not found or permission denied (ACL blocks it)

---

## 3. Conversations

### TC-CONV-01: Save conversation (authenticated)
- **Method:** POST `/1/classes/Conversation`
- **Headers:** Include valid session token
- **Input:** `{ title: "Test chat", messages: [{role:"user",content:"hello"},{role:"assistant",content:"hi"}], lastMessage: "hi" }`
- **Expected:** 201, body contains `objectId`

### TC-CONV-02: Read conversations (authenticated)
- **Method:** GET `/1/classes/Conversation?order=-createdAt&limit=20`
- **Headers:** Include valid session token
- **Expected:** 200, `results` array of own conversations only

### TC-CONV-03: Delete conversation (owner)
- **Method:** DELETE `/1/classes/Conversation/{objectId}`
- **Headers:** Include valid session token
- **Expected:** 200, `{}`

---

## 4. AI Chat Endpoint

### TC-CHAT-01: Valid single message
- **Method:** POST `/api/chat`
- **Input:** `{ "messages": [{ "role": "user", "content": "I have a mild headache" }] }`
- **Expected:** 200, streaming `text/plain` response

### TC-CHAT-02: Message with user profile context
- **Method:** POST `/api/chat`
- **Input:** `{ "messages": [{"role":"user","content":"Is ibuprofen safe for me?"}], "userProfile": {"allergies":["aspirin"]} }`
- **Expected:** 200, response mentions the allergy or advises consulting a doctor

### TC-CHAT-03: Emergency keyword triggers flag
- **Method:** POST `/api/chat`
- **Input:** `{ "messages": [{"role":"user","content":"I have chest pain and can't breathe"}] }`
- **Expected:** 200, response starts with `[EMERGENCY]` token

### TC-CHAT-04: Empty messages array
- **Method:** POST `/api/chat`
- **Input:** `{ "messages": [] }`
- **Expected:** 400, `{ "error": "Messages array is required" }`

### TC-CHAT-05: Missing body
- **Method:** POST `/api/chat`
- **Input:** (no body)
- **Expected:** 400 or 500 error response

---

## 5. AI Health Insights Endpoint

### TC-INSIGHTS-01: Valid logs and profile
- **Method:** POST `/api/health-insights`
- **Input:**
```json
{
  "logs": [
    { "symptoms": "headache", "severity": "low", "notes": "", "createdAt": "2026-06-25T10:00:00Z", "vitals": {} }
  ],
  "profile": { "age": 25, "allergies": [], "conditions": [], "medications": [] }
}
```
- **Expected:** 200, `{ "insights": "..." }` with non-empty string

### TC-INSIGHTS-02: Empty logs array
- **Method:** POST `/api/health-insights`
- **Input:** `{ "logs": [], "profile": null }`
- **Expected:** 200, `{ "insights": "No health logs found..." }`

### TC-INSIGHTS-03: Missing logs field
- **Method:** POST `/api/health-insights`
- **Input:** `{ "profile": {} }`
- **Expected:** 400, `{ "error": "logs array is required" }`

### TC-INSIGHTS-04: Large log set (truncation)
- **Method:** POST `/api/health-insights`
- **Input:** logs array with 25 entries
- **Expected:** 200, AI only receives first 20 (no crash, valid insights returned)
