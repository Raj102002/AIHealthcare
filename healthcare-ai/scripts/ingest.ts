// Offline ingestion: never runs on the request path. Run locally with `npm run ingest`
// whenever corpus/*.md or data/*_long.csv change. Reads source docs, chunks them,
// hashes each chunk to skip unchanged ones, and upserts the rest to Upstash Vector
// (which embeds server-side via its built-in embedding model — no local model, no
// separate embeddings key). Also writes data/corpus.json, a text-only mirror of every
// chunk used by the BM25 keyword index at request time — that file is written
// unconditionally, independent of whether Upstash is reachable, since the keyword
// index has no dependency on the remote vector store.
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
config({ path: path.join(process.cwd(), ".env.local") });
import { parseMarkdownDoc, recursiveSplit, hashChunk } from "@/lib/chunking";
import { buildTabularChunks } from "@/lib/tabular-chunks";
import { getVectorIndex } from "@/lib/vector-client";
import type { Chunk, ChunkContentMetadata } from "@/types/rag";

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, "corpus");
const DATA_DIR = path.join(ROOT, "data");
const MANIFEST_PATH = path.join(DATA_DIR, "ingest-manifest.json");
const CORPUS_OUT_PATH = path.join(DATA_DIR, "corpus.json");

type Manifest = Record<string, { content_hash: string; ingested_at: string }>;

function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
}

function buildMarkdownChunks(): { id: string; text: string; metadata: ChunkContentMetadata }[] {
  const chunks: { id: string; text: string; metadata: ChunkContentMetadata }[] = [];
  const files = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(CORPUS_DIR, file), "utf-8");
    const doc = parseMarkdownDoc(raw);

    for (const section of doc.sections) {
      const pieces = recursiveSplit(section.body);
      pieces.forEach((piece, i) => {
        const id = `doc:${slug(doc.title)}:${slug(section.heading)}${pieces.length > 1 ? `:${i}` : ""}`;
        const text = `${doc.title} — ${section.heading}\n\n${piece}`;
        chunks.push({
          id,
          text,
          metadata: {
            source_title: doc.title,
            source_url: doc.sourceUrl,
            section_heading: section.heading,
            page_or_row: `${doc.title} > ${section.heading}`,
          },
        });
      });
    }
  }
  return chunks;
}

function buildCsvChunks(): { id: string; text: string; metadata: ChunkContentMetadata }[] {
  const countyCsv = fs.readFileSync(path.join(DATA_DIR, "county_long.csv"), "utf-8");
  const raceCsv = fs.readFileSync(path.join(DATA_DIR, "race_long.csv"), "utf-8");

  return buildTabularChunks(countyCsv, raceCsv).map((c) => ({
    id: c.id,
    text: `${c.sourceTitle} — ${c.sectionHeading}\n\n${c.text}`,
    metadata: {
      source_title: c.sourceTitle,
      source_url: "",
      section_heading: c.sectionHeading,
      page_or_row: c.pageOrRow,
    },
  }));
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const manifest = loadManifest();
  const nowIso = new Date().toISOString();

  const rawChunks = [...buildMarkdownChunks(), ...buildCsvChunks()];

  const chunks: Chunk[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const raw of rawChunks) {
    const contentHash = hashChunk(raw.text, raw.metadata);
    const prior = manifest[raw.id];
    const ingestedAt = prior && prior.content_hash === contentHash ? prior.ingested_at : nowIso;

    if (!prior) created++;
    else if (prior.content_hash !== contentHash) updated++;
    else unchanged++;

    chunks.push({
      id: raw.id,
      text: raw.text,
      metadata: { ...raw.metadata, ingested_at: ingestedAt, content_hash: contentHash },
    });
  }

  // The BM25 keyword index only ever reads this file, and has no dependency on
  // Upstash, so it's written up front regardless of what happens below.
  fs.writeFileSync(CORPUS_OUT_PATH, JSON.stringify(chunks));

  const currentIds = new Set(chunks.map((c) => c.id));
  const staleIds = Object.keys(manifest).filter((id) => !currentIds.has(id));
  const toUpsert = chunks.filter((c) => {
    const prior = manifest[c.id];
    return !prior || prior.content_hash !== c.metadata.content_hash;
  });

  console.log(
    `${chunks.length} chunks total: ${created} new, ${updated} changed, ${unchanged} unchanged, ${staleIds.length} stale (to delete).`
  );

  // Only ids actually confirmed against Upstash get recorded in the manifest, so a
  // partial failure here just means the next run retries the unconfirmed subset —
  // it never silently marks something "ingested" that the vector store doesn't have.
  const confirmed: Manifest = {};

  if (toUpsert.length > 0) {
    try {
      const index = getVectorIndex();
      const BATCH = 100;
      for (let i = 0; i < toUpsert.length; i += BATCH) {
        const batch = toUpsert.slice(i, i + BATCH);
        await index.upsert(batch.map((c) => ({ id: c.id, data: c.text, metadata: c.metadata })));
        for (const c of batch) {
          confirmed[c.id] = { content_hash: c.metadata.content_hash, ingested_at: c.metadata.ingested_at };
        }
        console.log(`  upserted ${Math.min(i + BATCH, toUpsert.length)}/${toUpsert.length}`);
      }
    } catch (err) {
      console.warn(
        `  Upstash upsert failed (${(err as Error).message}). data/corpus.json was still written for BM25; ` +
          `unconfirmed chunks will be retried on the next ingest run.`
      );
    }
  }

  if (staleIds.length > 0) {
    try {
      const index = getVectorIndex();
      await index.delete(staleIds);
      console.log(`  deleted ${staleIds.length} stale vectors`);
    } catch (err) {
      console.warn(`  Upstash delete failed (${(err as Error).message}). Stale ids kept in the manifest to retry.`);
      for (const id of staleIds) {
        const prior = manifest[id];
        if (prior) confirmed[id] = prior;
      }
    }
  }

  const newManifest: Manifest = { ...manifest };
  for (const [id, entry] of Object.entries(confirmed)) newManifest[id] = entry;
  for (const c of chunks) {
    // Chunks that were already up to date (never touched above) stay recorded as-is.
    if (!toUpsert.some((u) => u.id === c.id)) {
      newManifest[c.id] = { content_hash: c.metadata.content_hash, ingested_at: c.metadata.ingested_at };
    }
  }
  for (const id of staleIds) {
    if (!confirmed[id]) delete newManifest[id];
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(newManifest, null, 2));
  console.log(`Wrote ${MANIFEST_PATH} and ${CORPUS_OUT_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
