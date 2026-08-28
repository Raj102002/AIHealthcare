"use client";

import { Phone, X, AlertTriangle } from "lucide-react";
import { EMERGENCY_RESOURCES } from "@/lib/emergency-detector";
import MonoLabel from "./MonoLabel";

// flare's one and only job in this system: escalation. Solid flare
// background, not glassed or subtle -- this stays exactly as loud as the
// design system's own rule demands, regardless of how quiet everything
// around it is. Replaces components/EmergencyBanner.tsx, restyled onto the
// new tokens; same content and behavior (dismissible, real tel: links to
// the same three resources), animate-pulse-once unchanged.
export default function EscalationCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-flare text-pitch px-4 py-3 animate-pulse-once">
      <div className="max-w-3xl mx-auto flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <MonoLabel className="text-pitch">Emergency Warning Detected</MonoLabel>
            <p className="font-display font-semibold text-[15px] mt-1 leading-snug">
              Based on what you described, please seek immediate help. Do not wait.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-pitch hover:opacity-70 transition-opacity shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-3xl mx-auto mt-3 flex flex-wrap gap-2">
        {EMERGENCY_RESOURCES.map((resource) => (
          <a
            key={resource.number}
            href={`tel:${resource.number.replace(/-/g, "")}`}
            className="flex items-center gap-2 bg-pitch text-flare font-mono text-xs px-3 py-1.5 rounded-md hover:opacity-85 transition-opacity"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>
              {resource.name}: {resource.number}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
