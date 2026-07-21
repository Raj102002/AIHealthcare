"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart,
  MessageSquare,
  LayoutDashboard,
  LogOut,
  Loader2,
  Send,
  Database,
} from "lucide-react";
import { getCurrentUser, logoutUser, initializeParse } from "@/lib/parse-client";

interface Source {
  region: string;
  source: string;
  yearsCovered: string;
  relevance: number;
}

interface QAEntry {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  error?: string;
}

const EXAMPLE_QUESTIONS = [
  "What is Lyme disease and how does it spread?",
  "How many Lyme disease cases were reported in Autauga County, Alabama?",
  "What are the symptoms of Lyme disease?",
  "Which states report the most Lyme disease cases?",
];

export default function LymeDataPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setQuestion("");

    try {
      const res = await fetch("/api/rag-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEntries((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            question: text,
            answer: "",
            sources: [],
            error: data.error || "Something went wrong. Please try again.",
          },
        ]);
        return;
      }

      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: text,
          answer: data.answer,
          sources: data.sources || [],
        },
      ]);
    } catch {
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          question: text,
          answer: "",
          sources: [],
          error: "Network error. Please try again.",
        },
      ]);
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
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
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
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
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

      <main className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-teal-600" />
              <h1 className="text-lg font-bold text-slate-900">
                Lyme Disease Data Q&A
              </h1>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Ask general questions about Lyme disease (symptoms, transmission,
              prevention) or CDC surveillance data — case counts by county
              (2001–2023) and by race (2010–2023). Answers cite the underlying
              source and are not a diagnosis.
            </p>

            {entries.length === 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {entries.map((entry) => (
              <div key={entry.id} className="mb-6">
                <div className="flex justify-end mb-2">
                  <div className="bg-teal-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[85%]">
                    {entry.question}
                  </div>
                </div>
                {entry.error ? (
                  <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5">
                    {entry.error}
                  </div>
                ) : (
                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">
                      {entry.answer}
                    </p>
                    {entry.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                          Sources
                        </p>
                        <ul className="space-y-1">
                          {entry.sources.map((s, i) => (
                            <li key={i} className="text-xs text-slate-500">
                              {s.region} ({s.yearsCovered}) — {s.source}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                </div>
                <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-400">
                  Retrieving data and generating an answer...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="bg-amber-50 border-t border-amber-100 px-4 py-1.5 text-center text-xs text-amber-700">
          ⚕️ Aggregate surveillance statistics only — not a diagnosis. Consult a
          healthcare professional about your own symptoms.
        </div>

        <div className="bg-white border-t border-slate-200 px-4 py-3">
          <div className="max-w-2xl mx-auto flex gap-2 items-end">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
              placeholder="Ask about Lyme disease case counts or demographics… (Enter to send)"
              rows={1}
              className="flex-1 resize-none px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition max-h-32 scrollbar-thin"
              style={{ minHeight: "44px" }}
            />
            <button
              onClick={() => ask(question)}
              disabled={!question.trim() || loading}
              className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white transition-colors shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
