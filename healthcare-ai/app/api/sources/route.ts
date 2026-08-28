import { NextResponse } from "next/server";
import { withMetrics } from "@/lib/metrics";
import { loadCorpusChunks } from "@/lib/corpus-lookup";

export interface SourceEntry {
  sourceName: string;
  sourceUrl: string;
  condition: string;
  chunkCount: number;
}

// Deduped list of every distinct source document/dataset behind the corpus —
// the real source_url values already carried in chunk metadata since Phase 0
// (per-doc frontmatter for markdown, the CDC surveillance landing page for
// tabular data). This is mostly a rendering task: the data already exists,
// this just aggregates and exposes it.
export const GET = withMetrics("sources", async () => {
  const chunks = loadCorpusChunks();
  const bySource = new Map<string, SourceEntry>();

  for (const c of chunks) {
    const key = c.metadata.source_name;
    const existing = bySource.get(key);
    if (existing) {
      existing.chunkCount += 1;
    } else {
      bySource.set(key, {
        sourceName: c.metadata.source_name,
        sourceUrl: c.metadata.source_url,
        condition: c.metadata.condition,
        chunkCount: 1,
      });
    }
  }

  const sources = [...bySource.values()].sort((a, b) => a.sourceName.localeCompare(b.sourceName));
  return NextResponse.json({ sources });
});
