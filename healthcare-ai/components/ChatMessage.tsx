"use client";

import { User, Bot, AlertTriangle, Volume2, HelpCircle } from "lucide-react";
import type { Message } from "@/types/health";

interface Props {
  message: Message;
  onSpeak?: (text: string) => void;
}

function formatContent(content: string): string {
  return content.replace(/^\[EMERGENCY\]\n?/i, "").trim();
}

export default function ChatMessage({ message, onSpeak }: Props) {
  const isUser = message.role === "user";
  const displayContent = formatContent(message.content);
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-teal-600" : "bg-slate-200"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-slate-600" />
        )}
      </div>

      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {message.isEmergency && !isUser && (
          <div className="flex items-center gap-1.5 text-red-600 text-xs font-semibold mb-0.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Emergency response</span>
          </div>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-teal-600 text-white rounded-tr-sm"
              : message.isEmergency
              ? "bg-red-50 text-slate-800 border border-red-200 rounded-tl-sm"
              : "bg-white text-slate-800 border border-slate-100 shadow-sm rounded-tl-sm"
          }`}
        >
          {displayContent}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="w-full pt-1 pb-0.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Sources
            </p>
            <ul className="space-y-0.5">
              {message.sources.map((s) => (
                <li key={s.number} className="text-xs text-slate-500">
                  <span className="text-slate-400">[{s.number}]</span>{" "}
                  {s.source_url ? (
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-teal-600 hover:underline"
                    >
                      {s.source_name} — {s.section_path}
                    </a>
                  ) : (
                    <span>
                      {s.source_name} — {s.section_path}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isUser && message.coinfectionNotes && message.coinfectionNotes.length > 0 && (
          <div className="w-full pt-1 pb-0.5 space-y-1.5">
            {message.coinfectionNotes.map((note) => (
              <div
                key={note.signal}
                className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800"
              >
                <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Question to ask your clinician: {note.question}</p>
                  {note.source && (
                    <p className="text-amber-600 mt-0.5">
                      {note.source.source_name} — {note.source.section_path}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{time}</span>
          {!isUser && onSpeak && displayContent && (
            <button
              type="button"
              onClick={() => onSpeak(displayContent)}
              title="Read aloud"
              className="text-slate-300 hover:text-teal-600 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
