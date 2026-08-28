"use client";

import type { RefObject } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

// Purely presentational -- the send/voice/hands-free state machine stays in
// app/chat/page.tsx exactly as it was (explicitly out of scope: "do not
// touch business logic"). This only extracts the visual shell so it's not
// hand-rolled inline, with `leading`/`trailing` slots for the avatar mark
// and button cluster the page still owns.
export default function Composer({ value, onChange, onSend, placeholder, disabled, inputRef, leading, trailing }: Props) {
  return (
    <div className="flex gap-3 items-end">
      {leading}
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none px-4 py-3 bg-transparent border border-rule rounded-lg font-display text-[15px] text-bone placeholder:text-moss focus:outline-none focus:border-assay focus:ring-1 focus:ring-assay transition max-h-32 scrollbar-thin disabled:opacity-50"
        style={{ minHeight: "48px" }}
      />
      {trailing}
    </div>
  );
}
