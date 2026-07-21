import { pipeline, env } from "@xenova/transformers";
import fs from "node:fs";
import path from "node:path";

env.cacheDir = path.join(process.cwd(), "models");
env.allowLocalModels = true;
env.allowRemoteModels = false; // deployed function must never hit the network for the model

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export interface Chunk {
  id: string;
  text: string;
  source: string;
  region: string;
  years_covered: string;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID);
  }
  return extractorPromise;
}

let chunksCache: Chunk[] | null = null;
let vectorsCache: Map<string, Float32Array> | null = null;

function loadCorpus() {
  if (chunksCache && vectorsCache) {
    return { chunks: chunksCache, vectors: vectorsCache };
  }

  const chunksPath = path.join(process.cwd(), "data", "lyme-chunks.json");
  const vectorsPath = path.join(process.cwd(), "data", "lyme-vectors.json");
  const chunks: Chunk[] = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));
  const rawVectors: Record<string, number[]> = JSON.parse(
    fs.readFileSync(vectorsPath, "utf-8")
  );

  const vectors = new Map<string, Float32Array>();
  for (const [id, vec] of Object.entries(rawVectors)) {
    vectors.set(id, Float32Array.from(vec));
  }

  chunksCache = chunks;
  vectorsCache = vectors;
  return { chunks, vectors };
}

// Chunk vectors are pre-normalized (unit length) at embed time, and the query vector
// below is normalized the same way, so a plain dot product equals cosine similarity.
function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export async function retrieveRelevantChunks(
  query: string,
  topK = 6
): Promise<RetrievedChunk[]> {
  const { chunks, vectors } = loadCorpus();
  const extractor = await getExtractor();
  const output = await extractor(query, { pooling: "mean", normalize: true });
  const queryVec = Float32Array.from(output.data as Float32Array);

  const scored: RetrievedChunk[] = chunks.map((chunk) => {
    const vec = vectors.get(chunk.id);
    const score = vec ? dot(queryVec, vec) : -1;
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
