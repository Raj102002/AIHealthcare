"use client";

import { Volume2, HelpCircle } from "lucide-react";
import type { Message } from "@/types/health";
import CitationChip from "./CitationChip";
import GroundingMeter from "./GroundingMeter";
import MonoLabel from "./MonoLabel";

interface Props {
  message: Message;
  onSpeak?: (text: string) => void;
}

function formatContent(content: string): string {
  return content.replace(/^\[EMERGENCY\]\n?/i, "").trim();
}

// No chat bubbles anywhere. User turns are unbordered display type (font-
// display/Bricolage), no background. Aura's turns are full-measure text in
// Newsreader at 18px/1.6, max-width 66ch, with a 2px left border in assay --
// flare instead, only when this specific turn was a red-flag escalation
// (message.isEmergency), never for a merely low-confidence answer.
export default function Turn({ message, onSpeak }: Props) {
  const isUser = message.role === "user";
  const displayContent = formatContent(message.content);
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
    return (
      <div className="mb-6 animate-message-in">
        <p className="font-display text-[15px] text-bone whitespace-pre-wrap">{displayContent}</p>
        <MonoLabel className="mt-1 text-moss">{time}</MonoLabel>
      </div>
    );
  }

  const borderColor = message.isEmergency ? "border-flare" : "border-assay";

  return (
    <div className={`mb-8 pl-4 border-l-2 ${borderColor} animate-message-in`}>
      <p className="font-serif text-[18px] leading-[1.6] text-bone max-w-[66ch] whitespace-pre-wrap">
        {displayContent}
      </p>

      {message.evidenceTier && (
        <div className="mt-3">
          <GroundingMeter tier={message.evidenceTier} score={message.evidenceScore} />
        </div>
      )}

      {message.sources && message.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 max-w-[66ch]">
          {message.sources.map((s) => (
            <CitationChip key={s.number} sourceName={s.source_name} sectionPath={s.section_path} url={s.source_url} />
          ))}
        </div>
      )}

      {message.coinfectionNotes && message.coinfectionNotes.length > 0 && (
        <div className="mt-3 space-y-2 max-w-[66ch]">
          {message.coinfectionNotes.map((note) => (
            <div key={note.signal} className="flex items-start gap-2 border border-rule rounded-md px-3 py-2">
              <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-moss" />
              <div>
                <p className="text-sm text-bone">Question to ask your clinician: {note.question}</p>
                {note.source && (
                  <MonoLabel className="mt-1 text-moss">{note.source.source_name}</MonoLabel>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <MonoLabel className="text-moss">{time}</MonoLabel>
        {onSpeak && displayContent && (
          <button
            type="button"
            onClick={() => onSpeak(displayContent)}
            title="Read aloud"
            className="text-moss hover:text-assay transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
