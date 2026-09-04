"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Eye, Upload, AlertTriangle } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";

interface ScreeningResult {
  screening: Record<string, unknown>;
  movement: Record<string, unknown>;
  characterization: Record<string, unknown>;
  pupilDetection: Record<string, unknown>;
  reportHtml: string;
}

export default function VestibularScreeningPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [eye, setEye] = useState<"left" | "right">("right");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("video", file);
      body.append("eye", eye);
      const res = await fetch("/api/vestibular-screening", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
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
          <Eye className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">Nystagmus / vestibular screening</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Upload a short close-up or webcam-style video of one eye. This runs vestibular-ai&apos;s pupil-tracking and
          eye-movement pipeline and pattern-matches the result against literature-described nystagmus signatures
          (Stage 5 of 7). It is <strong>research-only, unimodal, and never a diagnosis</strong> — bring the result to
          a clinician rather than acting on it alone.
        </p>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-4">
          <div>
            <label htmlFor="video" className="block text-sm font-medium text-slate-700 mb-1">
              Eye-tracking video (MP4, WebM, or MOV, under 100MB)
            </label>
            <input
              ref={fileInputRef}
              id="video"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:text-sm file:font-medium hover:file:bg-teal-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Which eye is in frame?</label>
            <div className="flex gap-2">
              {(["right", "left"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEye(option)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    eye === option
                      ? "bg-teal-600 border-teal-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:border-teal-300"
                  }`}
                >
                  {option[0].toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !file}
            className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? "Processing (this can take a minute)…" : "Run screening"}
          </button>
        </form>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-4 bg-white border border-slate-100 shadow-sm rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Explainable report</p>
            <iframe
              srcDoc={result.reportHtml}
              title="Vestibular screening report"
              sandbox=""
              className="w-full rounded-lg border border-slate-100"
              style={{ height: "70vh" }}
            />
          </div>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          ⚕️ Descriptive pattern-matching against published eye-movement signatures, not a diagnosis. Validated only
          against synthetic ground truth so far — see vestibular-ai/README.md for current limitations.
        </p>
      </div>
    </div>
  );
}
