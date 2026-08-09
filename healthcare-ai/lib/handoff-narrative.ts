// Narrative summary generation + validation for the handoff document (ClearSignal
// build spec, section 6.9). The prompt itself is guarded, but the guard that
// actually matters is this file: every generated summary is checked against a
// banned-phrase list and a condition-name list before it's ever shown. On
// failure it falls back to a fully templated summary built straight from the
// structured data — a deterministic fallback that always ships beats a
// generated one that occasionally diagnoses.
import type { HandoffAnalysis } from "@/lib/handoff-analysis";

export const BANNED_PHRASES = [
  "suggests",
  "indicates",
  "consistent with",
  "characteristic of",
  "likely",
  "points to",
  "may be caused by",
  "compatible with",
  "probably",
  "diagnos",
];

// Condition names this app must never state as a name attached to the patient's
// data — the corpus's own topic included, since naming it in the summary would
// read as an implied diagnosis.
export const BANNED_CONDITION_NAMES = ["lyme disease", "lyme", "babesiosis", "anaplasmosis", "ptlds", "chronic lyme"];

export interface NarrativeValidation {
  valid: boolean;
  violations: string[];
}

export function validateNarrative(text: string): NarrativeValidation {
  const lower = text.toLowerCase();
  const violations: string[] = [];
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) violations.push(`banned phrase: "${phrase}"`);
  }
  for (const name of BANNED_CONDITION_NAMES) {
    if (lower.includes(name)) violations.push(`condition name: "${name}"`);
  }
  return { valid: violations.length === 0, violations };
}

export const NARRATIVE_SYSTEM_PROMPT = `You are formatting a patient's own symptom log into a neutral summary for a clinician. You are not interpreting, diagnosing, or suggesting causes.

RULES — violating any makes the output unusable:
- Report only what appears in the DATA given to you. Add nothing.
- Never name a disease, syndrome, or condition.
- Never use: suggests, indicates, consistent with, likely, may be caused by, points to, characteristic of, probably, or any word containing "diagnos".
- Use neutral verbs: reported, logged, recorded, described.
- Preserve the patient's own wording in quotes when describing a symptom.
- Preserve stated uncertainty. If a date is marked approximate, say so.
- Third person, past tense, plain clinical register. No empathy language.
- 150 words maximum.

Output only the summary paragraph. No preamble, no headings.`;

// Always available, no model call — used both as the default and as the
// fallback when a generated summary fails validation.
export function buildTemplatedNarrative(analysis: HandoffAnalysis): string {
  const parts: string[] = [];

  if (analysis.frequency.length > 0) {
    const top = [...analysis.frequency].sort((a, b) => b.count - a.count).slice(0, 5);
    parts.push(
      `The patient logged ${analysis.frequency.length} distinct symptom${analysis.frequency.length === 1 ? "" : "s"} over the recorded period, most frequently: ${top
        .map((f) => `"${f.symptomLabel}" (${f.count} occurrence${f.count === 1 ? "" : "s"}, median severity ${f.medianSeverity}/10)`)
        .join(", ")}.`
    );
  }

  if (analysis.migratory.length > 0) {
    parts.push(`The following symptoms were recorded at more than one body site: ${analysis.migratory.map((m) => `"${m.symptomLabel}" (${m.sites.join(", ")})`).join(", ")}.`);
  }

  const episodicWithData = analysis.episodic.filter((e) => e.medianSymptomFreeIntervalDays !== null);
  if (episodicWithData.length > 0) {
    parts.push(
      `Median interval between logged occurrences: ${episodicWithData
        .map((e) => `"${e.symptomLabel}" ${e.medianSymptomFreeIntervalDays} days`)
        .join(", ")}.`
    );
  }

  const impacted = analysis.functionImpact.filter((f) => f.unableCount > 0);
  if (impacted.length > 0) {
    parts.push(
      `Function impact was recorded as: ${impacted.map((f) => `${f.domain.replace(/_/g, " ")} — unable or difficult on ${f.unableCount} of ${f.totalCount} logged days`).join("; ")}.`
    );
  }

  if (analysis.latency.firstSymptomAfterExposureDays !== null) {
    parts.push(`The earliest logged symptom was recorded ${analysis.latency.firstSymptomAfterExposureDays} days after the earliest logged exposure anchor.`);
  }

  parts.push(
    `Data covers ${analysis.coverage.loggedDays} logged day(s) across a ${analysis.coverage.spanDays}-day span; ${Math.round(
      analysis.coverage.retrospectiveShare * 100
    )}% of symptom entries were recorded more than a week after the reported date.`
  );

  return parts.join(" ");
}

export interface CuratedQuestion {
  id: string;
  condition: (a: HandoffAnalysis) => boolean;
  question: string;
}

// Curated, not generated — matched against patterns actually present in the
// analysis, per spec section 6.9 item 9.
export const QUESTION_BANK: CuratedQuestion[] = [
  {
    id: "migratory",
    condition: (a) => a.migratory.length > 0,
    question: "Does it matter that some of these symptoms moved between different parts of my body over time?",
  },
  {
    id: "episodic",
    condition: (a) => a.episodic.some((e) => e.medianSymptomFreeIntervalDays !== null && e.medianSymptomFreeIntervalDays > 3),
    question: "Is it significant that my symptoms come and go rather than staying constant?",
  },
  {
    id: "function-impact",
    condition: (a) => a.functionImpact.some((f) => f.unableCount / Math.max(f.totalCount, 1) > 0.25),
    question: "Given how much this is affecting my daily function, what would you want to rule in or out next?",
  },
  {
    id: "coverage",
    condition: (a) => a.coverage.retrospectiveShare > 0.3,
    question: "A lot of this log was recorded after the fact — is there anything I should start logging same-day instead?",
  },
  {
    id: "co-occurrence",
    condition: (a) => a.coOccurrence.length > 0,
    question: "Does it matter that some of these symptoms tend to show up on the same day as each other?",
  },
  {
    id: "trend",
    condition: (a) => a.trend.some((t) => t.slopePerWeek > 0.5),
    question: "A few of these symptoms have been trending more severe over time in my log — should that change anything?",
  },
];

export function selectQuestions(analysis: HandoffAnalysis): string[] {
  return QUESTION_BANK.filter((q) => q.condition(analysis)).map((q) => q.question);
}
