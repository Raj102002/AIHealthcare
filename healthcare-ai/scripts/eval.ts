// Offline eval harness: run locally with `npm run eval` (needs GROQ_API_KEY and a
// populated Upstash Vector index — run `npm run ingest` first). Reports retrieval
// hit rate (is a gold chunk in the reranked top-5?) and refusal rate on the
// unanswerable set (did retrieval correctly return zero chunks?), then prints a
// before/after table against the old (now-removed) single-endpoint pipeline.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Groq from "groq-sdk";
import { retrieve } from "@/lib/retrieval";
import { rewriteQuery, type ChatTurn } from "@/lib/query-rewrite";

interface EvalCase {
  id: string;
  type: "direct" | "multihop" | "followup" | "unanswerable";
  question: string;
  history?: ChatTurn[];
  gold_chunk_ids: string[];
  expect_answerable: boolean;
}

interface CaseResult {
  id: string;
  type: EvalCase["type"];
  hit: boolean;
  retrievedIds: string[];
}

function loadCases(): EvalCase[] {
  const evalPath = path.join(process.cwd(), "evals", "rag.jsonl");
  return fs
    .readFileSync(evalPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalCase);
}

function rate(n: number, d: number): string {
  return d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`;
}

async function main() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const cases = loadCases();
  const results: CaseResult[] = [];

  for (const c of cases) {
    try {
      const query = await rewriteQuery(c.history ?? [], c.question, groq);
      const retrieved = await retrieve(query, groq);
      const retrievedIds = retrieved.map((r) => r.id);
      const hit = c.gold_chunk_ids.some((id) => retrievedIds.includes(id));
      results.push({ id: c.id, type: c.type, hit, retrievedIds });
      console.log(`  ${c.id} [${c.type}] ${hit ? "HIT" : "MISS"} — got [${retrievedIds.join(", ")}]`);
    } catch (err) {
      console.error(`  ${c.id} [${c.type}] ERROR — ${(err as Error).message}`);
      results.push({ id: c.id, type: c.type, hit: false, retrievedIds: [] });
    }
  }

  const answerable = results.filter((r) => r.type !== "unanswerable");
  const unanswerable = results.filter((r) => r.type === "unanswerable");
  const byType = (t: EvalCase["type"]) => results.filter((r) => r.type === t);

  const hitRate = rate(answerable.filter((r) => r.hit).length, answerable.length);
  const directRate = rate(byType("direct").filter((r) => r.hit).length, byType("direct").length);
  const multihopRate = rate(byType("multihop").filter((r) => r.hit).length, byType("multihop").length);
  const followupRate = rate(byType("followup").filter((r) => r.hit).length, byType("followup").length);
  // "Correctly refused" == retrieval returned zero chunks, so generation has no
  // context to hallucinate from and must say it doesn't know.
  const refusalRate = rate(unanswerable.filter((r) => r.retrievedIds.length === 0).length, unanswerable.length);

  console.log("\n=== Retrieval eval — after (this rebuild) ===");
  console.log(`Overall hit rate (gold chunk in top-5): ${hitRate} (${answerable.filter((r) => r.hit).length}/${answerable.length})`);
  console.log(`  direct lookups:   ${directRate}`);
  console.log(`  multi-hop:        ${multihopRate}`);
  console.log(`  follow-ups:       ${followupRate}`);
  console.log(`Refusal rate on unanswerable set: ${refusalRate} (${unanswerable.filter((r) => r.retrievedIds.length === 0).length}/${unanswerable.length})`);

  console.log("\n=== Before / after ===");
  console.log("(The old pipeline — brute-force cosine only, single-endpoint, no history param —");
  console.log(" was removed as part of this rebuild, so its numbers below are structural facts");
  console.log(" about how it behaved, not re-measured against this eval set.)\n");
  const rows: [string, string, string][] = [
    ["Retrieval strategy", "dense cosine only (MiniLM, brute-force)", "dense + BM25, fused with RRF, LLM-reranked"],
    ["Relevance floor", "none — always returned top-6", `min rerank score enforced (threshold-gated)`],
    ["Refusal rate on unanswerable set", "0% by construction (no floor to trigger a refusal)", refusalRate],
    ["Follow-up query support", "unsupported (endpoint took no history param)", followupRate],
    ["Retrieval hit rate (direct lookups)", "not re-measured (code removed)", directRate],
    ["Retrieval hit rate (multi-hop)", "not re-measured (code removed)", multihopRate],
  ];
  const col1 = Math.max(...rows.map((r) => r[0].length), "Metric".length);
  const col2 = Math.max(...rows.map((r) => r[1].length), "Before".length);
  const col3 = Math.max(...rows.map((r) => r[2].length), "After".length);
  const line = (a: string, b: string, c: string) =>
    `${a.padEnd(col1)} | ${b.padEnd(col2)} | ${c.padEnd(col3)}`;
  console.log(line("Metric", "Before", "After"));
  console.log(line("-".repeat(col1), "-".repeat(col2), "-".repeat(col3)));
  for (const [a, b, c] of rows) console.log(line(a, b, c));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
