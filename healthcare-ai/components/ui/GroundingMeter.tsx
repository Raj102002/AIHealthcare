import MonoLabel from "./MonoLabel";

// lib/evidence-tier.ts's EvidenceTier as a string, not the imported type --
// keeps this usable anywhere a tier string shows up (X-Evidence-Tier header,
// /api/test-context's response field) without pulling that module into
// every client bundle.
const TIER_LABELS: Record<string, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  limited: "Limited evidence",
  insufficient: "Insufficient evidence",
};

// flare is reserved for actual red-flag escalation only (see
// EscalationCard/Turn) -- a low grounding score is not an escalation, so
// weak evidence renders in moss, never flare. no_diagnosis_applicable (the
// red-flag path) renders nothing here; EscalationCard already covers that
// case louder than a meter could.
export default function GroundingMeter({
  tier,
  score,
}: {
  tier: string | null | undefined;
  score?: number | null;
}) {
  if (!tier || tier === "no_diagnosis_applicable" || !TIER_LABELS[tier]) return null;

  const toned = tier === "strong" || tier === "moderate";
  const pct = Math.max(0, Math.min(100, ((score ?? 0) / 10) * 100));

  return (
    <div className="inline-flex items-center gap-2">
      <MonoLabel className={toned ? "text-assay" : "text-moss"}>{TIER_LABELS[tier]}</MonoLabel>
      <div className="w-12 h-1 rounded-full bg-rule overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full ${toned ? "bg-assay" : "bg-moss"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
