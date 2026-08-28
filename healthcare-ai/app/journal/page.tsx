"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart,
  MessageSquare,
  LogOut,
  Loader2,
  Activity,
  Gauge,
  MapPin,
  Stethoscope,
  Camera,
  Compass,
  FileText,
  TestTube2,
  Scale,
  Users,
  Trash2,
  Sparkles,
  Send,
} from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import LowStimToggle from "@/components/LowStimToggle";
import {
  saveSymptomEntry,
  getSymptomEntries,
  deleteSymptomEntry,
  saveFunctionEntry,
  getFunctionEntries,
  deleteFunctionEntry,
  saveTimelineAnchor,
  getTimelineAnchors,
  deleteTimelineAnchor,
  saveClinicalEncounter,
  getClinicalEncounters,
  deleteClinicalEncounter,
  saveRashPhoto,
  getRashPhotos,
  deleteRashPhoto,
  type RashPhotoRecord,
} from "@/lib/journal-client";
import type {
  SymptomEntry,
  FunctionEntry,
  TimelineAnchor,
  ClinicalEncounter,
  DatePrecision,
  FunctionDomain,
  AnchorType,
} from "@/types/journal";
import { FUNCTION_DOMAIN_LABELS, ANCHOR_TYPE_LABELS } from "@/types/journal";

type Tab = "symptoms" | "function" | "anchors" | "encounters" | "rash" | "exposure" | "ask";

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "symptoms", label: "Symptoms", icon: Activity },
  { id: "function", label: "Function", icon: Gauge },
  { id: "anchors", label: "Anchors", icon: MapPin },
  { id: "encounters", label: "Encounters", icon: Stethoscope },
  { id: "rash", label: "Rash Photos", icon: Camera },
  { id: "exposure", label: "Exposure", icon: Compass },
  { id: "ask", label: "Ask Your Journal", icon: Sparkles },
];

function slugifySymptom(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function JournalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("symptoms");

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

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
            href="/handoff"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Handoff Doc</span>
          </Link>
          <Link
            href="/chat"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </Link>
          <LowStimToggle />
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
        <h1 className="text-lg font-bold text-slate-900 mb-1">Symptom Journal</h1>
        <p className="text-sm text-slate-500 mb-4">
          Log symptoms, function, and context over time — including good days. Episodic illness looks continuous
          if only bad days get logged.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          <Link
            href="/test-context"
            className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
          >
            <TestTube2 className="w-3.5 h-3.5" />
            Test timing
          </Link>
          <Link
            href="/contested-territory"
            className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
          >
            <Scale className="w-3.5 h-3.5" />
            Persistent symptoms debate
          </Link>
          <Link
            href="/providers"
            className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            Find a provider / trial
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-5 border-b border-slate-200 pb-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  tab === t.id ? "bg-teal-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-teal-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "symptoms" && <SymptomsTab />}
        {tab === "function" && <FunctionTab />}
        {tab === "anchors" && <AnchorsTab />}
        {tab === "encounters" && <EncountersTab />}
        {tab === "rash" && <RashTab />}
        {tab === "exposure" && <ExposureTab />}
        {tab === "ask" && <AskTab />}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Wrapping the control inside <label> associates them implicitly (no id/
  // htmlFor needed), so screen readers announce the label and clicking it
  // focuses the control — same effect as explicit htmlFor, zero call-site changes.
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );
}

// ---- Symptoms ----

function SymptomsTab() {
  const [entries, setEntries] = useState<SymptomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [datePrecision, setDatePrecision] = useState<DatePrecision>("exact");
  const [severity, setSeverity] = useState(5);
  const [bodySite, setBodySite] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getSymptomEntries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per tab mount)
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await saveSymptomEntry({
        occurredAt: new Date(occurredAt).toISOString(),
        datePrecision,
        symptomCode: slugifySymptom(label),
        symptomLabel: label,
        severity,
        bodySite: bodySite || undefined,
        notes,
        context: [],
      });
      setLabel("");
      setBodySite("");
      setNotes("");
      setSeverity(5);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="What did you notice?">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. joints on fire, wiped out, pins and needles"
              required
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="When did it happen?">
              <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={inputClass} />
            </Field>
            <Field label="How sure are you of the date?">
              <select value={datePrecision} onChange={(e) => setDatePrecision(e.target.value as DatePrecision)} className={inputClass}>
                <option value="exact">Exact day</option>
                <option value="week">That week</option>
                <option value="month">That month</option>
                <option value="approximate">Rough guess</option>
              </select>
            </Field>
          </div>
          <Field label={`Severity: ${severity}/10`}>
            <input
              type="range"
              min={0}
              max={10}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <Field label="Body site (optional)">
            <input value={bodySite} onChange={(e) => setBodySite(e.target.value)} placeholder="e.g. left knee" className={inputClass} />
          </Field>
          <Field label="Notes (encrypted before it's stored)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
          </Field>
          <SubmitButton loading={saving} label="Log symptom" />
        </form>
      </Card>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.objectId} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="font-medium text-slate-800">{e.symptomLabel}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">
                    {new Date(e.occurredAt).toLocaleDateString()}
                    {e.datePrecision !== "exact" && ` (${e.datePrecision})`}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete this entry"
                    onClick={async () => {
                      if (!e.objectId) return;
                      await deleteSymptomEntry(e.objectId);
                      await load();
                    }}
                    className="text-slate-300 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Severity {e.severity}/10{e.bodySite && ` — ${e.bodySite}`}
              </div>
              {e.notes && <div className="text-xs text-slate-500 mt-1 italic">{e.notes}</div>}
            </li>
          ))}
          {entries.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No symptoms logged yet.</p>}
        </ul>
      )}
    </div>
  );
}

// ---- Function ----

function FunctionTab() {
  const [entries, setEntries] = useState<FunctionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [domain, setDomain] = useState<FunctionDomain>("stairs");
  const [able, setAble] = useState(true);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getFunctionEntries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per tab mount)
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFunctionEntry({ occurredAt: new Date().toISOString(), domain, value: able ? 1 : 0, note: note || undefined });
      setNote("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function logGoodDay() {
    setSaving(true);
    try {
      for (const d of Object.keys(FUNCTION_DOMAIN_LABELS) as FunctionDomain[]) {
        await saveFunctionEntry({ occurredAt: new Date().toISOString(), domain: d, value: 1 });
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs text-slate-500 mb-3">
          A fast check-in — including on good days. If only bad days get logged, symptom-free intervals become
          invisible.
        </p>
        <button
          onClick={logGoodDay}
          disabled={saving}
          className="w-full mb-4 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 text-sm font-medium transition-colors"
        >
          ✓ Today was a good day — log full function across the board
        </button>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Domain">
            <select value={domain} onChange={(e) => setDomain(e.target.value as FunctionDomain)} className={inputClass}>
              {(Object.keys(FUNCTION_DOMAIN_LABELS) as FunctionDomain[]).map((d) => (
                <option key={d} value={d}>
                  {FUNCTION_DOMAIN_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Could you do this today?">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAble(true)}
                className={`flex-1 py-2 rounded-lg text-sm ${able ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setAble(false)}
                className={`flex-1 py-2 rounded-lg text-sm ${!able ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                No / with difficulty
              </button>
            </div>
          </Field>
          <Field label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
          <SubmitButton loading={saving} label="Log function check-in" />
        </form>
      </Card>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
      ) : (
        <ul className="space-y-2">
          {entries.slice(0, 30).map((e, i) => (
            <li key={e.objectId ?? i} className="bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-sm flex justify-between items-center">
              <span className={e.value ? "text-slate-700" : "text-red-600 font-medium"}>
                {FUNCTION_DOMAIN_LABELS[e.domain]} — {e.value ? "able" : "unable / difficulty"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{new Date(e.occurredAt).toLocaleDateString()}</span>
                <button
                  type="button"
                  aria-label="Delete this entry"
                  onClick={async () => {
                    if (!e.objectId) return;
                    await deleteFunctionEntry(e.objectId);
                    await load();
                  }}
                  className="text-slate-300 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
          {entries.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No check-ins yet.</p>}
        </ul>
      )}
    </div>
  );
}

// ---- Anchors ----

function AnchorsTab() {
  const [entries, setEntries] = useState<TimelineAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<AnchorType>("personal_event");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [precision, setPrecision] = useState<DatePrecision>("exact");
  const [detail, setDetail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getTimelineAnchors());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per tab mount)
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail.trim()) return;
    setSaving(true);
    try {
      await saveTimelineAnchor({ type, occurredAt: new Date(occurredAt).toISOString(), precision, detail });
      setDetail("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs text-slate-500 mb-3">
          Can&apos;t remember exactly when a symptom started? Place a personal anchor instead — &quot;before my
          sister&apos;s wedding&quot; is easier to recall than a date.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as AnchorType)} className={inputClass}>
              {(Object.keys(ANCHOR_TYPE_LABELS) as AnchorType[]).map((t) => (
                <option key={t} value={t}>
                  {ANCHOR_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Precision">
              <select value={precision} onChange={(e) => setPrecision(e.target.value as DatePrecision)} className={inputClass}>
                <option value="exact">Exact day</option>
                <option value="week">That week</option>
                <option value="month">That month</option>
                <option value="approximate">Rough guess</option>
              </select>
            </Field>
          </div>
          <Field label="Detail">
            <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. found a tick after hiking at Blue Ridge" className={inputClass} />
          </Field>
          <SubmitButton loading={saving} label="Add anchor" />
        </form>
      </Card>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
      ) : (
        <ul className="space-y-2">
          {entries.map((a) => (
            <li key={a.objectId} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="font-medium text-slate-800">{ANCHOR_TYPE_LABELS[a.type]}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">
                    {new Date(a.occurredAt).toLocaleDateString()}
                    {a.precision !== "exact" && ` (${a.precision})`}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete this anchor"
                    onClick={async () => {
                      if (!a.objectId) return;
                      await deleteTimelineAnchor(a.objectId);
                      await load();
                    }}
                    className="text-slate-300 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{a.detail}</div>
            </li>
          ))}
          {entries.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No anchors placed yet.</p>}
        </ul>
      )}
    </div>
  );
}

// ---- Encounters ----

function EncountersTab() {
  const [entries, setEntries] = useState<ClinicalEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [specialty, setSpecialty] = useState("");
  const [toldWhat, setToldWhat] = useState("");
  const [ruledOut, setRuledOut] = useState("");
  const [testsOrdered, setTestsOrdered] = useState("");
  const [treatmentsTried, setTreatmentsTried] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getClinicalEncounters());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per tab mount)
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!specialty.trim()) return;
    setSaving(true);
    try {
      await saveClinicalEncounter({
        occurredAt: new Date(occurredAt).toISOString(),
        specialty,
        toldWhat,
        ruledOut: ruledOut.split(",").map((s) => s.trim()).filter(Boolean),
        testsOrdered: testsOrdered.split(",").map((s) => s.trim()).filter(Boolean),
        treatmentsTried: treatmentsTried.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setSpecialty("");
      setToldWhat("");
      setRuledOut("");
      setTestsOrdered("");
      setTreatmentsTried("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs text-slate-500 mb-3">
          Care fragments across specialists — this keeps the full picture in one place, even when no single chart
          has it.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Specialty">
              <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. primary care, rheumatology" required className={inputClass} />
            </Field>
          </div>
          <Field label="What did they tell you?">
            <textarea value={toldWhat} onChange={(e) => setToldWhat(e.target.value)} rows={2} className={inputClass} />
          </Field>
          <Field label="What was ruled out? (comma-separated)">
            <input value={ruledOut} onChange={(e) => setRuledOut(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tests ordered (comma-separated)">
            <input value={testsOrdered} onChange={(e) => setTestsOrdered(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Treatments you've tried (comma-separated)">
            <input value={treatmentsTried} onChange={(e) => setTreatmentsTried(e.target.value)} placeholder="e.g. doxycycline, rest, ibuprofen" className={inputClass} />
          </Field>
          <SubmitButton loading={saving} label="Log encounter" />
        </form>
      </Card>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
      ) : (
        <ul className="space-y-2">
          {entries.map((enc) => (
            <li key={enc.objectId} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between items-start gap-2">
                <span className="font-medium text-slate-800">{enc.specialty}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{new Date(enc.occurredAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    aria-label="Delete this encounter"
                    onClick={async () => {
                      if (!enc.objectId) return;
                      await deleteClinicalEncounter(enc.objectId);
                      await load();
                    }}
                    className="text-slate-300 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {enc.toldWhat && <div className="text-xs text-slate-500 mt-1">{enc.toldWhat}</div>}
              {enc.ruledOut.length > 0 && (
                <div className="text-xs text-slate-400 mt-1">Ruled out: {enc.ruledOut.join(", ")}</div>
              )}
              {enc.treatmentsTried.length > 0 && (
                <div className="text-xs text-slate-400 mt-1">Treatments tried: {enc.treatmentsTried.join(", ")}</div>
              )}
            </li>
          ))}
          {entries.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No encounters logged yet.</p>}
        </ul>
      )}
    </div>
  );
}

// ---- Rash Photos ----

function RashTab() {
  const [photos, setPhotos] = useState<RashPhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPhotos(await getRashPhotos());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from Parse must stay effect-gated (browser-only SDK, runs once per tab mount)
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    try {
      await saveRashPhoto(file, new Date(occurredAt).toISOString(), note || undefined);
      setNote("");
      setFile(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs text-slate-500 mb-3">
          A daily photo with a reference object for scale. No image analysis happens here — this is just a dated
          sequence, which is what makes an expanding rash visible. Photograph, don&apos;t interpret.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Photo">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Date taken">
            <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
          <SubmitButton loading={saving} label="Add photo" />
        </form>
      </Card>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {photos.map((p) => (
            <div key={p.objectId} className="shrink-0 w-32">
              {/* eslint-disable-next-line @next/next/no-img-element -- Parse.File URLs are dynamic/external, next/image's optimizer isn't applicable here */}
              <img src={p.url} alt={`Rash photo ${new Date(p.occurredAt).toLocaleDateString()}`} className="w-32 h-32 object-cover rounded-xl border border-slate-200" />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-slate-500">{new Date(p.occurredAt).toLocaleDateString()}</p>
                <button
                  type="button"
                  aria-label="Delete this photo"
                  onClick={async () => {
                    if (!p.objectId) return;
                    await deleteRashPhoto(p.objectId);
                    await load();
                  }}
                  className="text-slate-300 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {photos.length === 0 && <p className="text-sm text-slate-400 text-center py-4 w-full">No photos yet.</p>}
        </div>
      )}
    </div>
  );
}

// ---- Exposure ----

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
  "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
  "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];

interface ExposureResult {
  found: boolean;
  message: string;
  sources?: { number: number; source_name: string; source_url: string; section_path: string }[];
}

function ExposureTab() {
  const [state, setState] = useState("Alabama");
  const [county, setCounty] = useState("");
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [activities, setActivities] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExposureResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!county.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/exposure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          county,
          months: [{ month, year, activities: activities.split(",").map((a) => a.trim()).filter(Boolean) }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs text-slate-500 mb-3">
          Not &quot;were you bitten by a tick&quot; — most people with confirmed Lyme disease never recall a bite. This
          cross-references outdoor activity you report against real CDC county surveillance data instead.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="State">
              <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="County">
              <input value={county} onChange={(e) => setCounty(e.target.value)} placeholder="e.g. Autauga County" required className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month">
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year">
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass} />
            </Field>
          </div>
          <Field label="Outdoor activities (comma-separated)">
            <input
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              placeholder="e.g. hiking, gardening, sitting in tall grass"
              className={inputClass}
            />
          </Field>
          <SubmitButton loading={loading} label="Check this location" />
        </form>
      </Card>

      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {result && (
        <Card>
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{result.message}</p>
          {result.sources && result.sources.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sources</p>
              <ul className="space-y-1">
                {result.sources.map((s) => (
                  <li key={s.number} className="text-xs text-slate-500">
                    [{s.number}] {s.source_name} — {s.section_path}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ---- Ask Your Journal (agentic tool-calling assistant) ----

const EXAMPLE_QUESTIONS = [
  "Is my fatigue trending up or down?",
  "How often do I get a break from joint pain?",
  "Which function domains am I struggling with most?",
  "What has come up across my clinical encounters?",
];

interface AgentTurn {
  question: string;
  answer?: string;
  toolCalls?: { tool: string; args: unknown }[];
  error?: string;
}

function AskTab() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setLoading(true);
    setQuestion("");
    setTurns((prev) => [...prev, { question }]);
    try {
      const [symptoms, functionEntries, anchors, encounters] = await Promise.all([
        getSymptomEntries(),
        getFunctionEntries(),
        getTimelineAnchors(),
        getClinicalEncounters(),
      ]);
      const res = await fetch("/api/journal-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, journalData: { symptoms, functionEntries, anchors, encounters } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { question, answer: data.answer, toolCalls: data.toolCalls };
        return next;
      });
    } catch (err) {
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { question, error: err instanceof Error ? err.message : "Something went wrong" };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500">
            An AI agent that answers questions about your own logged data by calling real tools — trend
            calculations, function-impact tallies, symptom-free intervals — over your journal, not a general
            chatbot. It never diagnoses or suggests medication; those questions get redirected to a clinician.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Is my fatigue getting worse over time?"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            aria-label="Ask"
            className="shrink-0 w-10 h-10 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white flex items-center justify-center transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {turns.map((t, i) => (
          <Card key={i}>
            <p className="text-sm font-medium text-slate-800 mb-2">{t.question}</p>
            {t.error && <p className="text-sm text-red-600">{t.error}</p>}
            {t.answer && (
              <>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{t.answer}</p>
                {t.toolCalls && t.toolCalls.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {t.toolCalls.map((tc, j) => (
                      <span key={j} className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                        {tc.tool}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
            {!t.answer && !t.error && <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
          </Card>
        ))}
      </div>
    </div>
  );
}
