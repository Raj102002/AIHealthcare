"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, BookMarked, ExternalLink } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import type { SourceEntry } from "@/app/api/sources/route";

export default function SourcesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sources, setSources] = useState<SourceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    fetch("/api/sources")
      .then((res) => res.json())
      .then((data) => setSources(data.sources ?? []))
      .catch(() => setError("Couldn't load the source list."));
  }, [ready]);

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
          <BookMarked className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">Sources</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Every federal document and dataset ClearSignal&apos;s answers are grounded in — the same sources cited
          under individual chat answers, listed here in one place.
        </p>

        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

        {!sources ? (
          <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.sourceName} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-800">{s.sourceName}</span>
                  <span className="text-xs text-slate-400 shrink-0">{s.chunkCount} indexed passage{s.chunkCount === 1 ? "" : "s"}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">{s.condition}</span>
                  {s.sourceUrl && (
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-teal-600 hover:underline"
                    >
                      View source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
