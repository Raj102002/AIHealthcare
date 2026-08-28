"use client";

import { Mic, Square, Loader2 } from "lucide-react";
import type { VoiceInputState } from "@/hooks/useVoiceInput";

interface Props {
  state: VoiceInputState;
  level: number;
  isSpeaking: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onBargeIn: () => void;
}

export default function MicButton({ state, level, isSpeaking, disabled, onStart, onStop, onBargeIn }: Props) {
  function handleClick() {
    if (isSpeaking) {
      onBargeIn();
      return;
    }
    if (state === "listening") {
      onStop();
      return;
    }
    if (state === "idle") {
      onStart();
    }
  }

  const label = isSpeaking
    ? "Stop speaking"
    : state === "listening"
    ? "Stop recording"
    : state === "transcribing"
    ? "Transcribing"
    : "Ask by voice";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "transcribing"}
      title={label}
      aria-label={label}
      aria-pressed={state === "listening"}
      className={`relative p-2.5 rounded-xl transition-colors shrink-0 ${
        state === "listening" || isSpeaking
          ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
          : "bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-50"
      }`}
    >
      {state === "listening" && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-xl bg-red-400 opacity-30"
          style={{ transform: `scale(${1 + level * 0.4})`, transition: "transform 100ms linear" }}
        />
      )}
      <span className="relative block">
        {state === "transcribing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isSpeaking || state === "listening" ? (
          <Square className="w-4 h-4" fill="currentColor" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </span>
    </button>
  );
}
