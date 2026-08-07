"use client";

import { Mic, X } from "lucide-react";

interface Props {
  onDismiss: () => void;
}

export default function VoiceDisclosure({ onDismiss }: Props) {
  return (
    <div className="bg-slate-800 text-white px-4 py-3 shadow-lg" role="alertdialog" aria-label="Voice input disclosure">
      <div className="max-w-2xl mx-auto flex items-start gap-3">
        <Mic className="w-5 h-5 mt-0.5 shrink-0 text-teal-300" />
        <div className="flex-1">
          <p className="text-sm font-medium">Voice input uses a third-party service</p>
          <p className="text-xs text-slate-300 mt-0.5">
            When you use the microphone, your recording is sent to Groq to be transcribed to text, then
            discarded — it is not stored. Only the resulting text is saved as part of your conversation.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-white transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
