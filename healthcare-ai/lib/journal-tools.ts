// Real agentic AI feature (Agentic AI & RAG — tool/function calling, multi-step
// task design, agent orchestration). This is the feature named as the natural
// candidate in design.md's honesty note about the rest of the app being a
// fixed pipeline, not an agent: "search my journal for patterns."
//
// Tools operate on journal data the client already fetched via
// lib/journal-client.ts and sent in the request body — the agent route itself
// never queries Back4App directly (same pattern app/api/handoff-narrative
// already uses: the server never independently re-authenticates as the user,
// it works with data the authenticated client already has and provided).
import type { SymptomEntry, FunctionEntry, TimelineAnchor, ClinicalEncounter } from "@/types/journal";

export interface JournalData {
  symptoms: SymptomEntry[];
  functionEntries: FunctionEntry[];
  anchors: TimelineAnchor[];
  encounters: ClinicalEncounter[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---- Tool implementations ----

function listSymptoms(data: JournalData, args: { label_contains?: string; since?: string; until?: string }) {
  let results = data.symptoms;
  if (args.label_contains) {
    const needle = args.label_contains.toLowerCase();
    results = results.filter((s) => s.symptomLabel.toLowerCase().includes(needle));
  }
  if (args.since) results = results.filter((s) => s.occurredAt >= args.since!);
  if (args.until) results = results.filter((s) => s.occurredAt <= args.until!);
  return results
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((s) => ({ date: s.occurredAt.slice(0, 10), label: s.symptomLabel, severity: s.severity, bodySite: s.bodySite ?? null }));
}

function getSeverityTrend(data: JournalData, args: { symptom_label: string }) {
  const needle = args.symptom_label.toLowerCase();
  const matches = data.symptoms
    .filter((s) => s.symptomLabel.toLowerCase().includes(needle))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (matches.length === 0) return { found: false, points: [] };

  const points = matches.map((s) => ({ date: s.occurredAt.slice(0, 10), severity: s.severity }));
  if (matches.length < 3) return { found: true, points, trend: "not enough data points for a trend" };

  const t0 = new Date(matches[0].occurredAt).getTime();
  const xs = matches.map((s) => (new Date(s.occurredAt).getTime() - t0) / (24 * 60 * 60 * 1000));
  const ys = matches.map((s) => s.severity);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopePerWeek = den === 0 ? 0 : Math.round(((num / den) * 7) * 100) / 100;
  return { found: true, points, slopePerWeekOfSeverity: slopePerWeek };
}

function getFunctionImpact(data: JournalData, args: { domain?: string }) {
  const filtered = args.domain ? data.functionEntries.filter((f) => f.domain === args.domain) : data.functionEntries;
  const byDomain = new Map<string, { unable: number; total: number }>();
  for (const f of filtered) {
    const bucket = byDomain.get(f.domain) ?? { unable: 0, total: 0 };
    bucket.total++;
    if (!f.value) bucket.unable++;
    byDomain.set(f.domain, bucket);
  }
  return [...byDomain.entries()].map(([domain, b]) => ({ domain, unableCount: b.unable, totalCount: b.total }));
}

function listAnchors(data: JournalData, args: { type?: string }) {
  const filtered = args.type ? data.anchors.filter((a) => a.type === args.type) : data.anchors;
  return filtered
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((a) => ({ date: a.occurredAt.slice(0, 10), type: a.type, precision: a.precision, detail: a.detail }));
}

function listEncounters(data: JournalData, args: { specialty_contains?: string }) {
  let filtered = data.encounters;
  if (args.specialty_contains) {
    const needle = args.specialty_contains.toLowerCase();
    filtered = filtered.filter((e) => e.specialty.toLowerCase().includes(needle));
  }
  return filtered
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((e) => ({
      date: e.occurredAt.slice(0, 10),
      specialty: e.specialty,
      toldWhat: e.toldWhat,
      ruledOut: e.ruledOut,
      treatmentsTried: e.treatmentsTried,
    }));
}

function getSymptomFreeInterval(data: JournalData, args: { symptom_label: string }) {
  const needle = args.symptom_label.toLowerCase();
  const matches = data.symptoms
    .filter((s) => s.symptomLabel.toLowerCase().includes(needle))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (matches.length < 2) return { found: matches.length > 0, medianIntervalDays: null };
  const gaps: number[] = [];
  for (let i = 1; i < matches.length; i++) {
    gaps.push((new Date(matches[i].occurredAt).getTime() - new Date(matches[i - 1].occurredAt).getTime()) / (24 * 60 * 60 * 1000));
  }
  return { found: true, medianIntervalDays: Math.round(median(gaps) * 10) / 10 };
}

// ---- Tool registry: JSON Schema definitions Groq needs + the dispatcher ----

export const JOURNAL_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_symptoms",
      description: "List logged symptom entries, optionally filtered by label substring and/or date range.",
      parameters: {
        type: "object",
        properties: {
          label_contains: { type: "string", description: "Case-insensitive substring to match against the symptom's own label, e.g. 'joint'." },
          since: { type: "string", description: "ISO date, inclusive lower bound." },
          until: { type: "string", description: "ISO date, inclusive upper bound." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_severity_trend",
      description: "Get the date-ordered severity history and computed trend (points per week) for a specific symptom.",
      parameters: {
        type: "object",
        properties: { symptom_label: { type: "string", description: "Substring to match against symptom labels, e.g. 'fatigue'." } },
        required: ["symptom_label"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_function_impact",
      description: "Get how often the patient was unable to perform a function domain (stairs, work_hours, driving, cooking, showering, leaving_home).",
      parameters: {
        type: "object",
        properties: { domain: { type: "string", description: "Optional: one specific domain. Omit for all domains." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_anchors",
      description: "List timeline anchors (exposures, treatment starts/ends, test events, personal events), optionally filtered by type.",
      parameters: {
        type: "object",
        properties: { type: { type: "string", description: "Optional anchor type filter, e.g. 'tick_bite', 'antibiotic_start'." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_encounters",
      description: "List clinical encounters, optionally filtered by specialty substring.",
      parameters: {
        type: "object",
        properties: { specialty_contains: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_symptom_free_interval",
      description: "Get the median number of days between logged occurrences of a specific symptom (how episodic it is).",
      parameters: {
        type: "object",
        properties: { symptom_label: { type: "string" } },
        required: ["symptom_label"],
      },
    },
  },
];

export function dispatchTool(name: string, args: Record<string, unknown>, data: JournalData): unknown {
  switch (name) {
    case "list_symptoms":
      return listSymptoms(data, args as { label_contains?: string; since?: string; until?: string });
    case "get_severity_trend":
      return getSeverityTrend(data, args as { symptom_label: string });
    case "get_function_impact":
      return getFunctionImpact(data, args as { domain?: string });
    case "list_anchors":
      return listAnchors(data, args as { type?: string });
    case "list_encounters":
      return listEncounters(data, args as { specialty_contains?: string });
    case "get_symptom_free_interval":
      return getSymptomFreeInterval(data, args as { symptom_label: string });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
