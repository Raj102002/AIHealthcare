"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { getCurrentUser, initializeParse } from "@/lib/parse-client";
import { runDemoSeed, SEED_COUNTS, type SeedProgress } from "@/lib/demo-seed-data";

// One-off tool for populating tomorrow's demo with realistic-looking data --
// not linked from AppNav or any other page, reachable only by typing the URL.
// Safe to delete after the demo; running it more than once just adds more
// (duplicate) entries rather than corrupting anything.
export default function DevSeedPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<SeedProgress[]>([]);
  const [summary, setSummary] = useState<{ ok: number; fail: number } | null>(null);

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

  async function handleRun() {
    setRunning(true);
    setDone(false);
    setLog([]);
    setSummary(null);
    const result = await runDemoSeed((p) => setLog((prev) => [...prev, p]));
    setSummary(result);
    setRunning(false);
    setDone(true);
  }

  const totalPlanned =
    SEED_COUNTS.symptoms + SEED_COUNTS.functionEntries + SEED_COUNTS.anchors + SEED_COUNTS.encounters + SEED_COUNTS.healthLogs + SEED_COUNTS.conversations;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Demo setup only — not a real app feature.</p>
            <p className="mt-1">
              This populates a realistic Lyme-disease patient history under your current account: {SEED_COUNTS.symptoms}{" "}
              symptom entries, {SEED_COUNTS.functionEntries} function-impact entries, {SEED_COUNTS.anchors} timeline anchors
              (tick bite, rash, test results, treatment), {SEED_COUNTS.encounters} clinical encounters, {SEED_COUNTS.healthLogs}{" "}
              health logs, and {SEED_COUNTS.conversations} saved chat conversations covering Lyme disease, coinfections, and
              testing — so Journal, Dashboard, and the new chat-history analysis all have real content to show.
            </p>
            <p className="mt-2">
              <strong>Two honest limits:</strong> the Journal entries (Symptoms/Function/Anchors/Encounters) get real
              backdated timestamps spanning the last ~10 weeks, but Health Logs and saved Conversations only support the
              current save time in this app&apos;s data model — those will all show today&apos;s date on the Dashboard
              regardless of when this runs. Running this more than once adds duplicates rather than replacing anything.
            </p>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium py-3 rounded-xl transition-colors"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {running ? `Seeding… (${log.length}/${totalPlanned})` : done ? "Run Again" : "Populate Demo Data"}
        </button>

        {summary && (
          <p className="text-center text-sm mt-3 text-slate-600">
            Done — {summary.ok} saved, {summary.fail} failed.
          </p>
        )}

        {log.length > 0 && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                {entry.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-slate-700 truncate">{entry.label}</p>
                  {entry.error && <p className="text-red-500 truncate">{entry.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
