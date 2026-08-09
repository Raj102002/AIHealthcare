// Field shapes match the ClearSignal build spec section 6.4 exactly.
export type DatePrecision = "exact" | "week" | "month" | "approximate";

export interface SymptomEntry {
  objectId?: string;
  occurredAt: string; // ISO date-time — when the symptom happened
  createdAt?: string; // Parse-managed — when it was logged; the gap is meaningful
  datePrecision: DatePrecision;
  symptomCode: string; // normalized, e.g. "arthralgia_migratory"
  symptomLabel: string; // the patient's own words
  severity: number; // 0-10
  bodySite?: string;
  durationMinutes?: number;
  notes: string; // encrypted client-side at rest; this type holds plaintext in memory
  context: string[];
}

export type FunctionDomain = "stairs" | "work_hours" | "driving" | "cooking" | "showering" | "leaving_home";

export interface FunctionEntry {
  objectId?: string;
  occurredAt: string;
  domain: FunctionDomain;
  value: number; // interpreted per-domain by the UI (e.g. hours, or 0/1 for boolean domains)
  note?: string;
}

export type AnchorType =
  | "tick_bite"
  | "rash_onset"
  | "travel"
  | "outdoor_exposure"
  | "antibiotic_start"
  | "antibiotic_end"
  | "symptom_onset"
  | "test_taken"
  | "test_result"
  | "personal_event";

export interface TimelineAnchor {
  objectId?: string;
  type: AnchorType;
  occurredAt: string;
  precision: DatePrecision;
  detail: string;
}

export interface ClinicalEncounter {
  objectId?: string;
  occurredAt: string;
  specialty: string;
  toldWhat: string;
  ruledOut: string[];
  testsOrdered: string[];
}

export const FUNCTION_DOMAIN_LABELS: Record<FunctionDomain, string> = {
  stairs: "Climbing stairs",
  work_hours: "Working a normal day",
  driving: "Driving",
  cooking: "Cooking a meal",
  showering: "Showering/bathing",
  leaving_home: "Leaving the house",
};

export const ANCHOR_TYPE_LABELS: Record<AnchorType, string> = {
  tick_bite: "Tick bite",
  rash_onset: "Rash appeared",
  travel: "Travel",
  outdoor_exposure: "Outdoor activity",
  antibiotic_start: "Started antibiotics",
  antibiotic_end: "Finished antibiotics",
  symptom_onset: "Symptoms began",
  test_taken: "Test taken",
  test_result: "Test result received",
  personal_event: "Personal event (job, move, holiday, etc.)",
};
