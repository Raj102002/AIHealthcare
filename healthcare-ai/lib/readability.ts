// Flesch-Kincaid Grade Level, computed with a plain syllable-counting heuristic
// (no dictionary/NLP dependency). Used to tag each ingested chunk's reading level
// and to score generated patient-facing output against the spec's 6th-8th grade
// target (section 3.7 of the ClearSignal build spec).
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  let stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  stripped = stripped.replace(/^y/, "");
  const matches = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function countSentences(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  return Math.max(1, matches ? matches.length : 1);
}

function countWords(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
}

// Standard Flesch-Kincaid Grade Level formula.
export function fleschKincaidGrade(text: string): number {
  const words = countWords(text);
  if (words.length === 0) return 0;
  const sentences = countSentences(text);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}
