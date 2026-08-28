"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  RefreshCw,
  Trash2,
  Headphones,
  Square,
} from "lucide-react";
import {
  getCurrentUser,
  getUserProfile,
  saveConversation,
  initializeParse,
} from "@/lib/parse-client";
import { detectEmergency } from "@/lib/emergency-detector";
import { extractCompleteSentences } from "@/lib/speech-sanitize";
import EscalationCard from "@/components/ui/EscalationCard";
import Turn from "@/components/ui/Turn";
import AssayStrip from "@/components/ui/AssayStrip";
import Composer from "@/components/ui/Composer";
import SignalMark from "@/components/ui/SignalMark";
import MonoLabel from "@/components/ui/MonoLabel";
import HealthLogForm from "@/components/HealthLogForm";
import UserProfilePanel from "@/components/UserProfilePanel";
import MicButton from "@/components/MicButton";
import VoiceDisclosure from "@/components/VoiceDisclosure";
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

  const { isSpeaking, beginStream, enqueueSentence, speak, stop: stopSpeaking, unlock } = useSpeechOutput();

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
      const evidenceScoreHeader = res.headers.get("X-Evidence-Score");
      const evidenceScore = evidenceScoreHeader ? Number(evidenceScoreHeader) : undefined;
      if (evidenceTier) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, evidenceTier, evidenceScore } : m))
        );
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

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pitch">
        <Loader2 className="w-6 h-6 animate-spin text-assay" />
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

  const signalActive = isSpeaking || voiceState === "listening" || voiceState === "transcribing" || streaming;
  const isEmptyConversation = messages.length === 1 && messages[0].id === "welcome";

  return (
    <div className="h-screen flex flex-col bg-pitch text-bone">
      <div className="sr-only" role="status" aria-live="polite">
        {voiceStatus}
      </div>

      {showEmergency && <EscalationCard onDismiss={() => setShowEmergency(false)} />}
      {showVoiceDisclosure && (
        <VoiceDisclosure onDismiss={() => setShowVoiceDisclosure(false)} />
      )}

      {/* Branding strip only -- destination nav and account actions live in
          the global AppNav (components/AppNav.tsx) right above this. */}
      <header className="bg-slate border-b border-rule px-4 py-2.5 flex items-center shrink-0">
        <div className="flex items-center gap-2.5">
          <SignalMark size={22} active={signalActive} />
          <div className="leading-tight">
            <span className="font-display font-semibold text-bone tracking-tight">ClearSignal</span>
            <p className="text-[11px] text-moss -mt-0.5">Aura, your health companion</p>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 overflow-y-auto scrollbar-thin p-3 gap-3 shrink-0 border-r border-rule">
          {(profile.email || profile.username) && (
            <div className="bg-slate border border-rule rounded-lg p-3.5">
              <MonoLabel className="text-moss mb-1.5" as="p">
                Signed in as
              </MonoLabel>
              <p className="text-sm font-medium text-bone truncate">{profile.email || profile.username}</p>
            </div>
          )}

          <div className="space-y-1.5 bg-slate border border-rule rounded-lg p-3">
            <button
              onClick={handleSaveConversation}
              className="w-full flex items-center justify-center gap-2 text-sm text-moss hover:text-bone py-2 rounded-md hover:bg-rule transition-colors"
            >
              {conversationSaved ? "✓ Saved!" : "Save Conversation"}
            </button>
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 text-sm text-moss hover:text-bone py-2 rounded-md hover:bg-rule transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>

          <UserProfilePanel
            profile={profile}
            onUpdated={(updated) =>
              setProfile((prev) => prev ? { ...prev, ...updated } : prev)
            }
          />

          <HealthLogForm prefillSymptoms={lastSymptoms} />
        </aside>

        {/* Chat area -- AssayStrip rides alongside the transcript column,
            not the sidebar or the page as a whole. */}
        <main className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 flex">
              <AssayStrip messages={messages} />
              <div
                className={`flex-1 max-w-2xl mx-auto w-full ${isEmptyConversation ? "flex flex-col justify-center" : ""}`}
              >
                {isEmptyConversation && (
                  <div className="flex flex-col items-center text-center pb-4">
                    <SignalMark size={56} active={signalActive} />
                    <h1 className="mt-6 font-display text-2xl sm:text-3xl font-semibold text-bone tracking-tight">
                      Navigate complex symptoms with clarity
                    </h1>
                    <p className="mt-2.5 max-w-md text-sm text-moss">
                      I&apos;m Aura, ClearSignal&apos;s AI companion — ask about symptoms, exposure, or testing, and
                      I&apos;ll ground every answer in real CDC data, with sources and an honest confidence level.
                    </p>
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full max-w-xl">
                      {[
                        "What does a negative Lyme test really mean?",
                        "How do I log a symptom?",
                        "What should I ask my doctor?",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => sendMessage(suggestion)}
                          className="border border-rule rounded-lg px-3.5 py-2.5 text-xs text-bone hover:border-assay transition-colors text-center"
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
                    <Turn
                      key={msg.id}
                      message={msg}
                      onSpeak={(text) => speak(text, profile?.preferredLanguage)}
                    />
                  ))}
                {streaming && messages[messages.length - 1]?.content === "" && (
                  <div className="mb-8 pl-4 border-l-2 border-assay flex items-center gap-2">
                    <SignalMark size={16} active />
                    <MonoLabel className="text-moss">Aura is thinking</MonoLabel>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            {/* Voice status — only rendered while actually relevant, not a
                permanent bar. The one standing disclaimer line lives once,
                under the composer (below), instead of duplicated here too. */}
            {voiceStatus && (
              <div className="bg-slate border-t border-rule px-4 py-1.5 flex items-center justify-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-assay font-medium shrink-0">
                  <SignalMark size={14} active />
                  {voiceStatus}
                </span>
                {isSpeaking && (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-flare text-pitch font-semibold shrink-0 hover:opacity-85 transition-opacity"
                  >
                    <Square className="w-3 h-3" fill="currentColor" />
                    Stop
                  </button>
                )}
              </div>
            )}

            {voiceError && (
              <div className="bg-slate border-t border-flare/40 px-4 py-1.5 text-center text-xs text-flare" role="alert">
                {voiceError}
              </div>
            )}

            {/* Input area */}
            <div className="bg-slate border-t border-rule px-4 py-3">
              <div className="max-w-2xl mx-auto">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={sendMessage}
                  placeholder="Describe your symptoms or ask a health question… (Enter to send)"
                  disabled={streaming}
                  inputRef={inputRef}
                  leading={<SignalMark size={28} active={signalActive} className="mb-1" />}
                  trailing={
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleToggleConversationMode}
                        disabled={streaming}
                        title={conversationMode ? "Turn off hands-free conversation mode" : "Turn on hands-free conversation mode"}
                        aria-label="Toggle hands-free conversation mode"
                        aria-pressed={conversationMode}
                        className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                          conversationMode
                            ? "border-assay text-assay"
                            : "border-rule text-moss hover:text-bone hover:border-moss disabled:opacity-50"
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
                          className="p-2.5 rounded-lg border border-rule text-moss hover:text-flare hover:border-flare transition-colors"
                          title="Stop"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || streaming}
                        className="p-2.5 rounded-lg bg-assay text-pitch disabled:bg-rule disabled:text-moss transition-colors"
                        title="Send"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  }
                />

                <p className="text-center text-[11px] text-moss mt-2.5">
                  ⚕️ General information only — not a substitute for professional medical advice.
                </p>

                {/* Mobile quick actions */}
                <div className="flex gap-2 mt-2 lg:hidden">
                  <button
                    onClick={handleNewChat}
                    className="flex-1 text-xs text-moss py-1.5 border border-rule rounded-md hover:border-moss transition-colors"
                  >
                    New Chat
                  </button>
                  <button
                    onClick={handleSaveConversation}
                    className="flex-1 text-xs text-moss py-1.5 border border-rule rounded-md hover:border-moss transition-colors"
                  >
                    {conversationSaved ? "✓ Saved" : "Save Chat"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
