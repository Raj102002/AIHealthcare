"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Heart,
  LayoutDashboard,
  LogOut,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  getCurrentUser,
  getUserProfile,
  logoutUser,
  saveConversation,
  initializeParse,
} from "@/lib/parse-client";
import { detectEmergency } from "@/lib/emergency-detector";
import EmergencyBanner from "@/components/EmergencyBanner";
import ChatMessage from "@/components/ChatMessage";
import HealthLogForm from "@/components/HealthLogForm";
import UserProfilePanel from "@/components/UserProfilePanel";
import type { Message, UserProfile } from "@/types/health";

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm your HealthAI Assistant. I can help with general health questions, symptom information, and wellness guidance.\n\n⚕️ Important: I provide general information only — I'm not a substitute for professional medical advice. For any medical concerns, please consult a qualified healthcare provider.\n\nHow can I help you today? Please describe what you're experiencing, and I'll ask a few follow-up questions to better understand your situation.",
  timestamp: new Date().toISOString(),
};

export default function ChatPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [lastSymptoms, setLastSymptoms] = useState("");
  const [conversationSaved, setConversationSaved] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    initializeParse();
    const user = getCurrentUser();
    if (!user) {
      router.replace("/");
      return;
    }
    setProfile(getUserProfile());
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const isEmergency = detectEmergency(text);
    if (isEmergency) setShowEmergency(true);
    setLastSymptoms(text);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiMessages = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          userProfile: profile
            ? {
                allergies: profile.allergies,
                conditions: profile.conditions,
                medications: profile.medications,
                age: profile.age,
                bloodType: profile.bloodType,
                preferredLanguage: profile.preferredLanguage,
              }
            : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;

          const hasEmergency = /^\[EMERGENCY\]/i.test(full);
          if (hasEmergency) setShowEmergency(true);

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: full, isEmergency: hasEmergency }
                : m
            )
          );
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Sorry, I encountered an error. Please try again. If this is an emergency, call 911 immediately.",
                }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, profile]);

  async function handleSaveConversation() {
    try {
      const toSave = messages.filter((m) => m.id !== "welcome");
      if (!toSave.length) return;
      const firstUser = toSave.find((m) => m.role === "user");
      await saveConversation({
        title: firstUser?.content.slice(0, 60) || "Health conversation",
        messages: toSave.map((m) => ({ role: m.role, content: m.content })),
      });
      setConversationSaved(true);
      setTimeout(() => setConversationSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save conversation:", err);
    }
  }

  function handleNewChat() {
    abortRef.current?.abort();
    setMessages([WELCOME]);
    setShowEmergency(false);
    setLastSymptoms("");
    setConversationSaved(false);
  }

  async function handleLogout() {
    await logoutUser();
    router.replace("/");
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {showEmergency && (
        <EmergencyBanner onDismiss={() => setShowEmergency(false)} />
      )}

      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="font-semibold text-slate-900">HealthAI</span>
        </div>

        <div className="flex items-center gap-1">
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

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 border-r border-slate-200 bg-white overflow-y-auto scrollbar-thin p-4 gap-4 shrink-0">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Signed in as
            </p>
            <p className="text-sm font-medium text-slate-800">{profile.username}</p>
          </div>

          <UserProfilePanel
            profile={profile}
            onUpdated={(updated) =>
              setProfile((prev) => prev ? { ...prev, ...updated } : prev)
            }
          />

          <HealthLogForm prefillSymptoms={lastSymptoms} />

          <div className="mt-auto space-y-2">
            <button
              onClick={handleSaveConversation}
              className="w-full flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-teal-600 py-2 border border-slate-200 rounded-xl hover:border-teal-300 transition-colors"
            >
              {conversationSaved ? "✓ Saved!" : "Save Conversation"}
            </button>
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-slate-800 py-2 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>

          <div className="text-xs text-slate-400 text-center pt-2 border-t border-slate-100">
            ⚕️ General wellness info only. Not medical advice.
          </div>
        </aside>

        {/* Chat area */}
        <main className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
            <div className="max-w-2xl mx-auto">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                  </div>
                  <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-400">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Disclaimer bar */}
          <div className="bg-amber-50 border-t border-amber-100 px-4 py-1.5 text-center text-xs text-amber-700">
            ⚕️ This AI provides general information only — not a substitute for professional medical advice.
          </div>

          {/* Input area */}
          <div className="bg-white border-t border-slate-200 px-4 py-3">
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Describe your symptoms or ask a health question… (Enter to send)"
                  rows={1}
                  className="flex-1 resize-none px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition max-h-32 scrollbar-thin"
                  style={{ minHeight: "44px" }}
                />
                <div className="flex gap-1.5 shrink-0">
                  {streaming && (
                    <button
                      onClick={() => abortRef.current?.abort()}
                      className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                      title="Stop"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || streaming}
                    className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white transition-colors"
                    title="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mobile quick actions */}
              <div className="flex gap-2 mt-2 lg:hidden">
                <button
                  onClick={handleNewChat}
                  className="flex-1 text-xs text-slate-500 py-1.5 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                >
                  New Chat
                </button>
                <button
                  onClick={handleSaveConversation}
                  className="flex-1 text-xs text-slate-500 py-1.5 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                >
                  {conversationSaved ? "✓ Saved" : "Save Chat"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
