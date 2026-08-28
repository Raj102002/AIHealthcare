import { ShieldCheck, ShieldQuestion, ShieldAlert, ShieldX, Stethoscope } from "lucide-react";

// Renders lib/evidence-tier.ts's EvidenceTier as a small pill. Kept as a
// plain string prop (not importing the EvidenceTier type) so this component
// stays usable from anywhere a tier string shows up (an X-Evidence-Tier
// response header, a navigator card, etc.) without a shared-type import
// chain into client bundles that don't otherwise need lib/evidence-tier.ts.
const STYLES: Record<string, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  strong: { label: "Strong source support", className: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40", Icon: ShieldCheck },
  moderate: { label: "Moderate source support", className: "bg-teal-500/15 text-teal-300 border-teal-400/40", Icon: ShieldQuestion },
  limited: { label: "Limited evidence", className: "bg-amber-500/15 text-amber-300 border-amber-400/40", Icon: ShieldAlert },
  insufficient: { label: "Insufficient information", className: "bg-white/5 text-slate-400 border-white/15", Icon: ShieldX },
  no_diagnosis_applicable: { label: "No diagnosis", className: "bg-violet-500/15 text-violet-300 border-violet-400/40", Icon: Stethoscope },
};

export default function EvidenceTierBadge({ tier }: { tier: string | null | undefined }) {
  const style = tier ? STYLES[tier] : undefined;
  if (!style) return null;
  const { label, className, Icon } = style;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
