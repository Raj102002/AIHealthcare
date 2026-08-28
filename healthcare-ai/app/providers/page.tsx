"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Users, FlaskConical } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";

interface Provider {
  npi: string;
  name: string;
  credential?: string;
  specialty?: string;
  city?: string;
  state?: string;
  phone?: string;
}

interface Trial {
  nctId: string;
  title: string;
  status: string;
  locations: string[];
  url: string;
}

const SPECIALTIES = ["Infectious Disease", "Rheumatology", "Neurology", "Internal Medicine", "Family Medicine", "Cardiology"];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export default function ProvidersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [specialty, setSpecialty] = useState(SPECIALTIES[0]);
  const [state, setState] = useState("NY");
  const [city, setCity] = useState("");
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [trials, setTrials] = useState<Trial[] | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setProviders(null);
    setTrials(null);
    try {
      const providerParams = new URLSearchParams({ specialty, state });
      if (city) providerParams.set("city", city);
      const [providerRes, trialRes] = await Promise.all([
        fetch(`/api/providers?${providerParams.toString()}`),
        fetch(`/api/trials?location=${encodeURIComponent(city ? `${city}, ${state}` : state)}`),
      ]);
      const providerData = await providerRes.json();
      const trialData = await trialRes.json();
      if (!providerRes.ok) throw new Error(providerData.error || "Provider search failed");
      setProviders(providerData.providers);
      setTrials(trialRes.ok ? trialData.trials : []);
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
          <Users className="w-5 h-5 text-teal-600" />
          <h1 className="text-lg font-bold text-slate-900">Find a Provider or Trial</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Listed by specialty and location only — never ranked by fit for your specific situation. That judgment
          belongs to you and your clinician.
        </p>

        <form onSubmit={handleSearch} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 space-y-3 mb-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="specialty" className="block text-xs font-medium text-slate-700 mb-1">Specialty</label>
              <select
                id="specialty"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {SPECIALTIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="state" className="block text-xs font-medium text-slate-700 mb-1">State</label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
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
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Search
          </button>
        </form>

        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}

        {providers && (
          <p className="text-xs text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl px-3 py-2 mb-4">
            Results are matched by specialty and location only — they are not ranked by suitability
            for your situation, which is a clinical judgment this app doesn&apos;t make.
          </p>
        )}

        {providers && (
          <div className="mb-6">
            <h2 className="text-sm font-bold text-slate-900 mb-2">Providers ({providers.length})</h2>
            <ul className="space-y-2">
              {providers.map((p) => (
                <li key={p.npi} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
                  <div className="font-medium text-slate-800">
                    {p.name}
                    {p.credential && `, ${p.credential}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.specialty} — {p.city}, {p.state}
                    {p.phone && ` — ${p.phone}`}
                  </div>
                </li>
              ))}
              {providers.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No providers found for this search.</p>}
            </ul>
          </div>
        )}

        {trials && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FlaskConical className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900">Clinical Trials ({trials.length})</h2>
            </div>
            <ul className="space-y-2">
              {trials.map((t) => (
                <li key={t.nctId} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm">
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 hover:underline">
                    {t.title}
                  </a>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t.status} — {t.locations.join(" · ") || "location not specified"}
                  </div>
                </li>
              ))}
              {trials.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No trials found for this search.</p>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
