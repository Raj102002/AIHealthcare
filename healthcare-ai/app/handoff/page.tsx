"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, NotebookPen, LogOut, Loader2, Printer } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import {
  getSymptomEntries,
  getFunctionEntries,
  getTimelineAnchors,
  getClinicalEncounters,
  getRashPhotos,
  type RashPhotoRecord,
} from "@/lib/journal-client";
import { analyzeJournal, type HandoffAnalysis } from "@/lib/handoff-analysis";
import { buildTemplatedNarrative, selectQuestions } from "@/lib/handoff-narrative";
import { ANCHOR_TYPE_LABELS, FUNCTION_DOMAIN_LABELS } from "@/types/journal";
import type { SymptomEntry, TimelineAnchor, ClinicalEncounter } from "@/types/journal";

export default function HandoffPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [symptoms, setSymptoms] = useState<SymptomEntry[]>([]);
  const [anchors, setAnchors] = useState<TimelineAnchor[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [photos, setPhotos] = useState<RashPhotoRecord[]>([]);
  const [analysis, setAnalysis] = useState<HandoffAnalysis | null>(null);
  const [narrative, setNarrative] = useState("");
  const [narrativeSource, setNarrativeSource] = useState<"generated" | "templated" | null>(null);

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [symptomEntries, functionEntries, anchorEntries, encounterEntries, rashPhotos] = await Promise.all([
        getSymptomEntries(),
        getFunctionEntries(),
        getTimelineAnchors(),
        getClinicalEncounters(),
        getRashPhotos(),
      ]);
      setSymptoms(symptomEntries);
      setAnchors(anchorEntries);
      setEncounters(encounterEntries);
      setPhotos(rashPhotos);

      const computed = analyzeJournal(symptomEntries, functionEntries, anchorEntries);
      setAnalysis(computed);

      try {
        const res = await fetch("/api/handoff-narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis: computed }),
        });
        const data = await res.json();
        if (res.ok) {
          setNarrative(data.narrative);
          setNarrativeSource(data.source);
        } else {
          setNarrative(buildTemplatedNarrative(computed));
          setNarrativeSource("templated");
        }
      } catch {
        setNarrative(buildTemplatedNarrative(computed));
        setNarrativeSource("templated");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per mount)
    void load();
  }, [ready, load]);

  async function handleLogout() {
    await logoutUser();
    router.replace("/");
  }

  if (!ready || loading || !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  const timelineEvents = [
    ...anchors.map((a) => ({ date: a.occurredAt, precision: a.precision, label: `${ANCHOR_TYPE_LABELS[a.type]}: ${a.detail}` })),
    ...analysis.frequency.map((f) => ({ date: f.firstSeen, precision: "exact" as const, label: `First logged: "${f.symptomLabel}"` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const questions = selectQuestions(analysis);
  const generatedDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          .no-print { display: none !important; }
          body { font: 10pt/1.4 Georgia, serif; color: #000; background: #fff; }
          .section { break-inside: avoid; }
          .handoff-doc { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="font-semibold text-slate-900">ClearSignal</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/journal"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <NotebookPen className="w-4 h-4" />
            <span className="hidden sm:inline">Journal</span>
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="handoff-doc bg-white border border-slate-200 shadow-sm rounded-2xl p-8 space-y-6">
          {/* 1. Header */}
          <div className="section border-b border-slate-200 pb-4">
            <h1 className="text-lg font-bold text-slate-900">Patient Symptom Summary</h1>
            <p className="text-xs text-slate-500 mt-1">
              Generated {generatedDate} · covers {analysis.coverage.spanDays} day span · {symptoms.length} symptom
              entries logged
            </p>
          </div>

          {/* 2. Timeline */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Timeline</h2>
            {timelineEvents.length === 0 ? (
              <p className="text-xs text-slate-400">No timeline events logged.</p>
            ) : (
              <ul className="space-y-1.5 border-l-2 border-slate-200 pl-3">
                {timelineEvents.map((ev, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">
                      {new Date(ev.date).toLocaleDateString()}
                      {ev.precision !== "exact" && ` (${ev.precision})`}
                    </span>
                    {" — "}
                    {ev.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 3. Symptom table */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Symptoms</h2>
            {analysis.frequency.length === 0 ? (
              <p className="text-xs text-slate-400">No symptoms logged.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-200">
                    <th className="py-1 pr-2">Symptom</th>
                    <th className="py-1 pr-2">First</th>
                    <th className="py-1 pr-2">Last</th>
                    <th className="py-1 pr-2">Count</th>
                    <th className="py-1 pr-2">Median severity</th>
                    <th className="py-1">Sites</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.frequency.map((f) => (
                    <tr key={f.symptomCode} className="border-b border-slate-100">
                      <td className="py-1 pr-2 text-slate-800">{f.symptomLabel}</td>
                      <td className="py-1 pr-2 text-slate-500">{new Date(f.firstSeen).toLocaleDateString()}</td>
                      <td className="py-1 pr-2 text-slate-500">{new Date(f.lastSeen).toLocaleDateString()}</td>
                      <td className="py-1 pr-2 text-slate-500">{f.count}</td>
                      <td className="py-1 pr-2 text-slate-500">{f.medianSeverity}/10</td>
                      <td className="py-1 text-slate-500">{f.sites.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 4. Function impact */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Function Impact</h2>
            {analysis.functionImpact.length === 0 ? (
              <p className="text-xs text-slate-400">No function check-ins logged.</p>
            ) : (
              <ul className="text-xs text-slate-600 space-y-1">
                {analysis.functionImpact.map((f) => (
                  <li key={f.domain}>
                    {FUNCTION_DOMAIN_LABELS[f.domain]}: unable or difficult on {f.unableCount} of {f.totalCount} logged days.
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 5. Patterns */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Patterns</h2>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              {analysis.migratory.map((m) => (
                <li key={m.symptomCode}>
                  &quot;{m.symptomLabel}&quot; was recorded at more than one body site: {m.sites.join(", ")}.
                </li>
              ))}
              {analysis.episodic
                .filter((e) => e.medianSymptomFreeIntervalDays !== null)
                .map((e) => (
                  <li key={e.symptomCode}>
                    &quot;{e.symptomLabel}&quot; recurred with a median interval of {e.medianSymptomFreeIntervalDays} days between logged occurrences.
                  </li>
                ))}
              {analysis.coOccurrence.slice(0, 5).map((c) => (
                <li key={c.date}>
                  On {new Date(c.date).toLocaleDateString()}, these were logged together: {c.symptomLabels.join(", ")}.
                </li>
              ))}
              {analysis.trend
                .filter((t) => Math.abs(t.slopePerWeek) > 0.1)
                .map((t) => (
                  <li key={t.symptomCode}>
                    &quot;{t.symptomLabel}&quot; severity trended {t.slopePerWeek > 0 ? "up" : "down"} by {Math.abs(t.slopePerWeek)} points/week in this log.
                  </li>
                ))}
              {analysis.migratory.length === 0 && analysis.coOccurrence.length === 0 && analysis.trend.length === 0 && (
                <li>Not enough data logged yet to identify a pattern.</li>
              )}
            </ul>
          </div>

          {/* 6. Narrative summary */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Summary</h2>
            <p className="text-xs text-slate-700 leading-relaxed">{narrative}</p>
            {narrativeSource === "templated" && (
              <p className="no-print text-[10px] text-slate-400 mt-1">(Generated from a fixed template — the AI-written version did not pass validation this time or wasn&apos;t available.)</p>
            )}
          </div>

          {/* 7. Rash photos */}
          {photos.length > 0 && (
            <div className="section">
              <h2 className="text-sm font-bold text-slate-900 mb-2">Rash Photo Series</h2>
              <div className="flex gap-2 flex-wrap">
                {photos.map((p) => (
                  <div key={p.objectId}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Parse.File URLs are dynamic/external */}
                    <img src={p.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    <p className="text-[10px] text-slate-400 text-center mt-0.5">{new Date(p.occurredAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. Encounters and exclusions */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Encounters and Exclusions</h2>
            {encounters.length === 0 ? (
              <p className="text-xs text-slate-400">No clinical encounters logged.</p>
            ) : (
              <ul className="text-xs text-slate-600 space-y-1.5">
                {encounters.map((enc) => (
                  <li key={enc.objectId}>
                    <span className="font-medium text-slate-800">
                      {new Date(enc.occurredAt).toLocaleDateString()} — {enc.specialty}
                    </span>
                    {enc.ruledOut.length > 0 && <span>: ruled out {enc.ruledOut.join(", ")}</span>}
                    {enc.testsOrdered.length > 0 && (
                      <div className="text-slate-500">Tests ordered: {enc.testsOrdered.join(", ")}</div>
                    )}
                    {enc.treatmentsTried.length > 0 && (
                      <div className="text-slate-500">Treatments tried (patient-reported): {enc.treatmentsTried.join(", ")}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 9. Questions to ask */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Questions to Ask</h2>
            {questions.length === 0 ? (
              <p className="text-xs text-slate-400">No pattern-matched questions yet — log more entries.</p>
            ) : (
              <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 10. Sources */}
          <div className="section">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Sources</h2>
            <p className="text-xs text-slate-500">
              This document summarizes data entered directly by the patient through this application&apos;s symptom
              journal and function tracker. No external sources were used to generate the summary above; all figures
              are computed directly from the logged entries.
            </p>
          </div>

          {/* 11. Footer */}
          <div className="section border-t border-slate-200 pt-3 text-center">
            <p className="text-[10px] text-slate-400">Patient-generated record. Not a diagnosis. Not clinically validated.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
