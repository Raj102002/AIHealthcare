"use client";

import { Feather } from "lucide-react";
import { useLowStimMode } from "@/lib/low-stim";

export default function LowStimToggle() {
  const { enabled, toggle } = useLowStimMode();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label="Toggle low-stimulation mode: reduced motion, muted colors, larger tap targets"
      title={enabled ? "Turn off low-stimulation mode" : "Turn on low-stimulation mode"}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
        enabled ? "text-assay" : "text-moss hover:text-bone hover:bg-rule"
      }`}
    >
      <Feather className="w-4 h-4" />
      <span className="hidden sm:inline">Calm mode</span>
    </button>
  );
}
