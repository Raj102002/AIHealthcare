"use client";

import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { ChatLogAnalysis } from "@/lib/log-analysis";

interface ConvForAnalysis {
  title: string;
  createdAt: string;
  messages: { role: string; content: string }[];
}

interface Props {
  conversations: ConvForAnalysis[];
}

// Same collapsible-card pattern as components/HealthInsights.tsx (which
// analyzes HealthLog entries) applied to saved Conversation history instead
// -- "how many diseases/conditions has this patient been asking about" so
// the patient and their clinician can see the pattern at a glance, not just
// a raw list of saved chats.
export default function ChatLogInsights({ conversations }: Props) {
  const [analysis, setAnalysis] = useState<ChatLogAnalysis | null>(null);
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    setError("");
    setOpen(true);
    try {
      const res = await fetch("/api/chat-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to analyze chat history");
      setAnalysis(data.analysis);
      setNarrative(data.narrative);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze chat history";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const topDiseaseCount = analysis?.diseaseTopics[0]?.count ?? 0;

  return (
    <div className="bg-white rounded-xl border border-purple-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-purple-50 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Chat History Analysis</p>
            <p className="text-xs text-slate-400">See which conditions come up most in your saved conversations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysis && !loading && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={runAnalysis}
            disabled={loading || conversations.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {loading ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze My Logs"}
          </button>
        </div>
      </div>

      {(open || loading) && (
        <div className="px-4 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-500 shrink-0" />
              Reading your saved conversations…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          {analysis && !loading && (
            <>
              {analysis.diseaseTopics.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Diseases &amp; conditions discussed
                  </p>
                  <div className="space-y-1.5">
                    {analysis.diseaseTopics.map((t) => (
                      <div key={t.name} className="flex items-center gap-2">
                        <span className="text-xs text-slate-700 w-56 shrink-0 truncate" title={t.name}>
                          {t.name}
                        </span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${topDiseaseCount ? (t.count / topDiseaseCount) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-16 text-right shrink-0">
                          {t.count} q{t.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.otherTopics.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {analysis.otherTopics.map((t) => (
                    <span
                      key={t.name}
                      className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                    >
                      {t.name} · {t.count}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {narrative}
              </div>
              <p className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">
                ⚕️ This summarizes your own saved chats only. It is not a diagnosis and does not replace a clinician.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
