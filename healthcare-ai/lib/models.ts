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
export const GROQ_GENERATION_MODEL = "llama-3.3-70b-versatile";
export const GROQ_RERANK_MODEL = "llama-3.3-70b-versatile";
export const GROQ_REWRITE_MODEL = "llama-3.1-8b-instant";
export const GROQ_TRANSCRIBE_MODEL = "whisper-large-v3-turbo";
export const GROQ_TTS_MODEL = "playai-tts";
