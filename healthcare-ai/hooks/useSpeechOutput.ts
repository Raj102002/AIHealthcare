"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BCP47_LOCALE } from "@/lib/language-codes";

// Chrome can silently stop firing events / cut off utterances longer than ~15s,
// so long answers are split into sentence-sized chunks and queued individually.
function splitIntoSpeakableChunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|\S+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 200 && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function getVoiceForLocale(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase() === locale.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()))
  );
}

export function useSpeechOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Some browsers populate the voice list asynchronously.
    window.speechSynthesis.getVoices();
  }, []);

  const speakNextRef = useRef<(locale: string) => void>(() => {});
  useEffect(() => {
    speakNextRef.current = (locale: string) => {
      const next = queueRef.current.shift();
      if (!next) {
        setIsSpeaking(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(next);
      utterance.lang = locale;
      const voice = getVoiceForLocale(locale);
      if (voice) utterance.voice = voice;

      utterance.onend = () => speakNextRef.current(locale);
      utterance.onerror = () => speakNextRef.current(locale);

      window.speechSynthesis.speak(utterance);
    };
  });

  const speak = useCallback((text: string, languageCode?: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const locale = (languageCode && BCP47_LOCALE[languageCode]) || "en-US";

    window.speechSynthesis.cancel();
    queueRef.current = splitIntoSpeakableChunks(text);
    setIsSpeaking(true);
    speakNextRef.current(locale);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    queueRef.current = [];
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speak, stop };
}
