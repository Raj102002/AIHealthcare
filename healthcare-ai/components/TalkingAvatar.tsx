"use client";

import { useEffect, useState } from "react";

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  state: AvatarState;
  /** 0–1 amplitude, driven by mic input while listening or TTS output while speaking. */
  level?: number;
  size?: number;
  className?: string;
}

/**
 * Original character, not a reproduction of any existing IP — round-faced,
 * expressive, built entirely from inline SVG in the app's own teal/navy
 * palette so it never needs a network asset. Mouth openness follows `level`
 * when we have real amplitude data (Groq TTS playback, or mic input while
 * listening); when we don't (browser SpeechSynthesis fallback has no
 * readable audio buffer) it falls back to a synthetic talk cadence so the
 * avatar still looks alive rather than frozen.
 */
export default function TalkingAvatar({ state, level = 0, size = 72, className = "" }: Props) {
  const [blinking, setBlinking] = useState(false);
  const [synthTick, setSynthTick] = useState(0);

  // Occasional idle blink — purely cosmetic, so a random interval is fine.
  useEffect(() => {
    let cancelled = false;
    function scheduleBlink() {
      const delay = 2600 + Math.random() * 2600;
      const t = setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        setTimeout(() => !cancelled && setBlinking(false), 140);
        scheduleBlink();
      }, delay);
      return t;
    }
    const t = scheduleBlink();
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  // Synthetic mouth movement for when we're speaking but have no real
  // amplitude (SpeechSynthesis fallback) — a gentle, non-random cadence so it
  // reads as "talking," not glitching.
  useEffect(() => {
    if (state !== "speaking" || level > 0.04) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      setSynthTick(Math.abs(Math.sin((now - start) / 140)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, level]);

  const mouthOpen = state === "speaking" ? Math.max(level, level > 0.04 ? level : synthTick * 0.7) : 0;
  const eyeScaleY = blinking ? 0.08 : state === "listening" ? 1.1 : 1;
  const ringScale = 1 + (state === "listening" || state === "speaking" ? level * 0.5 : 0);

  const ringColor =
    state === "listening" ? "#2DB49E" : state === "speaking" ? "#5EEAD4" : state === "thinking" ? "#E8A83C" : "transparent";

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        state === "listening"
          ? "Assistant is listening"
          : state === "speaking"
          ? "Assistant is speaking"
          : state === "thinking"
          ? "Assistant is thinking"
          : "Assistant is idle"
      }
    >
      {/* Pulse ring — reacts to level while listening/speaking, breathes gently while idle */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-full ${state === "idle" ? "animate-pulse" : ""}`}
        style={{
          background: ringColor,
          opacity: state === "idle" ? 0.12 : 0.28,
          transform: `scale(${ringScale})`,
          transition: "transform 90ms linear",
        }}
      />

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="relative"
        style={{ transform: state === "idle" ? undefined : "scale(1.0)" }}
      >
        <defs>
          <radialGradient id="avatarFace" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2FC7AE" />
            <stop offset="55%" stopColor="#1B8E7D" />
            <stop offset="100%" stopColor="#0B1F3A" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="50" r="46" fill="url(#avatarFace)" />

        {/* Cheeks */}
        <circle cx="27" cy="60" r="7" fill="#F2A6A6" opacity="0.35" />
        <circle cx="73" cy="60" r="7" fill="#F2A6A6" opacity="0.35" />

        {/* Eyes */}
        <g style={{ transformOrigin: "38px 46px", transition: "transform 90ms ease" }}>
          <ellipse cx="38" cy="46" rx="6" ry={7 * eyeScaleY} fill="white" />
          <circle cx="38" cy={46 + (1 - eyeScaleY) * 2} r="2.6" fill="#0B1F3A" />
        </g>
        <g style={{ transformOrigin: "62px 46px", transition: "transform 90ms ease" }}>
          <ellipse cx="62" cy="46" rx="6" ry={7 * eyeScaleY} fill="white" />
          <circle cx="62" cy={46 + (1 - eyeScaleY) * 2} r="2.6" fill="#0B1F3A" />
        </g>

        {/* Thinking: small drifting dots instead of a mouth */}
        {state === "thinking" ? (
          <g fill="white" opacity="0.9">
            <circle cx="42" cy="68" r="2.4">
              <animate attributeName="cy" values="68;64;68" dur="1s" repeatCount="indefinite" begin="0s" />
            </circle>
            <circle cx="50" cy="68" r="2.4">
              <animate attributeName="cy" values="68;64;68" dur="1s" repeatCount="indefinite" begin="0.15s" />
            </circle>
            <circle cx="58" cy="68" r="2.4">
              <animate attributeName="cy" values="68;64;68" dur="1s" repeatCount="indefinite" begin="0.3s" />
            </circle>
          </g>
        ) : (
          <ellipse
            cx="50"
            cy="66"
            rx={state === "idle" ? 8 : 9}
            ry={2.5 + mouthOpen * 9}
            fill="#0B1F3A"
            opacity="0.85"
            style={{ transition: "ry 60ms linear" }}
          />
        )}
      </svg>
    </div>
  );
}
