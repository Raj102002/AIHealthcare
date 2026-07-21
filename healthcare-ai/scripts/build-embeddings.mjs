// One-time offline script: embeds every chunk in data/lyme-chunks.json and writes
// data/lyme-vectors.json. Run locally (`npm run build:embeddings`) and commit the
// result — the deployed app only ever reads the precomputed vectors, it never
// re-embeds the corpus.
import { pipeline, env } from "@xenova/transformers";
import fs from "node:fs";
import path from "node:path";

env.cacheDir = path.join(process.cwd(), "models");
env.allowLocalModels = true;
env.allowRemoteModels = true; // this script may need to download the model once

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

async function main() {
  const chunksPath = path.join(process.cwd(), "data", "lyme-chunks.json");
  const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));

  console.log(`Embedding ${chunks.length} chunks with ${MODEL_ID}...`);
  const extractor = await pipeline("feature-extraction", MODEL_ID);

  const vectors = {};
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const output = await extractor(chunk.text, { pooling: "mean", normalize: true });
    // Round to 6 decimal places -- well beyond float32's useful precision here, but
    // shrinks the JSON considerably vs full float64 text representation.
    vectors[chunk.id] = Array.from(output.data, (v) => Math.round(v * 1e6) / 1e6);
    if ((i + 1) % 200 === 0 || i === chunks.length - 1) {
      console.log(`  ${i + 1}/${chunks.length}`);
    }
  }

  const outPath = path.join(process.cwd(), "data", "lyme-vectors.json");
  fs.writeFileSync(outPath, JSON.stringify(vectors));
  console.log(`Wrote ${Object.keys(vectors).length} vectors to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
