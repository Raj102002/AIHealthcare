"use client";

import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { UserProfile } from "@/types/health";

interface LogEntry {
  id: string;
  symptoms: string;
  severity: "low" | "medium" | "high";
  notes: string;
  createdAt: string;
  vitals?: Record<string, unknown>;
}

interface Props {
  logs: LogEntry[];
  profile: UserProfile | null;
}

export default function HealthInsights({ logs, profile }: Props) {
  const [insights, setInsights] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function generateInsights() {
    setLoading(true);
    setError("");
    setOpen(true);
    setInsights("");
    try {
      const res = await fetch("/api/health-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs, profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate insights");
      setInsights(data.insights);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate insights";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-purple-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-purple-50 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">AI Health Insights</p>
            <p className="text-xs text-slate-400">Analyze patterns across your health logs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {insights && !loading && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={generateInsights}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : insights ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {loading ? "Analyzing…" : insights ? "Re-analyze" : "Analyze My Logs"}
          </button>
        </div>
      </div>

      {(open || loading) && (
        <div className="px-4 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-500 shrink-0" />
              Analyzing your health patterns…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          {insights && !loading && (
            <>
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {insights}
              </div>
              <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">
                ⚕️ AI insights are general wellness information only. Always consult a qualified healthcare professional.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
