"use client";

interface Props {
  active: boolean;
  label?: string;
}

export default function VoiceOrb({ active, label = "Speaking..." }: Props) {
  if (!active) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-teal-700">
      <div className="relative w-4 h-4 shrink-0">
        <span className="absolute inset-0 rounded-full bg-teal-500 animate-ping opacity-75" />
        <span className="relative block w-4 h-4 rounded-full bg-teal-600" />
      </div>
      <span>{label}</span>
    </div>
  );
}
