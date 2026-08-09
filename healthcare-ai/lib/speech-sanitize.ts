// Strips citation markers, markdown, and URLs before text goes to speech synthesis.
// The rendered transcript keeps all of this — only the audio drops it.
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/^\[EMERGENCY\]\n?/i, "")
    .replace(/\[\d+\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`#>~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Splits already-sanitized text into sentence-sized pieces for incremental TTS
// playback — mirrors the chunking useSpeechOutput needs to start synthesizing the
// first sentence before the rest of the answer has finished streaming.
export function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?=\s+|$)|[^.!?]+$/g) ?? [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

// Pulls out sentences that are already complete (end in . ! or ?) from `text`,
// starting at `fromIndex`, leaving a trailing in-progress sentence unconsumed so
// callers can keep accumulating it as more streamed text arrives.
export function extractCompleteSentences(
  text: string,
  fromIndex: number
): { sentences: string[]; consumedUpTo: number } {
  const unprocessed = text.slice(fromIndex);
  const matches = [...unprocessed.matchAll(/[^.!?]+[.!?]+(?=\s|$)/g)];
  if (matches.length === 0) return { sentences: [], consumedUpTo: fromIndex };

  const sentences = matches.map((m) => m[0].trim()).filter(Boolean);
  const last = matches[matches.length - 1];
  const consumedUpTo = fromIndex + (last.index ?? 0) + last[0].length;
  return { sentences, consumedUpTo };
}
