const EMERGENCY_PATTERNS = [
  // Cardiac
  /chest\s*(pain|pressure|tightness|discomfort)/i,
  /heart\s*attack/i,
  /cardiac\s*arrest/i,
  // Respiratory
  /can.?t\s*breathe/i,
  /cannot\s*breathe/i,
  /difficulty\s*breath/i,
  /shortness\s*of\s*breath/i,
  /not\s*(able\s*to\s*)?breath/i,
  /choking/i,
  // Stroke
  /\bstroke\b/i,
  /face\s*droop/i,
  /arm\s*weak/i,
  /slurred\s*speech/i,
  /sudden\s*(numbness|vision|confusion|severe\s*headache)/i,
  // Mental health crisis
  /suicid/i,
  /kill\s*(my)?self/i,
  /want\s*to\s*die/i,
  /self.?harm/i,
  /end\s*my\s*life/i,
  // Severe allergic reaction
  /anaphylax/i,
  /throat\s*(closing|swelling|tightening)/i,
  /epipen/i,
  // Other emergencies
  /unconscious/i,
  /passed\s*out/i,
  /uncontrolled\s*bleeding/i,
  /\bseizure\b/i,
  /overdose/i,
  /poisoning/i,
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(text));
}

export const EMERGENCY_RESOURCES = [
  {
    name: "Emergency Services",
    number: "911",
    description: "Life-threatening emergencies",
    color: "bg-red-600",
  },
  {
    name: "Suicide & Crisis Lifeline",
    number: "988",
    description: "Mental health crisis support",
    color: "bg-purple-600",
  },
  {
    name: "Poison Control",
    number: "1-800-222-1222",
    description: "Poisoning or overdose",
    color: "bg-orange-600",
  },
];
