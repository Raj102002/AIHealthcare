// Maps the app's ISO-639-1 language codes (used for preferredLanguage and Whisper's
// `language` param) to BCP-47 locale tags, for picking a matching speechSynthesis voice.
export const BCP47_LOCALE: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  zh: "zh-CN",
  ar: "ar-SA",
  pt: "pt-BR",
  ru: "ru-RU",
  ja: "ja-JP",
  ko: "ko-KR",
  ta: "ta-IN",
  te: "te-IN",
  bn: "bn-IN",
  ur: "ur-PK",
};
