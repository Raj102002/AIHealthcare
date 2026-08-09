// Co-infection differential prompts (ClearSignal build spec, section 6.8).
// Deterministic pattern matching, same spirit as lib/red-flag.ts but NOT an
// escalation — this never claims a differential diagnosis, only surfaces a
// question worth bringing to a clinician who may not have asked it.
export type CoinfectionSignal = "babesiosis" | "anaplasmosis";

const BABESIOSIS_PATTERNS = [
  /drenching\s*(night\s*)?sweats?/i,
  /soak(ed|ing)\s*(through\s*)?(my\s*)?(clothes|sheets|bedding|pajamas)/i,
  /air\s*hunger/i,
  /can.?t\s*get\s*a\s*(full|deep)\s*breath/i,
];

const ANAPLASMOSIS_PATTERNS = [
  /high\s*fever.{0,40}(low|abnormal)\s*(blood\s*counts?|platelets|white\s*(blood\s*)?cells?)/i,
  /(low|abnormal)\s*(blood\s*counts?|platelets|white\s*(blood\s*)?cells?).{0,40}fever/i,
  /cytopenia/i,
];

export function detectCoinfectionSignals(text: string): CoinfectionSignal[] {
  const signals: CoinfectionSignal[] = [];
  if (BABESIOSIS_PATTERNS.some((p) => p.test(text))) signals.push("babesiosis");
  if (ANAPLASMOSIS_PATTERNS.some((p) => p.test(text))) signals.push("anaplasmosis");
  return signals;
}

export const COINFECTION_QUESTIONS: Record<CoinfectionSignal, string> = {
  babesiosis: "Could this also be babesiosis, and should I be tested for it?",
  anaplasmosis: "Could this also be anaplasmosis, and should I be tested for it?",
};
