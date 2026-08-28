"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, MessageSquare, LogOut, Loader2, Activity, RefreshCw } from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";

interface RouteMetrics {
  route: string;
  count: number;
  errorRate: number;
  rateLimitedRate: number;
  p50Ms: number;
  p95Ms: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

interface MetricsResponse {
  sampledAt: string;
  sampleSize: number;
  note: string;
  overall: { totalRequests: number; overallErrorRate: number; totalTokensUsed: number };
  byRoute: RouteMetrics[];
}

const P95_TARGET_MS = 500;

export default function AdminMetricsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/metrics");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load metrics");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load must stay effect-gated
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

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-600" />
            <h1 className="text-lg font-bold text-slate-900">Metrics</h1>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-teal-600 px-2 py-1 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <p className="text-xs text-amber-600 mb-6">
          ⚠ This page is gated behind login only, not a true admin role (there is no Role system in this app yet
          — see docs/security-audit.md). Any logged-in user can currently view it.
        </p>

        {loading && !data && <Loader2 className="w-5 h-5 animate-spin text-teal-600 mx-auto" />}
        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

        {data && (
          <>
            <p className="text-xs text-slate-400 mb-4">{data.note}</p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-400">Total requests (sampled)</p>
                <p className="text-2xl font-bold text-slate-800">{data.overall.totalRequests}</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-400">Overall error rate</p>
                <p className={`text-2xl font-bold ${data.overall.overallErrorRate > 0.01 ? "text-red-600" : "text-slate-800"}`}>
                  {(data.overall.overallErrorRate * 100).toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-400">target &lt; 1%</p>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-4">
                <p className="text-xs text-slate-400">Total tokens used</p>
                <p className="text-2xl font-bold text-slate-800">{data.overall.totalTokensUsed.toLocaleString()}</p>
              </div>
            </div>

            <table className="w-full text-sm bg-white border border-slate-100 rounded-xl overflow-hidden">
              <thead className="bg-slate-50 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Route</th>
                  <th className="text-right px-3 py-2">Count</th>
                  <th className="text-right px-3 py-2">Error %</th>
                  <th className="text-right px-3 py-2">p50 ms</th>
                  <th className="text-right px-3 py-2">p95 ms</th>
                  <th className="text-right px-3 py-2">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.byRoute.map((r) => (
                  <tr key={r.route} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{r.route}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{r.count}</td>
                    <td className={`px-3 py-2 text-right ${r.errorRate > 0.01 ? "text-red-600 font-medium" : "text-slate-600"}`}>
                      {(r.errorRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">{r.p50Ms}</td>
                    <td className={`px-3 py-2 text-right ${r.p95Ms > P95_TARGET_MS ? "text-red-600 font-medium" : "text-slate-600"}`}>
                      {r.p95Ms}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {(r.totalPromptTokens + r.totalCompletionTokens).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {data.byRoute.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-6">
                      No requests logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-2">p95 target: &lt; {P95_TARGET_MS}ms (highlighted red if exceeded)</p>
          </>
        )}
      </div>
    </div>
  );
}
