import { createHash } from "node:crypto";

// No tokenizer dependency: 4 chars/token is the standard rough estimate for
// English text and is precise enough for chunk-sizing purposes.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const TARGET_TOKENS = 600;
const OVERLAP_TOKENS = 100;

function splitIntoSentences(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const units: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const matches = trimmed.match(/[^.!?]+[.!?]+(?=\s+|$)|[^.!?]+$/g) ?? [trimmed];
    for (const m of matches) {
      const s = m.trim();
      if (s) units.push(s);
    }
  }
  return units;
}

// Greedily packs sentences into ~targetTokens windows, never splitting a sentence,
// carrying the trailing ~overlapTokens of each chunk into the start of the next one.
export function recursiveSplit(
  text: string,
  targetTokens = TARGET_TOKENS,
  overlapTokens = OVERLAP_TOKENS
): string[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sTokens = estimateTokens(sentence);
    if (currentTokens + sTokens > targetTokens && current.length > 0) {
      chunks.push(current.join(" "));

      const overlap: string[] = [];
      let overlapTokenCount = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        overlapTokenCount += estimateTokens(current[i]);
        overlap.unshift(current[i]);
        if (overlapTokenCount >= overlapTokens) break;
      }
      current = overlap;
      currentTokens = overlapTokenCount;
    }
    current.push(sentence);
    currentTokens += sTokens;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

export interface MarkdownDoc {
  title: string;
  sourceUrl: string;
  sections: { heading: string; body: string }[];
}

export function parseMarkdownDoc(raw: string): MarkdownDoc {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (fmMatch) {
    for (const line of fmMatch[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    body = fmMatch[2];
  }

  const lines = body.split("\n");
  const sections: { heading: string; body: string }[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text) sections.push({ heading: currentHeading, body: text });
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h2) {
      flush();
      currentHeading = h2[1].trim();
      currentLines = [];
    } else if (h1) {
      // title line, not a content section
      continue;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return { title: meta.title ?? "Untitled", sourceUrl: meta.source_url ?? "", sections };
}

export function hashChunk(text: string, metadata: import("@/types/rag").ChunkContentMetadata): string {
  const payload = JSON.stringify({ text, metadata });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
