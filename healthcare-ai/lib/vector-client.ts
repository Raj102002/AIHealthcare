import { Index } from "@upstash/vector";
import type { ChunkMetadata } from "@/types/rag";

// Upstash Vector index must be created with a built-in embedding model attached
// (Upstash console -> Create Index -> "Embedding model"), so upserts/queries send
// raw text via `data` and Upstash embeds server-side. No separate embeddings API
// key is needed as a result.
let index: Index<ChunkMetadata> | null = null;

export function getVectorIndex(): Index<ChunkMetadata> {
  if (index) return index;
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN are not set. Create a free Upstash Vector index with a built-in embedding model and add its REST credentials to .env.local."
    );
  }
  index = new Index<ChunkMetadata>({ url, token });
  return index;
}
