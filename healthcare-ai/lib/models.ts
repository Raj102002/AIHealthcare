// Single source of truth for every Groq model ID this app calls. This was
// previously the same literal string duplicated across 6 files independently
// — after a live production 404 ("model_not_found") on the deployed app,
// centralized here so a future model swap (or a per-account access change on
// Groq's side) is a one-line fix instead of a six-file grep-and-hope.
//
// Kept as separate named exports, not one shared constant, because
// generation and rerank are different concerns that happen to use the same
// model today (see lib/rerank.ts's header comment for why 8b-instant was
// rejected specifically for reranking) — a future change to one shouldn't
// silently change the other.
//
// llama-3.3-70b-versatile and llama-3.1-8b-instant returned a live 404
// "model_not_found" against the deployed app's Groq account — confirmed via
// `GET /openai/v1/models` that neither is in this account's enabled model
// list, even after rotating to a newly-issued API key, so this is an
// account-level access gap on Groq's side, not a bad key. Swapped to models
// confirmed (via a direct API call) both listed AND actually callable on
// this account: openai/gpt-oss-120b (generation/rerank — same "flagship,
// reasoning-capable" tier as the old 70b model) and openai/gpt-oss-20b
// (rewrite — cheap/fast task, same tier as the old 8b-instant).
export const GROQ_GENERATION_MODEL = "openai/gpt-oss-120b";
export const GROQ_RERANK_MODEL = "openai/gpt-oss-120b";
export const GROQ_REWRITE_MODEL = "openai/gpt-oss-20b";
export const GROQ_TRANSCRIBE_MODEL = "whisper-large-v3-turbo";
export const GROQ_TTS_MODEL = "playai-tts";

// GPT-OSS models are reasoning models: they spend part of `max_tokens` on an
// internal "reasoning" pass (delivered in a separate `delta.reasoning`
// stream field, never mixed into `delta.content`, so it never leaks into
// what the user sees) before producing the actual answer. "low" keeps that
// overhead small — Groq's own docs recommend it specifically for real-time,
// low-latency use cases, which every call site here is. Every call site's
// `max_tokens` was also bumped to leave headroom for that reasoning pass on
// top of the actual content, after observing empty content when the budget
// was too tight to cover both.
export const GROQ_REASONING_EFFORT = "low" as const;
