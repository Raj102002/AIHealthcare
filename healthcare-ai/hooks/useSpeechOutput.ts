"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BCP47_LOCALE } from "@/lib/language-codes";
import { sanitizeForSpeech, splitIntoSentences } from "@/lib/speech-sanitize";

// A single silent sample, used to unlock <audio> playback on iOS Safari when
// called from the same user gesture that starts recording.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function getVoiceForLocale(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.toLowerCase() === locale.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()))
  );
}

export function useSpeechOutput() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const localeRef = useRef("en-US");
  // Flips to false after a failed Groq TTS call so the rest of the turn falls
  // back to the browser directly instead of retrying (and failing) every sentence.
  const useGroqRef = useRef(true);
  const activeStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    audioElRef.current = new Audio();
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  const unlock = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    el.src = SILENT_WAV;
    el.play().catch(() => {});
  }, []);

  const speakGroq = useCallback(async (text: string): Promise<void> => {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("TTS request failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const el = audioElRef.current;
    if (!el) throw new Error("Audio element not ready");
    el.src = url;

    await new Promise<void>((resolve, reject) => {
      activeStopRef.current = () => {
        el.pause();
        resolve();
      };
      el.onended = () => {
        URL.revokeObjectURL(url);
        activeStopRef.current = null;
        resolve();
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        activeStopRef.current = null;
        reject(new Error("Playback failed"));
      };
      el.play().catch(reject);
    });
  }, []);

  const speakBrowser = useCallback((text: string, locale: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      const voice = getVoiceForLocale(locale);
      if (voice) utterance.voice = voice;

      activeStopRef.current = () => {
        window.speechSynthesis.cancel();
        resolve();
      };
      utterance.onend = () => {
        activeStopRef.current = null;
        resolve();
      };
      utterance.onerror = () => {
        activeStopRef.current = null;
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    setIsSpeaking(true);

    while (playingRef.current && queueRef.current.length > 0) {
      const sentence = queueRef.current.shift();
      if (!sentence) continue;
      try {
        if (useGroqRef.current) {
          await speakGroq(sentence);
        } else {
          await speakBrowser(sentence, localeRef.current);
        }
      } catch {
        useGroqRef.current = false;
        if (playingRef.current) await speakBrowser(sentence, localeRef.current);
      }
    }

    playingRef.current = false;
    setIsSpeaking(false);
  }, [speakGroq, speakBrowser]);

  const beginStream = useCallback((languageCode?: string) => {
    localeRef.current = (languageCode && BCP47_LOCALE[languageCode]) || "en-US";
    useGroqRef.current = true;
  }, []);

  const enqueueSentence = useCallback(
    (rawText: string) => {
      const clean = sanitizeForSpeech(rawText);
      if (!clean) return;
      queueRef.current.push(clean);
      void processQueue();
    },
    [processQueue]
  );

  // For speaking an already-complete message (e.g. the "read aloud" button).
  const speak = useCallback(
    (rawText: string, languageCode?: string) => {
      beginStream(languageCode);
      const clean = sanitizeForSpeech(rawText);
      if (!clean) return;
      const sentences = splitIntoSentences(clean);
      queueRef.current.push(...(sentences.length ? sentences : [clean]));
      void processQueue();
    },
    [beginStream, processQueue]
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    playingRef.current = false;
    activeStopRef.current?.();
    activeStopRef.current = null;
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speak, beginStream, enqueueSentence, stop, unlock };
}
