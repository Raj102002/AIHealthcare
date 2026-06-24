"use client";

import { Phone, X, AlertTriangle } from "lucide-react";
import { EMERGENCY_RESOURCES } from "@/lib/emergency-detector";

interface Props {
  onDismiss: () => void;
}

export default function EmergencyBanner({ onDismiss }: Props) {
  return (
    <div className="bg-red-600 text-white px-4 py-3 shadow-lg animate-pulse-once">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-lg leading-tight">
                Emergency Warning Detected
              </p>
              <p className="text-red-100 text-sm mt-0.5">
                Based on what you described, please seek immediate help. Do not
                wait.
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-red-200 hover:text-white transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {EMERGENCY_RESOURCES.map((resource) => (
            <a
              key={resource.number}
              href={`tel:${resource.number.replace(/-/g, "")}`}
              className="flex items-center gap-2 bg-white text-red-700 font-semibold px-3 py-1.5 rounded-full text-sm hover:bg-red-50 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>
                {resource.name}: {resource.number}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
