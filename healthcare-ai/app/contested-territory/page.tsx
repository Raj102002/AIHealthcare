"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Scale } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";

// ClearSignal build spec section 6.11: present contested clinical territory as
// contested, with sources for both positions, and do not adjudicate between
// them. STATUS: the organization names and general positions below are
// accurately characterized, but specific document citations (exact guideline
// titles, URLs, publication years) are NOT independently verified against live
// sources in this pass — cdc.gov and similar sites block automated fetching in
// this environment. Treat the [needs citation] markers as exactly that before
// this ships to real patients.
export default function ContestedTerritoryPage() {
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
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">Persistent Symptoms After Treatment: Where Experts Disagree</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          This is a genuinely unsettled question in Lyme disease care. Two professional bodies have taken different
          positions, and we&apos;re presenting both rather than picking one for you.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
            <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider mb-2">Mainstream Position</p>
            <p className="text-xs text-slate-400 mb-3">IDSA / AAN / ACR joint clinical practice guidelines</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              Post-treatment Lyme disease syndrome (PTLDS) — persisting fatigue, pain, or cognitive symptoms after a
              standard course of antibiotics — is recognized, but these guidelines state there is not convincing
              evidence that ongoing active infection is the cause in most cases. They recommend against long-term or
              repeated antibiotic courses for persistent symptoms after standard treatment, citing a lack of
              consistent demonstrated benefit in clinical trials, weighed against real risks of extended antibiotic
              use (including C. difficile infection, antibiotic resistance, and IV-line complications where
              applicable).
            </p>
            <p className="text-[10px] text-amber-600 mt-3">[needs citation — exact guideline title/URL/year]</p>
          </div>

          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
            <p className="text-xs font-semibold text-teal-700 uppercase tracking-wider mb-2">Patient Advocacy Position</p>
            <p className="text-xs text-slate-400 mb-3">ILADS and patient advocacy organizations</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              ILADS (International Lyme and Associated Diseases Society) holds that for some patients, symptoms
              reflect persistent, inadequately treated infection — sometimes called &quot;chronic Lyme disease&quot; — and that
              extended or repeated antibiotic treatment can be appropriate on an individualized, case-by-case basis.
              Patient advocacy organizations argue the randomized trials underlying the mainstream position are too
              few, small, or short in duration to rule out a real benefit for some patients, and point to patient-
              reported improvement with extended treatment.
            </p>
            <p className="text-[10px] text-amber-600 mt-3">[needs citation — exact ILADS guideline title/URL/year]</p>
          </div>
        </div>

        <div className="mt-4 bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">What&apos;s Genuinely Unresolved</p>
          <ul className="text-sm text-amber-900 space-y-1.5 list-disc list-inside">
            <li>Whether &quot;chronic Lyme disease,&quot; as a persistent active infection distinct from PTLDS, is a distinct clinical entity is scientifically contested.</li>
            <li>The trials on extended antibiotic treatment for persistent symptoms show mixed, limited results, and are read differently by each side.</li>
            <li>
              The underlying mechanism of PTLDS itself — ongoing infection, a post-infectious immune process, tissue
              damage, or other causes — is not established.
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          ⚕️ Neither position is presented here as correct. If this applies to you, bringing both perspectives to your
          clinician — and asking directly how they weigh this evidence — is a reasonable next step.
        </p>
      </div>
    </div>
  );
}
