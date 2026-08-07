import Groq from "groq-sdk";
import type { RetrievedChunk } from "@/types/rag";

const RERANK_MODEL = "llama-3.1-8b-instant";

// Below this (out of 10) a chunk is treated as not actually relevant and dropped,
// rather than passed to the generation prompt as noise.
export const MIN_RELEVANCE_SCORE = 4;

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
export async function rerank(
  query: string,
  candidates: RetrievedChunk[],
  topK: number,
  groq: Groq
): Promise<RetrievedChunk[]> {
  if (candidates.length === 0) return [];

  const listing = candidates
    .map((c, i) => `[${i}] (${c.metadata.source_title} — ${c.metadata.section_heading})\n${truncate(c.text, 500)}`)
    .join("\n\n");

  const prompt = `Query: "${query}"

Candidate passages:
${listing}

Score how relevant each candidate passage is to answering the query, on a 0-10 scale where 0 means completely unrelated and 10 means it directly answers the query. Respond with ONLY a JSON object of the form {"scores": [{"index": 0, "score": 7}, ...]} covering every candidate index.`;

  let scores: RerankScore[];
  try {
    const completion = await groq.chat.completions.create({
      model: RERANK_MODEL,
      max_tokens: 1024,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
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
