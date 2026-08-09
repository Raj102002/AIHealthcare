// Metadata known at chunk-build time, before hashing/timestamping. Kept free of an
// index signature so object-spread type inference stays precise in the builders.
// Field names follow the ClearSignal build spec's chunk metadata schema (section 5).
export interface ChunkContentMetadata {
  source_name: string;
  source_url: string;
  section_path: string;
  dataset_version: string;
  audience: "patient" | "clinician";
  reading_level: number;
}

export interface ChunkMetadata extends ChunkContentMetadata {
  // Index signature required so this type satisfies @upstash/vector's Dict
  // (Record<string, unknown>) generic constraint on Index<TMetadata>.
  [key: string]: unknown;
  retrieved_at: string;
  content_hash: string;
}

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

export interface CitedSource {
  number: number;
  source_name: string;
  source_url: string;
  section_path: string;
}
