// Replaces the illustrated-face avatar (components/TalkingAvatar.tsx) --
// this is a clinical tool generating a document a clinician reads; a stock
// cartoon face undercut that. Five bars, ascending height left to right, the
// third in assay as the one accent -- same mark in the header (as branding)
// and inline as Aura's turn indicator. `active` pulses opacity to signal
// "thinking/speaking" without implying a literal talking mouth; respects
// prefers-reduced-motion/data-low-stim via globals.css's global overrides
// since it's a plain CSS animation, not a JS loop.
const HEIGHTS = [0.35, 0.55, 0.75, 0.9, 1];

export default function SignalMark({
  size = 20,
  active = false,
  className = "",
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const barWidth = size * 0.12;
  const gap = size * 0.1;

  return (
    <div
      className={`inline-flex items-end shrink-0 ${className}`}
      style={{ height: size, gap }}
      role="img"
      aria-label="ClearSignal"
    >
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={`rounded-full ${i === 2 ? "bg-assay" : "bg-moss"} ${active ? "animate-pulse" : ""}`}
          style={{
            width: barWidth,
            height: size * h,
            animationDelay: active ? `${i * 120}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
