import type Groq from "groq-sdk";
import { getVectorIndex } from "@/lib/vector-client";
import { bm25Search } from "@/lib/bm25";
import { rerank } from "@/lib/rerank";
import type { ChunkMetadata, RetrievedChunk } from "@/types/rag";

const DENSE_TOPK = 20;
const BM25_TOPK = 20;
const FUSED_TOPK = 20;
const FINAL_TOPK = 5;

// Standard Reciprocal Rank Fusion constant (Cormack et al.).
const RRF_K = 60;

async function denseSearch(query: string): Promise<RetrievedChunk[]> {
  const index = getVectorIndex();
  const results = await index.query({
    data: query,
    topK: DENSE_TOPK,
    includeMetadata: true,
    includeData: true,
  });

  const chunks: RetrievedChunk[] = [];
  for (const r of results) {
    if (!r.metadata) continue;
    chunks.push({
      id: String(r.id),
      text: r.data ?? "",
      metadata: r.metadata as ChunkMetadata,
      score: r.score,
    });
  }
  return chunks;
}

function reciprocalRankFusion(lists: RetrievedChunk[][], topK: number): RetrievedChunk[] {
  const rrfScores = new Map<string, number>();
  const chunkById = new Map<string, RetrievedChunk>();

  for (const list of lists) {
    list.forEach((chunk, i) => {
      const rank = i + 1;
      rrfScores.set(chunk.id, (rrfScores.get(chunk.id) ?? 0) + 1 / (RRF_K + rank));
      if (!chunkById.has(chunk.id)) chunkById.set(chunk.id, chunk);
    });
  }

  const ranked = [...rrfScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK);
  const fused: RetrievedChunk[] = [];
  for (const [id, score] of ranked) {
    const chunk = chunkById.get(id);
    if (chunk) fused.push({ ...chunk, score });
  }
  return fused;
}

// Hybrid retrieval: dense vector search (semantic) + BM25 keyword search (exact
// terms/proper nouns, e.g. drug names and place names dense embeddings blur
// together), fused with Reciprocal Rank Fusion, then reranked and thresholded.
// Returns [] when nothing clears the relevance bar — callers must treat that as
// "no context available", not retry with a lower bar.
export async function retrieve(query: string, groq: Groq): Promise<RetrievedChunk[]> {
  const dense = await denseSearch(query);
  const sparse = bm25Search(query, BM25_TOPK);
  const fused = reciprocalRankFusion([dense, sparse], FUSED_TOPK);
  if (fused.length === 0) return [];
  return rerank(query, fused, FINAL_TOPK, groq);
}
