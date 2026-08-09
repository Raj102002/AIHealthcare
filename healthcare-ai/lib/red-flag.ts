// Deterministic red-flag escalation layer (ClearSignal build spec, section 6.1).
// Runs BEFORE retrieval on every user input. Pattern matching only — no model in
// the loop. On a match, the pipeline short-circuits entirely: no RAG, no
// citations, no Groq call. The static copy below is hand-written, not generated,
// and is a DRAFT pending real clinical review before this ships to real patients —
// it is written to the spec's tone requirements (short, directive, no hedging) but
// has not been signed off by a clinician.
//
// Deliberately biased toward false positives over false negatives, per spec:
// "Accept false positives to avoid false negatives." The false-positive rate is
// measured in scripts/eval-clearsignal.ts against the gold set's non-red-flag
// questions and reported, not hidden.
export type RedFlagSeverity = "emergency" | "urgent" | "crisis";

export interface RedFlagRule {
  id: string;
  concern: string;
  severity: RedFlagSeverity;
  patterns: RegExp[];
  copy: string;
}

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "crisis",
    concern: "Suicidal ideation or self-harm",
    severity: "crisis",
    patterns: [
      /suicid/i,
      /kill\s*(my)?self/i,
      /want\s*to\s*die/i,
      /self.?harm/i,
      /end\s*my\s*life/i,
      /no\s*reason\s*to\s*live/i,
      // Indirect/euphemistic expressions — caught these missing "want to die"-style
      // phrasing entirely in eval (evals/clearsignal-gold.jsonl q_038), a real
      // false negative on the single highest-stakes category. Bias toward more
      // of these firing, not fewer: a false positive here costs a redirect to
      // 988; a false negative costs someone who needed it not getting it.
      /don.?t\s*(want|need)\s*to\s*be\s*here/i,
      /don.?t\s*see\s*(the\s*)?point/i,
      /no\s*point\s*(in\s*|of\s*)?(going\s*on|living|carrying\s*on)/i,
      /can.?t\s*(go\s*on|do\s*this\s*anymore|take\s*(it|this)\s*anymore)/i,
      /better\s*off\s*without\s*me/i,
      /(nothing|no\s*one)\s*(left\s*)?to\s*live\s*for/i,
      /wish\s*I\s*(was|were)n.?t\s*(alive|here)/i,
      /give(n)?\s*up\s*on\s*(life|everything)/i,
      /tired\s*of\s*(living|being\s*alive|fighting)/i,
    ],
    copy:
      "It sounds like you're going through something incredibly painful right now, and I'm glad you said something. You don't have to go through this alone.\n\n" +
      "Please reach out right now: call or text 988 to reach the Suicide & Crisis Lifeline (US), available 24/7.\n\n" +
      "If you're in immediate danger, please call 911.",
  },
  {
    id: "cardiac",
    concern: "Possible Lyme carditis / heart block",
    severity: "emergency",
    patterns: [
      /chest\s*(pain|pressure|tightness|discomfort)/i,
      /palpitation/i,
      /(irregular|racing)\s*heart\s*beat/i,
      /heart\s*(is\s*)?racing/i,
      /faint(ed|ing)?/i,
      /pass(ed|ing)?\s*out/i,
      /unexplained\s*shortness\s*of\s*breath/i,
    ],
    copy:
      "Chest pain, a racing or irregular heartbeat, or fainting can be signs of a heart problem — including, in Lyme disease, inflammation affecting the heart's electrical system (Lyme carditis).\n\n" +
      "This needs care right now. Call 911 or go to the nearest emergency room.",
  },
  {
    id: "meningeal",
    concern: "Possible meningeal involvement",
    severity: "emergency",
    patterns: [/severe\s*headache/i, /worst\s*headache/i, /neck\s*(is\s*)?stiff/i, /stiff\s*neck/i, /photophobia/i, /sensitiv(e|ity)\s*to\s*light/i],
    copy:
      "A severe headache together with a stiff neck, sensitivity to light, or confusion can be a sign of inflammation around the brain or spinal cord.\n\n" +
      "This needs care right now. Call 911 or go to the nearest emergency room.",
  },
  {
    id: "neurologic",
    concern: "Possible stroke or neurologic emergency",
    severity: "emergency",
    patterns: [
      /\bstroke\b/i,
      /sudden\s*(numbness|weakness|confusion|vision)/i,
      /slurred\s*speech/i,
      /trouble\s*speaking/i,
      /vision\s*loss/i,
      /can.?t\s*see/i,
    ],
    copy:
      "Sudden weakness, numbness, trouble speaking, or vision loss can be signs of a stroke or another neurologic emergency.\n\n" +
      "This needs care right now. Call 911 or go to the nearest emergency room — don't wait to see if it passes.",
  },
  {
    id: "cranial-neuropathy",
    concern: "Possible cranial neuropathy (e.g. facial palsy)",
    severity: "urgent",
    patterns: [/face\s*droop/i, /facial\s*droop/i, /drooping\s*(on\s*)?(one\s*side\s*of\s*)?(my\s*)?face/i, /can.?t\s*close\s*(my\s*)?eye/i, /one\s*side\s*of\s*my\s*face/i],
    copy:
      "New drooping on one side of the face or trouble closing one eye can be a sign of nerve involvement — which can occur in Lyme disease (facial/Bell's palsy) but also has other causes that need prompt evaluation.\n\n" +
      "Please be seen today: go to urgent care or an emergency room, or call your doctor's office now and describe these symptoms.",
  },
  {
    id: "anaphylaxis",
    concern: "Possible anaphylaxis",
    severity: "emergency",
    patterns: [/anaphylax/i, /throat\s*(is\s*)?(closing|swelling|tightening)/i, /tongue\s*(is\s*)?swelling/i, /epipen/i, /hives.*(medication|antibiotic|drug|pill)/i],
    copy:
      "Trouble breathing, swelling of the throat or tongue, or hives after taking a medication can be signs of a severe allergic reaction (anaphylaxis).\n\n" +
      "This needs care right now. Call 911. If you have an epinephrine auto-injector (EpiPen), use it now.",
  },
  {
    id: "sepsis",
    concern: "Possible sepsis",
    severity: "emergency",
    patterns: [/high\s*fever.{0,30}confus/i, /confus.{0,30}fever/i, /fever.{0,30}severe\s*(abdominal|stomach|belly)\s*pain/i, /severe\s*(abdominal|stomach|belly)\s*pain.{0,30}fever/i],
    copy:
      "A high fever with confusion, or fever together with severe abdominal pain, can be a sign of a serious infection spreading through the body (sepsis).\n\n" +
      "This needs care right now. Call 911 or go to the nearest emergency room.",
  },
  {
    id: "anaphylaxis-breathing",
    concern: "Possible anaphylaxis or airway emergency",
    severity: "emergency",
    patterns: [/can.?t\s*breathe/i, /cannot\s*breathe/i, /difficulty\s*breath/i, /shortness\s*of\s*breath/i, /choking/i],
    copy:
      "Difficulty breathing needs care right now, whether it's a severe allergic reaction, a heart or lung problem, or something else.\n\n" +
      "Call 911 or go to the nearest emergency room.",
  },
];

export interface RedFlagMatch {
  rule: RedFlagRule;
}

export function screenRedFlags(text: string): RedFlagMatch | null {
  for (const rule of RED_FLAG_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { rule };
    }
  }
  return null;
}
