# Wireframes

Low-fidelity wireframes for HealthAI Assistant's three main screens.

## 1. Auth Screen (`app/page.tsx`) — `/`

```
┌──────────────────────────────────────────┐
│                                            │
│              [♥]  HealthAI Assistant      │
│         Personalized health guidance      │
│                powered by AI              │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ ⚕️ For informational purposes only.   │ │
│  │ Always consult a healthcare pro.      │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  [ Login ] [ Register ]  <- mode toggle   │
│                                            │
│  Username  [______________________]       │
│  Email     [______________________]       │  (register mode only)
│  Password  [______________________] [👁]  │
│                                            │
│  (error message, if any)                  │
│                                            │
│           [   Submit / Loading…   ]       │
│                                            │
└──────────────────────────────────────────┘
```

## 2. Chat Screen (`app/chat/page.tsx`) — `/chat`

```
┌──────────────────────────────────────────┐
│ HealthAI  [Profile] [Dashboard] [Logout]  │  <- header
├──────────────────────────────────────────┤
│ 🚨 EMERGENCY BANNER (conditional)         │
│    911 / 988 / Poison Control links       │
├──────────────────────────────────────────┤
│                                            │
│   [AI] Hi, how are you feeling today?     │
│                                            │
│                  How can I help? [User]   │
│                                            │
│   [AI] Streaming response…                │
│                                            │
├──────────────────────────────────────────┤
│ [ Message input________________ ] [Send]  │
│                        [Save Chat]        │
└──────────────────────────────────────────┘
```

## 3. Dashboard Screen (`app/dashboard/page.tsx`) — `/dashboard`

```
┌──────────────────────────────────────────┐
│ HealthAI  [Chat] [Profile] [Logout]       │
├──────────────────────────────────────────┤
│  Stats:  [Logs: n] [Vitals tracked] [...] │
├──────────────────────────────────────────┤
│  [+ Log Symptom / Vital]  (expandable)    │
│  ┌──────────────────────────────────────┐ │
│  │ symptoms, severity, notes, vitals JSON│ │
│  └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│  [Analyze My Logs] -> AI Health Insights  │
│  ┌──────────────────────────────────────┐ │
│  │ patterns / observations / flags       │ │
│  └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│  Health Logs                [🗑 delete]   │
│    - log row 1                            │
│    - log row 2                            │
├──────────────────────────────────────────┤
│  Saved Conversations         [🗑 delete]  │
│    - conversation 1                       │
│    - conversation 2                       │
└──────────────────────────────────────────┘
```

## Notes

- Flow: `/` (auth) → `/chat` (default landing after login) → `/dashboard` (logs + insights + history).
- `EmergencyBanner` is conditionally rendered above the chat thread when a red-flag keyword is detected client-side.
- `UserProfilePanel` (allergies, conditions, medications, blood type, age) is editable from the header and is injected into every AI request as context.
