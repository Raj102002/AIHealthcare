"use client";

import { useCallback, useRef, useState } from "react";

interface UseVoiceInputOptions {
  language?: string;
}

export function useVoiceInput({ language }: UseVoiceInputOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        reject(new Error("Not recording"));
        return;
      }

      recorder.onstop = async () => {
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setIsTranscribing(true);
        try {
          // Safari's MediaRecorder encodes to mp4/aac, not webm -- use whatever the
          // recorder actually produced so the filename extension matches the bytes.
          const mimeType = recorder.mimeType || "audio/webm";
          const extension = mimeType.includes("mp4")
            ? "mp4"
            : mimeType.includes("ogg")
            ? "ogg"
            : "webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const formData = new FormData();
          formData.append("audio", blob, `recording.${extension}`);
          if (language) formData.append("language", language);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed");
          resolve(data.text as string);
        } catch (err) {
          reject(err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.stop();
    });
  }, [language]);

  return { isRecording, isTranscribing, start, stop };
}
