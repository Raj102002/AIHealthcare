"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputState = "idle" | "listening" | "transcribing";

export type VoiceInputErrorType =
  | "permission-denied"
  | "no-microphone"
  | "network-error"
  | "empty-transcript"
  | "unknown";

export interface VoiceInputError {
  type: VoiceInputErrorType;
  message: string;
}

const ERROR_MESSAGES: Record<VoiceInputErrorType, string> = {
  "permission-denied": "Microphone access was denied. Allow microphone access in your browser settings to use voice input.",
  "no-microphone": "No microphone was found on this device.",
  "network-error": "Lost connection while sending your recording. Check your connection and try again.",
  "empty-transcript": "Didn't catch that — no speech was detected. Try again.",
  unknown: "Something went wrong with voice input. Please try again.",
};

function buildError(type: VoiceInputErrorType): VoiceInputError {
  return { type, message: ERROR_MESSAGES[type] };
}

const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1500;
const HARD_CAP_MS = 60_000;

interface UseVoiceInputOptions {
  language?: string;
  onTranscript: (text: string) => void;
  onError: (error: VoiceInputError) => void;
}

export function useVoiceInput({ language, onTranscript, onError }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const hardCapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<VoiceInputState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const teardownAudioAnalysis = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (hardCapRef.current !== null) clearTimeout(hardCapRef.current);
    hardCapRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setLevel(0);
  }, []);

  const stopRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        onError(buildError("permission-denied"));
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        onError(buildError("no-microphone"));
      } else {
        onError(buildError("unknown"));
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = recorder;

    recorder.onstop = async () => {
      teardownAudioAnalysis();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setState("transcribing");

      try {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const formData = new FormData();
        formData.append("audio", blob, `recording.${extension}`);
        if (language) formData.append("language", language);

        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Transcription failed");

        const text = (data.text as string)?.trim();
        setState("idle");
        if (!text) onError(buildError("empty-transcript"));
        else onTranscript(text);
      } catch {
        setState("idle");
        onError(buildError("network-error"));
      }
    };

    recorder.start();
    setState("listening");

    // Voice activity detection: auto-stop after ~1.5s of silence, but only once
    // the user has actually spoken, so a slow start doesn't cut the recording off.
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      let hasSpoken = false;
      let silenceStart: number | null = null;
      let lastLevelUpdate = 0;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / data.length);

        const now = performance.now();
        if (now - lastLevelUpdate > 100) {
          setLevel(Math.min(1, rms * 6));
          lastLevelUpdate = now;
        }

        if (rms > SILENCE_RMS_THRESHOLD) {
          hasSpoken = true;
          silenceStart = null;
        } else if (hasSpoken) {
          if (silenceStart === null) silenceStart = now;
          else if (now - silenceStart > SILENCE_DURATION_MS) {
            stopRecorder();
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // VAD is a nice-to-have; recording still works via the manual stop button
      // and the hard cap below if AnalyserNode setup fails for any reason.
    }

    hardCapRef.current = setTimeout(stopRecorder, HARD_CAP_MS);
  }, [language, onTranscript, onError, stopRecorder, teardownAudioAnalysis]);

  const stop = useCallback(() => {
    if (stateRef.current !== "listening") return;
    stopRecorder();
  }, [stopRecorder]);

  useEffect(() => {
    return () => {
      teardownAudioAnalysis();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [teardownAudioAnalysis]);

  return { state, level, start, stop };
}
