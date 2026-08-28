import type { ConditionConfig } from "@/lib/conditions/types";
import { LYME_CONFIG } from "@/lib/conditions/lyme.config";

// The single source of truth for which conditions this app knows about.
// Lyme is the only populated one -- see ConditionConfig.populated's comment
// for why a stub entry for a future condition (e.g. alpha-gal syndrome, the
// TOPx sprint's own next in-scope condition) belongs here only once it has a
// real corpus, not before.
export const CONDITIONS: ConditionConfig[] = [LYME_CONFIG];

export function getCondition(id: string): ConditionConfig | undefined {
  return CONDITIONS.find((c) => c.id === id);
}

export function populatedConditions(): ConditionConfig[] {
  return CONDITIONS.filter((c) => c.populated);
}
