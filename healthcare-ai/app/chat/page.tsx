"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  LayoutDashboard,
  LogOut,
  Loader2,
  RefreshCw,
  Trash2,
  Headphones,
  TestTube2,
  NotebookPen,
  Square,
} from "lucide-react";
import {
  getCurrentUser,
  getUserProfile,
  logoutUser,
  saveConversation,
  initializeParse,
} from "@/lib/parse-client";
import { detectEmergency } from "@/lib/emergency-detector";
import { extractCompleteSentences } from "@/lib/speech-sanitize";
import EmergencyBanner from "@/components/EmergencyBanner";
import ChatMessage from "@/components/ChatMessage";
import HealthLogForm from "@/components/HealthLogForm";
import UserProfilePanel from "@/components/UserProfilePanel";
import MicButton from "@/components/MicButton";
import TalkingAvatar, { type AvatarState } from "@/components/TalkingAvatar";
import VoiceDisclosure from "@/components/VoiceDisclosure";
import LowStimToggle from "@/components/LowStimToggle";
import { useSpeechOutput } from "@/hooks/useSpeechOutput";
import { useVoiceInput, type VoiceInputError } from "@/hooks/useVoiceInput";
import type { Message, UserProfile } from "@/types/health";

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi, I'm Aura, ClearSignal's AI companion. I can help with general health questions, symptom information, and wellness guidance.\n\n⚕️ Important: I provide general information only — I'm not a substitute for professional medical advice. For any medical concerns, please consult a qualified healthcare provider.\n\nHow can I help you today? Please describe what you're experiencing, and I'll ask a few follow-up questions to better understand your situation.",
  timestamp: new Date().toISOString(),
};

const VOICE_DISCLOSURE_KEY = "healthai_voice_disclosure_seen";

export default function ChatPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [lastSymptoms, setLastSymptoms] = useState("");
  const [conversationSaved, setConversationSaved] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showVoiceDisclosure, setShowVoiceDisclosure] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voiceTriggeredRef = useRef(false);
  const spokenUpToRef = useRef(0);
  const conversationModeRef = useRef(false);
  const disclosureSeenRef = useRef(true);
  const wasSpeakingRef = useRef(false);

  const { isSpeaking, level: speechLevel, beginStream, enqueueSentence, speak, stop: stopSpeaking, unlock } = useSpeechOutput();

  const handleVoiceTranscript = useCallback((text: string) => {
    voiceTriggeredRef.current = true;
    setInput(text);
    inputRef.current?.focus();
  }, []);

  const handleVoiceError = useCallback((error: VoiceInputError) => {
    setVoiceError(error.message);
  }, []);

  const { state: voiceState, level: voiceLevel, start: startVoice, stop: stopVoice } = useVoiceInput({
    language: profile?.preferredLanguage,
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError,
  });

  useEffect(() => {
    initializeParse();
    const user = getCurrentUser();
    if (!user) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- profile read depends on browser-only Parse SDK state, must stay effect-gated
    setProfile(getUserProfile());
  }, [router]);

  useEffect(() => {
    disclosureSeenRef.current = typeof window !== "undefined" && localStorage.getItem(VOICE_DISCLOSURE_KEY) === "true";
  }, []);

  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(null), 6000);
    return () => clearTimeout(t);
  }, [voiceError]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Hands-free conversation mode: once the assistant finishes speaking, start
  // listening again automatically instead of making the user re-tap the mic. The
  // transcript still lands in the composer for review — this only skips the
  // re-tap, it never skips the review-before-send step.
  useEffect(() => {
    if (wasSpeakingRef.current && !isSpeaking && conversationModeRef.current && voiceState === "idle" && !streaming) {
      startVoice();
    }
    wasSpeakingRef.current = isSpeaking;
  }, [isSpeaking, streaming, voiceState, startVoice]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    const wasVoiceTriggered = voiceTriggeredRef.current;
    voiceTriggeredRef.current = false;
    spokenUpToRef.current = 0;
    if (wasVoiceTriggered) beginStream(profile?.preferredLanguage);

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
        // Surface the server's actual reason (rate limit, validation, upstream
        // AI-provider failure, etc.) instead of masking every failure behind
        // one generic message — the prior version of this screen made every
        // production error indistinguishable from every other one.
        let serverMessage = "";
        try {
          const body = await res.clone().json();
          serverMessage = typeof body?.error === "string" ? body.error : "";
        } catch {
          // Non-JSON error body (e.g. a platform-level 502/504) — fall through to the status code.
        }
        throw new Error(serverMessage || `Request failed (HTTP ${res.status}). Please try again.`);
      }

      const evidenceTier = res.headers.get("X-Evidence-Tier");
      if (evidenceTier) {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, evidenceTier } : m)));
      }

      const sourcesHeader = res.headers.get("X-RAG-Sources");
      if (sourcesHeader) {
        try {
          const sources = JSON.parse(atob(sourcesHeader)) as Message["sources"];
          if (sources?.length) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
            );
          }
        } catch {
          // Malformed/missing sources header shouldn't block the answer itself.
        }
      }

      const coinfectionHeader = res.headers.get("X-Coinfection-Notes");
      if (coinfectionHeader) {
        try {
          const coinfectionNotes = JSON.parse(atob(coinfectionHeader)) as Message["coinfectionNotes"];
          if (coinfectionNotes?.length) {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, coinfectionNotes } : m))
            );
          }
        } catch {
          // Same — non-critical, shouldn't block the answer.
        }
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

          if (wasVoiceTriggered) {
            const { sentences, consumedUpTo } = extractCompleteSentences(full, spokenUpToRef.current);
            if (sentences.length > 0) {
              spokenUpToRef.current = consumedUpTo;
              for (const s of sentences) enqueueSentence(s);
            }
          }
        }
      }

      if (wasVoiceTriggered) {
        const trailing = full.slice(spokenUpToRef.current).trim();
        if (trailing) enqueueSentence(trailing);
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        const detail = err instanceof Error && err.message ? err.message : "Please try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Sorry, I couldn't get a response: ${detail} If this is an emergency, call 911 immediately.`,
                }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages, profile, beginStream, enqueueSentence]);

  const handleMicStart = useCallback(() => {
    unlock();
    if (!disclosureSeenRef.current) {
      setShowVoiceDisclosure(true);
      disclosureSeenRef.current = true;
      if (typeof window !== "undefined") localStorage.setItem(VOICE_DISCLOSURE_KEY, "true");
    }
    startVoice();
  }, [unlock, startVoice]);

  const handleBargeIn = useCallback(() => {
    stopSpeaking();
  }, [stopSpeaking]);

  // Turning hands-free mode off only stopped *future* auto-restarts
  // (conversationModeRef gates the effect above) — it didn't stop a recording
  // already in progress, so the mic could keep listening after the user
  // clearly signaled they were done. Stop it immediately here instead.
  const handleToggleConversationMode = useCallback(() => {
    setConversationMode((prev) => {
      const next = !prev;
      if (!next) stopVoice();
      return next;
    });
  }, [stopVoice]);

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

  const voiceStatus = isSpeaking
    ? "Aura is speaking"
    : voiceState === "listening"
    ? "Aura is listening"
    : voiceState === "transcribing"
    ? "Transcribing your question"
    : streaming
    ? "Aura is thinking"
    : "";

  const avatarState: AvatarState = isSpeaking
    ? "speaking"
    : voiceState === "listening"
    ? "listening"
    : voiceState === "transcribing" || streaming
    ? "thinking"
    : "idle";
  const avatarLevel = isSpeaking ? speechLevel : voiceState === "listening" ? voiceLevel : 0;

  return (
    <div className="h-screen flex flex-col bg-midnight-950 text-slate-100">
      <div className="sr-only" role="status" aria-live="polite">
        {voiceStatus}
      </div>

      {/* Decorative background depth — pure CSS, no assets, purely cosmetic.
          Faint dot grid + three glowing orbs (teal/cyan/violet) breathing at
          staggered offsets, respecting data-low-stim via the global
          animation-duration override in globals.css. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle, #2dd4bf 1px, transparent 1px)", backgroundSize: "36px 36px" }}
        />
        <div className="absolute -top-24 -left-24 w-[32rem] h-[32rem] rounded-full bg-teal-500/25 blur-3xl animate-glow-pulse" />
        <div
          className="absolute top-1/3 -right-40 w-[32rem] h-[32rem] rounded-full bg-cyan-500/20 blur-3xl animate-glow-pulse"
          style={{ animationDelay: "1.3s" }}
        />
        <div
          className="absolute -bottom-40 left-1/4 w-[32rem] h-[32rem] rounded-full bg-violet-500/15 blur-3xl animate-glow-pulse"
          style={{ animationDelay: "2.6s" }}
        />
      </div>

      {showEmergency && (
        <EmergencyBanner onDismiss={() => setShowEmergency(false)} />
      )}
      {showVoiceDisclosure && (
        <VoiceDisclosure onDismiss={() => setShowVoiceDisclosure(false)} />
      )}

      {/* Top nav */}
      <header className="glass-panel px-4 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <TalkingAvatar state={avatarState} level={avatarLevel} size={42} />
          <div className="leading-tight">
            <span className="font-display font-semibold text-slate-100 tracking-tight">ClearSignal</span>
            <p className="text-[11px] text-slate-400 -mt-0.5">Aura, your health companion</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/journal"
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-cyan-300 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <NotebookPen className="w-4 h-4" />
            <span className="hidden sm:inline">Journal</span>
          </Link>
          <Link
            href="/test-context"
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-cyan-300 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <TestTube2 className="w-4 h-4" />
            <span className="hidden sm:inline">Test Timing</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-cyan-300 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <LowStimToggle />
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — a column of floating glass widgets rather than a flush
            bordered panel, matching the "floating AR dashboard" direction. */}
        <aside className="hidden lg:flex flex-col w-72 overflow-y-auto scrollbar-thin p-3 gap-3 shrink-0">
          <div className="glass-panel rounded-2xl p-3.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Signed in as
            </p>
            <p className="text-sm font-medium text-slate-100">{profile.username}</p>
          </div>

          <UserProfilePanel
            profile={profile}
            onUpdated={(updated) =>
              setProfile((prev) => prev ? { ...prev, ...updated } : prev)
            }
          />

          <HealthLogForm prefillSymptoms={lastSymptoms} />

          <div className="mt-auto space-y-2 glass-panel rounded-2xl p-3">
            <button
              onClick={handleSaveConversation}
              className="w-full flex items-center justify-center gap-2 text-sm text-slate-300 hover:text-teal-300 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              {conversationSaved ? "✓ Saved!" : "Save Conversation"}
            </button>
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 text-sm text-slate-300 hover:text-slate-100 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>

          <div className="text-xs text-slate-500 text-center pt-2 border-t border-white/10">
            ⚕️ General wellness info only. Not medical advice.
          </div>
        </aside>

        {/* Chat area */}
        <main className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
            <div className="max-w-2xl mx-auto">
              {messages.length === 1 && messages[0].id === "welcome" && (
                <div className="flex flex-col items-center text-center pt-10 pb-10">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-teal-400/25 blur-2xl animate-glow-pulse" aria-hidden="true" />
                    <TalkingAvatar state={avatarState} level={avatarLevel} size={104} />
                  </div>
                  <h1 className="mt-6 font-display text-2xl sm:text-3xl font-semibold text-slate-50 tracking-tight">
                    Navigate complex symptoms with clarity
                  </h1>
                  <p className="mt-2.5 max-w-md text-sm text-slate-400">
                    I&apos;m Aura, ClearSignal&apos;s AI companion — ask about symptoms, exposure, or testing, and
                    I&apos;ll ground every answer in real CDC data, with sources and an honest confidence level.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md">
                    {[
                      "What does a negative Lyme test really mean?",
                      "How do I log a symptom?",
                      "What should I ask my doctor?",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => sendMessage(suggestion)}
                        className="glass-panel rounded-full px-3.5 py-2 text-xs text-slate-200 hover:text-teal-300 hover:glow-ring-teal transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages
                .filter((msg) => msg.id !== "welcome")
                .map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onSpeak={(text) => speak(text, profile?.preferredLanguage)}
                  />
                ))}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex gap-3 mb-4 items-center">
                  <TalkingAvatar state="thinking" size={32} />
                  <div className="glass-panel-strong rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-400">
                    Aura is thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Disclaimer bar — deliberately kept solid and high-contrast, not
              glassed/faded, regardless of the rest of the redesign: this is
              a safety-relevant statement, not decorative chrome. */}
          <div className="bg-amber-900 border-t border-amber-600/40 px-4 py-1.5 flex items-center justify-center gap-3 text-center text-xs text-amber-100">
            <span>⚕️ This AI provides general information only — not a substitute for professional medical advice.</span>
            {voiceStatus && (
              <span className="flex items-center gap-1.5 text-teal-300 font-medium shrink-0">
                <TalkingAvatar state={avatarState} level={avatarLevel} size={18} />
                {voiceStatus}
              </span>
            )}
            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/25 hover:bg-red-500/35 text-red-100 font-semibold shrink-0 transition-colors"
              >
                <Square className="w-3 h-3" fill="currentColor" />
                Stop
              </button>
            )}
          </div>

          {voiceError && (
            <div className="bg-red-900 border-t border-red-600/40 px-4 py-1.5 text-center text-xs text-red-100" role="alert">
              {voiceError}
            </div>
          )}

          {/* Input area */}
          <div className="glass-panel px-4 py-3">
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-2 items-end">
                <TalkingAvatar state={avatarState} level={avatarLevel} size={50} className="mb-0.5" />
                <textarea
                  ref={inputRef}
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
                  className="flex-1 resize-none px-4 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:glow-ring-cyan focus:border-cyan-400/40 transition max-h-32 scrollbar-thin"
                  style={{ minHeight: "44px" }}
                />
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleConversationMode}
                    disabled={streaming}
                    title={conversationMode ? "Turn off hands-free conversation mode" : "Turn on hands-free conversation mode"}
                    aria-label="Toggle hands-free conversation mode"
                    aria-pressed={conversationMode}
                    className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                      conversationMode
                        ? "bg-teal-500/20 text-teal-300 hover:bg-teal-500/30"
                        : "bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-50"
                    }`}
                  >
                    <Headphones className="w-4 h-4" />
                  </button>
                  <MicButton
                    state={voiceState}
                    level={voiceLevel}
                    isSpeaking={isSpeaking}
                    onStart={handleMicStart}
                    onStop={stopVoice}
                    onBargeIn={handleBargeIn}
                    disabled={streaming}
                  />
                  {streaming && (
                    <button
                      onClick={() => abortRef.current?.abort()}
                      className="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-colors"
                      title="Stop"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || streaming}
                    className="p-2.5 rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 hover:from-teal-500 hover:to-teal-700 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all hover:scale-105 disabled:hover:scale-100 disabled:shadow-none"
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
                  className="flex-1 text-xs text-slate-400 py-1.5 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                >
                  New Chat
                </button>
                <button
                  onClick={handleSaveConversation}
                  className="flex-1 text-xs text-slate-400 py-1.5 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
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
