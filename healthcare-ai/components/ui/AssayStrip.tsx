import type { Message } from "@/types/health";

interface Props {
  messages: Message[];
}

// The signature element: a narrow rail left of the transcript where each
// Aura turn registers a horizontal band, sized and opacity-weighted by that
// answer's real retrieval confidence -- lib/evidence-tier.ts's
// computeEvidenceScore(), threaded through /api/chat's X-Evidence-Score
// header (app/chat/page.tsx) into message.evidenceScore. Not invented: this
// is the same [0,10] rerank score MonoLabel/GroundingMeter's tier is bucketed
// from, just rendered proportionally instead of as a 5-way bucket. Escalation
// turns (message.isEmergency) register in flare, full height, regardless of
// score -- an emergency response isn't "low confidence," it's a different
// thing entirely. Decorative relative to GroundingMeter's text (which is the
// accessible version of the same information), so aria-hidden. Hidden below
// 720px, where there's no room for a rail beside the transcript anyway.
export default function AssayStrip({ messages }: Props) {
  const turns = messages.filter((m) => m.role === "assistant" && m.id !== "welcome");
  if (turns.length === 0) return null;

  return (
    <div
      className="hidden min-[720px]:flex flex-col items-center gap-2 w-2 shrink-0 pt-1"
      aria-hidden="true"
    >
      {turns.map((m) => {
        const isEscalation = !!m.isEmergency;
        const score = m.evidenceScore ?? 0;
        const heightPx = isEscalation ? 28 : Math.max(6, (score / 10) * 36);
        const opacity = isEscalation ? 1 : Math.max(0.25, score / 10);
        return (
          <div
            key={m.id}
            className={`w-full rounded-full ${isEscalation ? "bg-flare" : "bg-assay"}`}
            style={{ height: heightPx, opacity }}
          />
        );
      })}
    </div>
  );
}
