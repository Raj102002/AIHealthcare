// Deterministic analysis for the clinician handoff document (ClearSignal build
// spec, section 6.9). Same input always produces the same output, and every
// line is explainable — this runs entirely in code, never through an LLM.
import type { SymptomEntry, FunctionEntry, TimelineAnchor, FunctionDomain } from "@/types/journal";

export interface SymptomFrequency {
  symptomCode: string;
  symptomLabel: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  medianSeverity: number;
  sites: string[];
}

export interface MigratorySymptom {
  symptomCode: string;
  symptomLabel: string;
  sites: string[];
}

export interface EpisodicPattern {
  symptomCode: string;
  symptomLabel: string;
  medianSymptomFreeIntervalDays: number | null;
}

export interface CoOccurrenceDay {
  date: string;
  symptomLabels: string[];
}

export interface SeverityTrend {
  symptomCode: string;
  symptomLabel: string;
  slopePerWeek: number;
}

export interface FunctionImpact {
  domain: FunctionDomain;
  unableCount: number;
  totalCount: number;
}

export interface HandoffAnalysis {
  frequency: SymptomFrequency[];
  migratory: MigratorySymptom[];
  episodic: EpisodicPattern[];
  coOccurrence: CoOccurrenceDay[];
  trend: SeverityTrend[];
  functionImpact: FunctionImpact[];
  latency: { firstSymptomAfterExposureDays: number | null; totalDurationDays: number };
  coverage: { loggedDays: number; spanDays: number; retrospectiveShare: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

// Ordinary least squares slope of severity vs. days-since-first-entry, scaled
// to "per week" so the number is readable at a glance.
function severitySlopePerWeek(points: { days: number; severity: number }[]): number {
  const n = points.length;
  if (n < 3) return 0;
  const meanX = points.reduce((s, p) => s + p.days, 0) / n;
  const meanY = points.reduce((s, p) => s + p.severity, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.days - meanX) * (p.severity - meanY);
    den += (p.days - meanX) ** 2;
  }
  if (den === 0) return 0;
  return (num / den) * 7;
}

export function analyzeJournal(
  symptoms: SymptomEntry[],
  functionEntries: FunctionEntry[],
  anchors: TimelineAnchor[]
): HandoffAnalysis {
  const bySymptom = groupBy(symptoms, (s) => s.symptomCode);

  const frequency: SymptomFrequency[] = [...bySymptom.entries()].map(([code, entries]) => {
    const sorted = [...entries].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return {
      symptomCode: code,
      symptomLabel: sorted[0].symptomLabel,
      count: entries.length,
      firstSeen: sorted[0].occurredAt,
      lastSeen: sorted[sorted.length - 1].occurredAt,
      medianSeverity: median(entries.map((e) => e.severity)),
      sites: [...new Set(entries.map((e) => e.bodySite).filter((s): s is string => Boolean(s)))],
    };
  });

  const migratory: MigratorySymptom[] = frequency
    .filter((f) => f.sites.length > 1)
    .map((f) => ({ symptomCode: f.symptomCode, symptomLabel: f.symptomLabel, sites: f.sites }));

  const episodic: EpisodicPattern[] = [...bySymptom.entries()].map(([code, entries]) => {
    const sorted = [...entries].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (sorted.length < 2) return { symptomCode: code, symptomLabel: sorted[0].symptomLabel, medianSymptomFreeIntervalDays: null };
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i].occurredAt).getTime() - new Date(sorted[i - 1].occurredAt).getTime()) / DAY_MS);
    }
    return { symptomCode: code, symptomLabel: sorted[0].symptomLabel, medianSymptomFreeIntervalDays: Math.round(median(gaps) * 10) / 10 };
  });

  const byDay = groupBy(symptoms, (s) => dayKey(s.occurredAt) as string);
  const coOccurrence: CoOccurrenceDay[] = [...byDay.entries()]
    .filter(([, entries]) => new Set(entries.map((e) => e.symptomCode)).size > 1)
    .map(([date, entries]) => ({ date, symptomLabels: [...new Set(entries.map((e) => e.symptomLabel))] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const trend: SeverityTrend[] = [...bySymptom.entries()]
    .filter(([, entries]) => entries.length >= 3)
    .map(([code, entries]) => {
      const sorted = [...entries].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const t0 = new Date(sorted[0].occurredAt).getTime();
      const points = sorted.map((e) => ({ days: (new Date(e.occurredAt).getTime() - t0) / DAY_MS, severity: e.severity }));
      return { symptomCode: code, symptomLabel: sorted[0].symptomLabel, slopePerWeek: Math.round(severitySlopePerWeek(points) * 100) / 100 };
    });

  const byDomain = groupBy(functionEntries, (f) => f.domain);
  const functionImpact: FunctionImpact[] = [...byDomain.entries()].map(([domain, entries]) => ({
    domain,
    unableCount: entries.filter((e) => !e.value).length,
    totalCount: entries.length,
  }));

  const exposureAnchors = anchors.filter((a) => a.type === "tick_bite" || a.type === "outdoor_exposure");
  const earliestExposure = exposureAnchors.length
    ? exposureAnchors.reduce((min, a) => (a.occurredAt < min ? a.occurredAt : min), exposureAnchors[0].occurredAt)
    : null;
  const sortedSymptomsByDate = [...symptoms].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const firstSymptomAfterExposureDays =
    earliestExposure && sortedSymptomsByDate.length > 0
      ? Math.round((new Date(sortedSymptomsByDate[0].occurredAt).getTime() - new Date(earliestExposure).getTime()) / DAY_MS)
      : null;
  const totalDurationDays =
    sortedSymptomsByDate.length > 0
      ? Math.round(
          (new Date(sortedSymptomsByDate[sortedSymptomsByDate.length - 1].occurredAt).getTime() -
            new Date(sortedSymptomsByDate[0].occurredAt).getTime()) /
            DAY_MS
        )
      : 0;

  const allEntryDates = [...symptoms.map((s) => s.occurredAt), ...functionEntries.map((f) => f.occurredAt)];
  const loggedDays = new Set(allEntryDates.map(dayKey)).size;
  const spanDays =
    allEntryDates.length > 0
      ? Math.round(
          (Math.max(...allEntryDates.map((d) => new Date(d).getTime())) -
            Math.min(...allEntryDates.map((d) => new Date(d).getTime()))) /
            DAY_MS
        ) + 1
      : 0;
  const retrospective = symptoms.filter((s) => {
    if (!s.createdAt) return false;
    const gapDays = (new Date(s.createdAt).getTime() - new Date(s.occurredAt).getTime()) / DAY_MS;
    return gapDays > 7;
  }).length;
  const retrospectiveShare = symptoms.length > 0 ? Math.round((retrospective / symptoms.length) * 100) / 100 : 0;

  return {
    frequency,
    migratory,
    episodic,
    coOccurrence,
    trend,
    functionImpact,
    latency: { firstSymptomAfterExposureDays, totalDurationDays },
    coverage: { loggedDays, spanDays, retrospectiveShare },
  };
}
