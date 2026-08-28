"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Compass, ExternalLink, GraduationCap, Users, FlaskConical } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";
import type { ResourceCard } from "@/app/api/navigator/route";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

interface CardGroups {
  education: ResourceCard[];
  providers: ResourceCard[];
  trials: ResourceCard[];
}

function CardList({ title, icon: Icon, cards }: { title: string; icon: typeof Compass; cards: ResourceCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-4 h-4 text-teal-600" />
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      <ul className="space-y-2">
        {cards.map((c, i) => (
          <li key={i} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-slate-800">{c.title}</span>
              {c.link && (
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-teal-600 shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{c.whyRelevant}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {c.source} · {c.agency}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ResourcesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<CardGroups | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  useEffect(() => {
    initializeParse();
    if (!getCurrentUser()) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auth check depends on browser-only Parse SDK state, must stay effect-gated
    setReady(true);
  }, [router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setCards(null);
    try {
      const res = await fetch("/api/navigator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          location: state ? { state, city: city || undefined } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resource search failed");
      setCards(data.cards);
      setDisclaimer(data.disclaimer);
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
          <Compass className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">Resources</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Ask a question and get back CDC/federal information, care types, and trials relevant to it — each
          card says why it matched and where it came from.
        </p>

        <form onSubmit={handleSearch} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-3 mb-4">
          <div>
            <label htmlFor="question" className="block text-xs font-medium text-slate-700 mb-1">
              What are you trying to find out or find help with?
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="e.g. I have joint pain and a bullseye rash, what should I do?"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="state" className="block text-xs font-medium text-slate-700 mb-1">State (optional)</label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Not specified</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="city" className="block text-xs font-medium text-slate-700 mb-1">City (optional)</label>
              <input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Find resources
          </button>
        </form>

        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

        {disclaimer && (
          <p className="text-xs text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl px-3 py-2 mb-4">
            {disclaimer}
          </p>
        )}

        {cards && (
          <>
            <CardList title="Federal Information" icon={GraduationCap} cards={cards.education} />
            <CardList title="Care Types & Directories" icon={Users} cards={cards.providers} />
            <CardList title="Clinical Trials" icon={FlaskConical} cards={cards.trials} />
            {cards.education.length === 0 && cards.providers.length === 0 && cards.trials.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No resources found for this search.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
