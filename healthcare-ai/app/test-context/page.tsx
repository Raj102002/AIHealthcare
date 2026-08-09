"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, TestTube2 } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import type { CitedSource } from "@/types/rag";

interface TestContextResult {
  daysFromOnset: number;
  window: string;
  message: string;
  sources: CitedSource[];
  contextAvailable: boolean;
}

export default function TestContextPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [symptomOnsetDate, setSymptomOnsetDate] = useState("");
  const [testDate, setTestDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestContextResult | null>(null);

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symptomOnsetDate || !testDate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/test-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptomOnsetDate, testDate }),
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
          <span className="font-semibold text-slate-900">HealthAI</span>
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
          <TestTube2 className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">What does my test result mean?</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          A negative Lyme test taken too early can miss a real infection — the antibody response takes time to
          develop. Enter your dates below to see what CDC says about your specific timing.
        </p>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
          <div>
            <label htmlFor="onset" className="block text-sm font-medium text-slate-700 mb-1">
              When did your symptoms begin?
            </label>
            <input
              id="onset"
              type="date"
              value={symptomOnsetDate}
              onChange={(e) => setSymptomOnsetDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor="test" className="block text-sm font-medium text-slate-700 mb-1">
              When was the test drawn?
            </label>
            <input
              id="test"
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !symptomOnsetDate || !testDate}
            className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Check my test timing
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {result && (
          <div className="mt-4 bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{result.message}</p>
            {result.sources.length > 0 && (
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
          </div>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          ⚕️ This is not a diagnosis or an interpretation of your result — it&apos;s a sourced fact about test timing.
          Bring this to your clinician.
        </p>
      </div>
    </div>
  );
}
