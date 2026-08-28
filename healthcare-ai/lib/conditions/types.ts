// The condition-config shape this app was originally specced to have (see
// plan.md's "condition profile" description) but never built. This is the
// minimal real slice of it: enough for ingestion to be condition-scoped
// instead of hardcoded to Lyme's corpus/data paths. Red-flag rules and the
// vocabulary map stay their own standalone modules for now (lib/red-flag.ts,
// lib/vocabulary-map.ts) rather than being pulled into this config -- they
// get parametrized by condition only when a second condition actually needs
// different rules, not speculatively.
export interface ConditionConfig {
  id: string;
  label: string;
  // Both paths are relative to the healthcare-ai project root.
  corpusDir: string;
  dataDir: string;
  disclaimer: string;
  // False for a stub config (e.g. a future condition whose corpus/data
  // directories don't exist yet). The project's own rule, carried over from
  // plan.md: never fake clinical content for a condition nobody researched.
  // Ingestion and retrieval skip any condition where this is false.
  populated: boolean;
}
