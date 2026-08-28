import type { RetrievedChunk } from "@/types/rag";

// Surfaces the uncertainty the app already computes internally (the rerank
// score, lib/rerank.ts) instead of discarding it before the response leaves
// the server. Every chunk reaching here already cleared
// MIN_RELEVANCE_SCORE (6) in lib/rerank.ts, so the working range is [6, 10],
// not [0, 10] -- "limited" and above are all real, thresholded evidence, not
// a sliding scale down to zero.
export type EvidenceTier = "strong" | "moderate" | "limited" | "insufficient" | "no_diagnosis_applicable";

// Split of the [6, 10] post-threshold range, following the rerank prompt's
// own band definitions (lib/rerank.ts): "6-8 substantially answers... minor
// detail missing" is split into limited (barely cleared 6) vs. moderate
// (7-8), and "9-10 directly and completely answers" maps to strong. Initial
// cut, not a final calibration -- evidenceTierAccuracy (scripts/eval-
// clearsignal.ts) checks these against the gold set's category labels
// (e.g. out_of_corpus questions should land "insufficient") and these
// thresholds should move if that eval disagrees.
const STRONG_MIN = 9;
const MODERATE_MIN = 7;

export function computeEvidenceTier(chunks: RetrievedChunk[]): EvidenceTier {
  if (chunks.length === 0) return "insufficient";
  const topScore = Math.max(...chunks.map((c) => c.score));
  if (topScore >= STRONG_MIN) return "strong";
  if (topScore >= MODERATE_MIN) return "moderate";
  return "limited";
}

// The raw number computeEvidenceTier buckets, exposed separately for the
// AssayStrip UI component (components/ui/AssayStrip.tsx), which sizes/
// opacity-weights a band per turn by actual retrieval confidence rather than
// just the 5-way tier. Same [0, 10] range as RetrievedChunk.score in
// lib/rerank.ts -- 0 means no chunks cleared MIN_RELEVANCE_SCORE, not "low
// confidence answer" (there's no answer-quality signal here, only
// retrieval-relevance).
export function computeEvidenceScore(chunks: RetrievedChunk[]): number {
  if (chunks.length === 0) return 0;
  return Math.max(...chunks.map((c) => c.score));
}

export const EVIDENCE_TIER_LABELS: Record<EvidenceTier, string> = {
  strong: "Strong source support",
  moderate: "Moderate source support",
  limited: "Limited evidence",
  insufficient: "Insufficient information",
  no_diagnosis_applicable: "No diagnosis",
};
