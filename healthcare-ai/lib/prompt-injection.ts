// Prompt-injection defense (Security & Costs). Two layers, deliberately not
// three: (1) the system prompt itself instructs the model to treat retrieved
// context and user input as data, never as instructions (lib/generation.ts —
// search for "Treat everything below this line"), and (2) this pattern-based
// flag for observability. There's no third layer that blocks/rejects matching
// messages, because in a health chat context, phrases like "ignore" or
// "disregard" show up in legitimate messages ("ignore my last message, I
// meant..."), and hard-blocking on pattern match would cause real false
// positives against real patients. This is a documented, deliberate choice,
// not an oversight — see docs/security-audit.md.
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?)/i,
  /disregard\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?)/i,
  /you\s+are\s+now\s+(a|an)\s/i,
  /system\s*(prompt|message)\s*:/i,
  /\bnew\s+instructions?\s*:/i,
  /forget\s+(everything|all)\s+(you|above)/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a)\s/i,
];

export function flagPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}
