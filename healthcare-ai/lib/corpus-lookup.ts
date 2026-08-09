import fs from "node:fs";
import path from "node:path";
import type { Chunk } from "@/types/rag";

let cache: Chunk[] | null = null;

// Shared reader for data/corpus.json — the same file used by the BM25 index, the
// exposure route's county lookups, and co-infection prompt's direct chunk
// lookups. Cached per warm function instance like the rest of this app's
// request-scoped state.
export function loadCorpusChunks(): Chunk[] {
  if (cache) return cache;
  const p = path.join(process.cwd(), "data", "corpus.json");
  cache = JSON.parse(fs.readFileSync(p, "utf-8")) as Chunk[];
  return cache;
}

export function findChunksByIdPrefix(prefix: string): Chunk[] {
  return loadCorpusChunks().filter((c) => c.id.startsWith(prefix));
}
