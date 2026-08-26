import { estimateTokens } from "@/lib/chunking";
import type { CitedSource, RetrievedChunk } from "@/types/rag";

const MAX_CONTEXT_TOKENS = 3000;

export interface BuiltContext {
  block: string;
  sources: CitedSource[];
  /** The same chunks `sources`/`block` were built from — feeds prompts/aura.ts's
   *  buildContextBlock(), which needs raw text rather than the numbered/cited
   *  string this module builds for the (now-unused-inline, still-shown-in-UI)
   *  numbered format. */
  chunks: RetrievedChunk[];
}

// Chunks arrive already sorted by rerank score, best first. If the numbered context
// block would exceed the token budget, chunks are dropped from the end (lowest
// score) until it fits — never truncated mid-chunk.
export function buildContext(chunks: RetrievedChunk[]): BuiltContext {
  const kept: RetrievedChunk[] = [];
  let tokens = 0;
  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.text);
    if (kept.length > 0 && tokens + chunkTokens > MAX_CONTEXT_TOKENS) break;
    kept.push(chunk);
    tokens += chunkTokens;
  }

  const block = kept
    .map((c, i) => `[${i + 1}] (${c.metadata.source_name} — ${c.metadata.section_path})\n${c.text}`)
    .join("\n\n");

  const sources: CitedSource[] = kept.map((c, i) => ({
    number: i + 1,
    source_name: c.metadata.source_name,
    source_url: c.metadata.source_url,
    section_path: c.metadata.section_path,
  }));

  return { block, sources, chunks: kept };
}

export interface HealthProfile {
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  age?: number;
  bloodType?: string;
  preferredLanguage?: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  de: "German",
  zh: "Chinese",
  ar: "Arabic",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  ur: "Urdu",
};

// Layered on top of prompts/aura.ts's buildChatSystemPrompt() as a separate
// system turn, rather than editing that file, so the persona/safety prompt
// stays exactly what was authored for it. This covers two things that prompt
// deliberately doesn't: per-user personalization (it has no params at all),
// and the [EMERGENCY] token the frontend parses to drive the emergency
// banner UI (chat/page.tsx's `hasEmergency` check, shared with the
// deterministic pre-model red-flag layer in lib/red-flag.ts — this is that
// layer's model-side counterpart for presentations the regex layer doesn't
// catch, not a replacement for it).
export function buildOperationalAddendum(profile: HealthProfile | undefined): string {
  let profileContext = "";
  if (profile) {
    if (profile.age) profileContext += `\n- Age: ${profile.age}`;
    if (profile.bloodType) profileContext += `\n- Blood type: ${profile.bloodType}`;
    if (profile.allergies?.length) profileContext += `\n- Known allergies: ${profile.allergies.join(", ")}`;
    if (profile.conditions?.length) profileContext += `\n- Existing conditions: ${profile.conditions.join(", ")}`;
    if (profile.medications?.length) profileContext += `\n- Current medications: ${profile.medications.join(", ")}`;
  }

  const languageName = profile?.preferredLanguage
    ? LANGUAGE_NAMES[profile.preferredLanguage] ?? profile.preferredLanguage
    : null;

  return `## App-integration requirements (not persona — these drive real UI behavior)

${profileContext ? `USER HEALTH PROFILE, for context only — never use this to tailor medication, dosage, or treatment advice, and never ask for medication details yourself:${profileContext}\n` : ""}
${languageName ? `LANGUAGE: Always respond in ${languageName}, regardless of what language this prompt is written in.` : "LANGUAGE: Detect the language of the user's message and reply in that same language."}

EMERGENCY TOKEN: If the user's message describes any of the following, start your entire reply with the exact token [EMERGENCY] on its own line, then continue your normal reply beneath it: chest pain, pressure, or tightness; difficulty breathing or shortness of breath; stroke signs (facial drooping, sudden one-sided weakness, slurred speech, sudden severe headache); suicidal thoughts, self-harm, or intent to harm others; severe allergic reaction or throat closing; uncontrolled bleeding, loss of consciousness, seizure, or overdose. This token drives the app's emergency banner — treat it seriously even for presentations you'd expect an earlier check to already have caught.`;
}
