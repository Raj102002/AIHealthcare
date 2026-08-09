# Cost Analysis — HealthAI Assistant

## AI Provider: Groq

HealthAI uses the Groq inference API with **llama-3.3-70b-versatile**.

### Groq Pricing (as of June 2026)

| Model | Input | Output |
|-------|-------|--------|
| llama-3.3-70b-versatile | $0.59 / 1M tokens | $0.79 / 1M tokens |

Groq offers a **free tier** with rate limits sufficient for development and low-traffic demos.
Paid usage is metered per token.

---

## Feature-by-Feature Token Estimates

### Feature 1: AI Chat (`POST /api/chat`)

| Component | Estimate |
|-----------|----------|
| System prompt (with user profile) | ~350 tokens input |
| Conversation history (avg 5 turns) | ~500 tokens input |
| User message | ~30 tokens input |
| Assistant response | ~300 tokens output |
| **Per chat turn total** | ~880 tokens |

**Cost per chat turn:** ~$0.00052 (~0.05 cents)

**Monthly estimate (100 active users, 10 turns/day):**
- Input: 100 × 10 × 880 × 30 days = 26.4M tokens → **$15.58**
- Output: 100 × 10 × 300 × 30 = 9M tokens → **$7.11**
- **Total: ~$22.69/month**

---

### Feature 2: AI Health Insights (`POST /api/health-insights`)

| Component | Estimate |
|-----------|----------|
| System prompt | ~80 tokens input |
| User profile + 20 log entries | ~600 tokens input |
| AI response | ~500 tokens output |
| **Per request total** | ~1,180 tokens |

**Cost per insights request:** ~$0.00109 (~0.1 cents)

Users typically generate insights a few times per week.

**Monthly estimate (100 users, 3 requests/week):**
- Input: 100 × 12 × 680 = 816K tokens → **$0.48**
- Output: 100 × 12 × 500 = 600K tokens → **$0.47**
- **Total: ~$0.95/month**

---

## Backend: Back4App (Parse Server)

| Plan | Price | Limits |
|------|-------|--------|
| Free | $0/month | 25,000 requests/month, 250 MB storage, 1 GB transfer |
| Plus | $25/month | 250,000 requests/month, 1 GB storage |

**For a class project / demo:** Free tier is sufficient.

**Monthly estimate (100 users, ~50 Parse requests/user/day):**
- 100 × 50 × 30 = 150,000 requests/month → **requires Plus plan ($25/month)**

For low usage (demo only): Free plan covers it.

---

## Hosting: Netlify

| Plan | Price | Limits |
|------|-------|--------|
| Free | $0/month | 100 GB bandwidth, 300 build minutes |

For a demo / class project, Netlify free tier is sufficient.

---

## Total Monthly Cost Summary

| Scenario | Groq (AI) | Back4App | Netlify | **Total** |
|----------|-----------|----------|---------|-----------|
| Demo only (1-5 users) | < $0.05 | Free | Free | **~$0** |
| Small class (100 users, light) | ~$5 | Free | Free | **~$5** |
| Medium (100 users, active) | ~$23.64 | $25 | Free | **~$48.64** |

---

## Cost Optimization Notes

- Chat history is capped at the last N messages to control input token growth
- Health insights truncate to 20 logs maximum
- Groq's free tier rate limits (approximately 30 req/min, 14,400 req/day on free) are
  sufficient for demos; add retry/backoff logic before scaling
- Parse ACLs ensure only the owner can query their data, preventing over-fetching
