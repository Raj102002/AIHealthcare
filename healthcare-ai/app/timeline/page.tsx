"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Clock, MapPin, Activity, Stethoscope } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import {
  getSymptomEntries,
  getTimelineAnchors,
  getClinicalEncounters,
} from "@/lib/journal-client";
import type { SymptomEntry, TimelineAnchor, ClinicalEncounter } from "@/types/journal";
import { ANCHOR_TYPE_LABELS } from "@/types/journal";

// One merged chronological view — exposure events (TimelineAnchor), symptom
// onset (SymptomEntry), and clinician encounters (ClinicalEncounter) folded
// into a single list, sorted by date. This is the "My Timeline" section the
// v2 spec asks for: combine exposure + symptom + test/treatment history into
// one chronological view, not three separate tabs. No new data source -- all
// three already exist (lib/journal-client.ts); this only merges and sorts.
type EventKind = "exposure" | "symptom" | "encounter";

interface TimelineEvent {
  date: string;
  precision?: string;
  kind: EventKind;
  label: string;
  detail?: string;
}

const KIND_ICON: Record<EventKind, typeof MapPin> = {
  exposure: MapPin,
  symptom: Activity,
  encounter: Stethoscope,
};

const KIND_COLOR: Record<EventKind, string> = {
  exposure: "text-purple-600 bg-purple-50 border-purple-100",
  symptom: "text-teal-600 bg-teal-50 border-teal-100",
  encounter: "text-amber-600 bg-amber-50 border-amber-100",
};

function buildTimeline(anchors: TimelineAnchor[], symptoms: SymptomEntry[], encounters: ClinicalEncounter[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...anchors.map((a) => ({
      date: a.occurredAt,
      precision: a.precision,
      kind: "exposure" as const,
      label: ANCHOR_TYPE_LABELS[a.type],
      detail: a.detail,
    })),
    ...symptoms.map((s) => ({
      date: s.occurredAt,
      precision: s.datePrecision,
      kind: "symptom" as const,
      label: s.symptomLabel,
      detail: `Severity ${s.severity}/10`,
    })),
    ...encounters.map((e) => ({
      date: e.occurredAt,
      kind: "encounter" as const,
      label: e.specialty,
      detail: [
        e.testsOrdered.length > 0 ? `Tests: ${e.testsOrdered.join(", ")}` : null,
        e.treatmentsTried.length > 0 ? `Treatments: ${e.treatmentsTried.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" — "),
    })),
  ];
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export default function TimelinePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [anchors, symptoms, encounters] = await Promise.all([
        getTimelineAnchors(),
        getSymptomEntries(),
        getClinicalEncounters(),
      ]);
      setEvents(buildTimeline(anchors, symptoms, encounters));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per mount)
    void load();
  }, [ready, load]);

  async function handleLogout() {
    await logoutUser();
    router.replace("/");
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
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
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Journal</span>
          </Link>
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
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">My Timeline</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Exposure events, symptom onset, and clinician encounters in one chronological view. Log more in{" "}
          <Link href="/journal" className="text-teal-600 hover:underline">
            My Symptoms
          </Link>
          .
        </p>

        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Nothing logged yet — start in My Symptoms.</p>
        ) : (
          <ul className="space-y-2 border-l-2 border-slate-200 ml-2 pl-4">
            {events.map((ev, i) => {
              const Icon = KIND_ICON[ev.kind];
              return (
                <li key={i} className="relative bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">{ev.label}</span>
                    <span className={`flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${KIND_COLOR[ev.kind]}`}>
                      <Icon className="w-3 h-3" />
                      {ev.kind}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {new Date(ev.date).toLocaleDateString()}
                    {ev.precision && ev.precision !== "exact" && ` (${ev.precision})`}
                  </div>
                  {ev.detail && <div className="text-xs text-slate-500 mt-1">{ev.detail}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
