import { loadCorpusChunks } from "@/lib/corpus-lookup";
import type { Chunk, RetrievedChunk } from "@/types/rag";

interface IndexedDoc {
  chunk: Chunk;
  termFreq: Map<string, number>;
  length: number;
}

interface Bm25Index {
  docs: IndexedDoc[];
  documentFreq: Map<string, number>;
  avgLength: number;
  n: number;
}

let indexCache: Bm25Index | null = null;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function buildIndex(): Bm25Index {
  if (indexCache) return indexCache;
  const chunks = loadCorpusChunks();
  const documentFreq = new Map<string, number>();

  const docs: IndexedDoc[] = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    const termFreq = new Map<string, number>();
    for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    for (const t of termFreq.keys()) documentFreq.set(t, (documentFreq.get(t) ?? 0) + 1);
    return { chunk, termFreq, length: tokens.length };
  });

  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / (docs.length || 1);
  indexCache = { docs, documentFreq, avgLength, n: docs.length };
  return indexCache;
}

// Standard Okapi BM25 constants.
const K1 = 1.5;
const B = 0.75;

export function bm25Search(query: string, topK: number): RetrievedChunk[] {
  const { docs, documentFreq, avgLength, n } = buildIndex();
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scored = docs.map((doc) => {
    let score = 0;
    for (const term of queryTerms) {
      const f = doc.termFreq.get(term) ?? 0;
      if (f === 0) continue;
      const df = documentFreq.get(term) ?? 0;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * doc.length) / avgLength));
    }
    return { chunk: doc.chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({ ...s.chunk, score: s.score }));
}
