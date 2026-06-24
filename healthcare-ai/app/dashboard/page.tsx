"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Heart,
  MessageSquare,
  ClipboardList,
  LogOut,
  Loader2,
  Activity,
  Calendar,
  Trash2,
} from "lucide-react";
import {
  getCurrentUser,
  getUserProfile,
  logoutUser,
  getHealthLogs,
  getConversations,
  deleteHealthLog,
  deleteConversation,
  initializeParse,
  Parse,
} from "@/lib/parse-client";
import HealthLogForm from "@/components/HealthLogForm";
import type { UserProfile } from "@/types/health";

interface LogEntry {
  id: string;
  symptoms: string;
  severity: "low" | "medium" | "high";
  notes: string;
  createdAt: string;
  vitals?: Record<string, unknown>;
}

interface ConvEntry {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: string;
}

const SEVERITY_STYLES = {
  low: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  high: "bg-red-100 text-red-700 border-red-200",
};

const SEVERITY_LABELS = { low: "Mild", medium: "Moderate", high: "Severe" };

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [convs, setConvs] = useState<ConvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"logs" | "chats">("logs");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rawLogs, rawConvs] = await Promise.all([
        getHealthLogs(),
        getConversations(),
      ]);
      setLogs(
        rawLogs.map((obj: Parse.Object) => ({
          id: obj.id,
          symptoms: obj.get("symptoms") || "",
          severity: obj.get("severity") || "low",
          notes: obj.get("notes") || "",
          createdAt: obj.get("createdAt")?.toISOString() || new Date().toISOString(),
          vitals: obj.get("vitals") || {},
        }))
      );
      setConvs(
        rawConvs.map((obj: Parse.Object) => ({
          id: obj.id,
          title: obj.get("title") || "Conversation",
          lastMessage: obj.get("lastMessage") || "",
          createdAt: obj.get("createdAt")?.toISOString() || new Date().toISOString(),
        }))
      );
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeParse();
    const user = getCurrentUser();
    if (!user) {
      router.replace("/");
      return;
    }
    setProfile(getUserProfile());
    fetchData();
  }, [router, fetchData]);

  async function handleLogout() {
    await logoutUser();
    router.replace("/");
  }

  async function handleDeleteLog(id: string) {
    if (!confirm("Delete this health log?")) return;
    setDeletingId(id);
    try {
      await deleteHealthLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Failed to delete health log:", err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteConv(id: string) {
    if (!confirm("Delete this conversation?")) return;
    setDeletingId(id);
    try {
      await deleteConversation(id);
      setConvs((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    } finally {
      setDeletingId(null);
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  const recentHighSeverity = logs.filter((l) => l.severity === "high").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
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

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Health Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Welcome back, {profile.username}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            {
              icon: ClipboardList,
              label: "Health Logs",
              value: logs.length,
              color: "text-teal-600",
              bg: "bg-teal-50",
            },
            {
              icon: MessageSquare,
              label: "Conversations",
              value: convs.length,
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              icon: Activity,
              label: "Severe Logs",
              value: recentHighSeverity,
              color: "text-red-600",
              bg: "bg-red-50",
            },
            {
              icon: Calendar,
              label: "Conditions",
              value: profile.conditions?.length || 0,
              color: "text-purple-600",
              bg: "bg-purple-50",
            },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2"
            >
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Profile summary */}
        {(profile.allergies?.length || profile.conditions?.length || profile.medications?.length) ? (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Health Profile</h2>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              {[
                { label: "Allergies", items: profile.allergies || [], color: "bg-red-50 text-red-700" },
                { label: "Conditions", items: profile.conditions || [], color: "bg-yellow-50 text-yellow-700" },
                { label: "Medications", items: profile.medications || [], color: "bg-blue-50 text-blue-700" },
              ].map(({ label, items, color }) =>
                items.length ? (
                  <div key={label}>
                    <p className="font-medium text-slate-500 mb-1.5">{label}</p>
                    <div className="flex flex-wrap gap-1">
                      {items.map((item) => (
                        <span key={item} className={`px-2 py-0.5 rounded-full ${color}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        ) : null}

        {/* Log new entry */}
        <div className="mb-6">
          <HealthLogForm onSaved={fetchData} />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-200">
            {(["logs", "chats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "text-teal-600 border-b-2 border-teal-600 bg-teal-50/50"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "logs" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <ClipboardList className="w-4 h-4" /> Health Logs
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <MessageSquare className="w-4 h-4" /> Chat History
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
            </div>
          ) : activeTab === "logs" ? (
            <div className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No health logs yet. Log your first symptom above.</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">

                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[log.severity]}`}
                          >
                            {SEVERITY_LABELS[log.severity]}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(log.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800 font-medium truncate">{log.symptoms}</p>
                        {log.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{log.notes}</p>
                        )}
                        {log.vitals && Object.keys(log.vitals).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {Object.entries(log.vitals as Record<string, unknown>).map(([k, v]) =>
                              v ? (
                                <span key={k} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                  {k === "heartRate"
                                    ? `HR: ${v} bpm`
                                    : k === "bloodPressure"
                                    ? `BP: ${v}`
                                    : k === "temperature"
                                    ? `Temp: ${v}°F`
                                    : k === "oxygenSaturation"
                                    ? `SpO2: ${v}%`
                                    : `${k}: ${v}`}
                                </span>
                              ) : null
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        disabled={deletingId === log.id}
                        className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        aria-label="Delete log"
                      >
                        {deletingId === log.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {convs.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No saved conversations yet.</p>
                  <Link href="/chat" className="text-teal-600 text-sm hover:underline mt-1 inline-block">
                    Start a chat
                  </Link>
                </div>
              ) : (
                convs.map((conv) => (
                  <div key={conv.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-3">
                    <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{conv.title}</p>
                      {conv.lastMessage && (
                        <p className="text-xs text-slate-400 truncate">{conv.lastMessage}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(conv.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteConv(conv.id)}
                      disabled={deletingId === conv.id}
                      className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      aria-label="Delete conversation"
                    >
                      {deletingId === conv.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          ⚕️ HealthAI provides general wellness information only. Not a substitute for professional medical care.
        </p>
      </div>
    </div>
  );
}
