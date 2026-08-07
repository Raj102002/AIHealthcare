// Metadata known at chunk-build time, before hashing/timestamping. Kept free of an
// index signature so object-spread type inference stays precise in the builders.
export interface ChunkContentMetadata {
  source_title: string;
  source_url: string;
  section_heading: string;
  page_or_row: string;
}

export interface ChunkMetadata extends ChunkContentMetadata {
  // Index signature required so this type satisfies @upstash/vector's Dict
  // (Record<string, unknown>) generic constraint on Index<TMetadata>.
  [key: string]: unknown;
  ingested_at: string;
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
  source_title: string;
  source_url: string;
  section_heading: string;
}
