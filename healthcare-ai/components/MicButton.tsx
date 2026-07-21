"use client";

import { Mic, Square, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/hooks/useVoiceInput";

interface Props {
  language?: string;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export default function MicButton({ language, onTranscript, disabled }: Props) {
  const { isRecording, isTranscribing, start, stop } = useVoiceInput({ language });

  async function handleClick() {
    if (isRecording) {
      try {
        const text = await stop();
        if (text.trim()) onTranscript(text);
      } catch (err) {
        console.error("Transcription failed:", err);
      }
      return;
    }

    try {
      await start();
    } catch (err) {
      console.error("Microphone access failed:", err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isTranscribing}
      title={isRecording ? "Stop recording" : "Ask by voice"}
      className={`p-2.5 rounded-xl transition-colors shrink-0 ${
        isRecording
          ? "bg-red-50 hover:bg-red-100 text-red-600 animate-pulse"
          : "bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50"
      }`}
    >
      {isTranscribing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isRecording ? (
        <Square className="w-4 h-4" fill="currentColor" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}
