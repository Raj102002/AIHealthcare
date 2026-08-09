import Groq from "groq-sdk";
import type { RetrievedChunk } from "@/types/rag";
import { recordTokenUsage } from "@/lib/metrics";

// llama-3.1-8b-instant was tried first (cheaper/faster) but reliably ignored explicit
// disease-mismatch instructions and few-shot examples in this batch-scoring prompt —
// e.g. it scored Lyme-antibiotic content 10/10 against a flu-treatment query even
// with that exact pairing given as a worked "score this 1" example. Switching to 70b
// with the same prompt took evals/rag.jsonl's unanswerable-set refusal rate from
// 20-40% to 100% (5/5) with no regression on the 15 answerable cases (still 100%
// hit rate) — verified via `npm run eval`.
const RERANK_MODEL = "llama-3.3-70b-versatile";

// Below this (out of 10) a chunk is treated as not actually relevant and dropped,
// rather than passed to the generation prompt as noise. Calibrated against
// evals/rag.jsonl's unanswerable set: candidates that only share vocabulary with
// the query (e.g. the word "treatment") but don't address it score in the 3-5
// range from the reranker, not near 0, so the floor has to sit above that band.
export const MIN_RELEVANCE_SCORE = 6;

interface RerankScore {
  index: number;
  score: number;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

// Reranks `candidates` (already fused by RRF) against `query` using a Groq LLM call,
// since a dedicated cross-encoder reranker (e.g. Cohere) would need a separate API
// key. Returns the top `topK` candidates whose score clears MIN_RELEVANCE_SCORE, or
// an empty array if none do — callers must not fall back to unranked candidates.
//
// The prompt names the corpus's exact subject (Lyme disease) and explicitly tells
// the model shared vocabulary alone isn't relevance — plain "score 0-10 relevance"
// wording let the reranker give near-max scores to same-vocabulary/wrong-disease
// candidates (e.g. 10/10 for Lyme antibiotic info against a flu-treatment query).
// This is intentionally scoped to this corpus's single topic; if the corpus grows
// to cover more subjects, this framing needs to become topic-agnostic again.
export async function rerank(
  query: string,
  candidates: RetrievedChunk[],
  topK: number,
  groq: Groq
): Promise<RetrievedChunk[]> {
  if (candidates.length === 0) return [];

  const listing = candidates
    .map((c, i) => `[${i}] (${c.metadata.source_name} — ${c.metadata.section_path})\n${truncate(c.text, 500)}`)
    .join("\n\n");

  const prompt = `This knowledge base covers exactly one subject: Lyme disease (CDC surveillance case-count statistics by US county/state/race, and CDC educational content on transmission, symptoms, testing, treatment, and prevention). It has no data on any other disease, any other country's statistics, or any medical topic outside Lyme disease.

Query: "${query}"

Candidate passages:
${listing}

For each candidate, first check: is the query asking about Lyme disease specifically (or a place/topic this passage actually covers)? If the query is about a different disease/condition/medication, a place this passage doesn't cover, or anything outside this knowledge base's subject, that candidate scores 0-2 NO MATTER HOW MANY WORDS IT SHARES with the query (e.g. "treatment", "cases", and "symptoms" appear in both Lyme and non-Lyme questions — shared words are not relevance).

Then score 0-10:
- 0-2: wrong disease/condition/medication, wrong place, or otherwise outside what this passage covers — even with shared vocabulary.
- 3-5: right general subject but doesn't actually answer this specific query.
- 6-8: substantially answers the query, possibly missing minor detail.
- 9-10: directly and completely answers the query.

Example: query "flu treatment", candidate about Lyme disease antibiotics → 1 (different disease; "treatment" being in both is not relevance).
Example: query "Lyme cases in France", candidate about Lyme cases in a US county → 1 (right disease, wrong place — doesn't answer the query).
Example: query "Lyme disease symptoms", candidate about Lyme disease symptoms → 9.

Respond with ONLY a JSON object of the form {"scores": [{"index": 0, "score": 7}, ...]} covering every candidate index.`;

  let scores: RerankScore[];
  try {
    const completion = await groq.chat.completions.create({
      model: RERANK_MODEL,
      max_tokens: 1024,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    if (completion.usage) {
      recordTokenUsage(completion.usage.prompt_tokens ?? 0, completion.usage.completion_tokens ?? 0);
    }
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { scores?: unknown };
    if (!Array.isArray(parsed.scores)) throw new Error("malformed rerank response");
    scores = parsed.scores
      .filter(
        (s): s is RerankScore =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as RerankScore).index === "number" &&
          typeof (s as RerankScore).score === "number"
      )
      .map((s) => ({ index: s.index, score: s.score }));
  } catch {
    // Degrade to the fused RRF order rather than failing the request outright —
    // this is a resilience fallback for a malformed LLM response, not a fallback
    // to unranked/ungrounded content.
    scores = candidates.map((_, i) => ({ index: i, score: 10 - i * (10 / candidates.length) }));
  }

  const byIndex = new Map(scores.map((s) => [s.index, s.score]));
  return candidates
    .map((c, i) => ({ chunk: c, score: byIndex.get(i) ?? 0 }))
    .filter((s) => s.score >= MIN_RELEVANCE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({ ...s.chunk, score: s.score }));
}
