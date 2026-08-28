"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";

// The single "what ClearSignal can and cannot do" section the v2 spec asks
// for -- consolidating what was previously six separate one-line disclaimer
// variants scattered across /chat, /, /dashboard, /handoff, and /test-context
// into one page every other page can link to, instead of each restating its
// own version.
const CAN = [
  "Organize your symptoms, exposures, and clinical encounters into one timeline.",
  "Retrieve grounded federal health information (CDC) with real source citations.",
  "Show how confident it is in an answer — strong, moderate, limited, or insufficient evidence.",
  "Contextualize a test result against real CDC timing guidance, without reinterpreting the result itself.",
  "Surface federal resources, care types, and directories relevant to your question.",
  "Prepare a one-page, citation-backed summary to bring to a clinician.",
  "Escalate urgent symptom language to emergency guidance, deterministically, before any AI model runs.",
];

const CANNOT = [
  "Diagnose Lyme disease, or any other condition — it never tells you that you do or don't have something.",
  "Interpret your test result beyond the timing/context CDC guidance actually supports.",
  "Rank clinicians or trials by suitability for your situation — that's a clinical judgment it doesn't make.",
  "Replace a clinician, or the judgment only a licensed clinician can apply to your specific case.",
];

const LIMITATIONS = [
  "Its knowledge is limited to what's in its indexed CDC/federal corpus — it says so when evidence is insufficient, rather than guessing.",
  "It's built for Lyme disease specifically today; other invisible illnesses aren't yet implemented (see /sources for what's indexed).",
  "Red-flag detection and reference content have not yet had a full clinical/legal review pass.",
];

export default function ScopePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

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
            href="/chat"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
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
        <h1 className="text-lg font-bold text-slate-900 mb-1">What ClearSignal Can and Cannot Do</h1>
        <p className="text-sm text-slate-500 mb-6">
          Stated plainly, in one place, rather than scattered across every page.
        </p>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">Can</h2>
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {CAN.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-500 shrink-0">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-1.5 mb-3">
            <XCircle className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold text-slate-900">Cannot</h2>
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {CANNOT.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-red-500 shrink-0">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-bold text-slate-900">May have incomplete information</h2>
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {LIMITATIONS.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600 shrink-0">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
