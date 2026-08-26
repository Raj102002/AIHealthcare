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
 * Original character, not a reproduction of any existing product's avatar —
 * a rounded, glossy "3D sticker" face built from layered SVG gradients and
 * highlights (fake specular light, fake ambient-occlusion shading, a soft
 * drop shadow) rather than a flat icon, so it reads as a dimensional
 * character instead of a UI glyph. Built entirely from inline SVG in the
 * app's own teal/navy palette so it never needs a network image asset.
 *
 * Mouth openness follows `level` when we have real amplitude data (Groq TTS
 * playback, or mic input while listening); when we don't (browser
 * SpeechSynthesis fallback has no readable audio buffer) it falls back to a
 * synthetic talk cadence so the avatar still looks alive rather than frozen.
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
  const eyeScaleY = blinking ? 0.08 : state === "listening" ? 1.12 : 1;
  const browLift = state === "listening" ? -1.5 : state === "thinking" ? -0.5 : 0;
  const ringScale = 1 + (state === "listening" || state === "speaking" ? level * 0.5 : 0);

  const ringColor =
    state === "listening" ? "#2DB49E" : state === "speaking" ? "#5EEAD4" : state === "thinking" ? "#E8A83C" : "transparent";

  const uid = "ta"; // gradient ids scoped per-instance is unnecessary here (single avatar on screen at a time per size)

  return (
    <div
      className={`relative shrink-0 ${className} ${state === "idle" ? "animate-avatar-bob" : ""}`}
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

      <svg viewBox="0 0 100 100" width={size} height={size} className="relative overflow-visible">
        <defs>
          {/* Base sphere shading: light top-left, deep shadow bottom-right */}
          <radialGradient id={`${uid}-face`} cx="34%" cy="28%" r="85%">
            <stop offset="0%" stopColor="#3FD8BE" />
            <stop offset="45%" stopColor="#1FA08C" />
            <stop offset="80%" stopColor="#0F5B50" />
            <stop offset="100%" stopColor="#0B1F3A" />
          </radialGradient>
          {/* Glossy specular highlight, like light bouncing off a rounded plastic/glass surface */}
          <radialGradient id={`${uid}-shine`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          {/* Soft floor shadow */}
          <radialGradient id={`${uid}-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-mouth`} cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2A0F14" />
            <stop offset="100%" stopColor="#0B1F3A" />
          </radialGradient>
        </defs>

        {/* Floor shadow */}
        <ellipse cx="50" cy="92" rx="28" ry="6" fill={`url(#${uid}-shadow)`} />

        {/* Head sphere */}
        <circle cx="50" cy="48" r="44" fill={`url(#${uid}-face)`} />
        {/* Bottom rim shading for extra roundness */}
        <path d="M8,55 A44,44 0 0 0 92,55 A44,50 0 0 1 8,55 Z" fill="#0B1F3A" opacity="0.22" />
        {/* Glossy highlight */}
        <ellipse cx="34" cy="26" rx="22" ry="16" fill={`url(#${uid}-shine)`} />

        {/* Cheeks */}
        <ellipse cx="24" cy="58" rx="7.5" ry="5.5" fill="#F5A9A9" opacity="0.4" />
        <ellipse cx="76" cy="58" rx="7.5" ry="5.5" fill="#F5A9A9" opacity="0.4" />

        {/* Eyebrows */}
        <g stroke="#0B1F3A" strokeWidth="2.6" strokeLinecap="round" opacity="0.55">
          <path d={`M31,${34 + browLift} q6,-3 12,0`} fill="none" />
          <path d={`M57,${34 + browLift} q6,-3 12,0`} fill="none" />
        </g>

        {/* Eyes — bigger, rounder, with a catchlight for a glossy "3D toy" look */}
        <g style={{ transformOrigin: "38px 46px", transition: "transform 90ms ease" }}>
          <ellipse cx="38" cy="46" rx="7" ry={8.5 * eyeScaleY} fill="white" />
          <circle cx="38" cy={46 + (1 - eyeScaleY) * 2.5} r="3.4" fill="#0B1F3A" />
          <circle cx="36.2" cy={44.2 + (1 - eyeScaleY) * 2.5} r="1.1" fill="white" opacity="0.9" />
        </g>
        <g style={{ transformOrigin: "62px 46px", transition: "transform 90ms ease" }}>
          <ellipse cx="62" cy="46" rx="7" ry={8.5 * eyeScaleY} fill="white" />
          <circle cx="62" cy={46 + (1 - eyeScaleY) * 2.5} r="3.4" fill="#0B1F3A" />
          <circle cx="60.2" cy={44.2 + (1 - eyeScaleY) * 2.5} r="1.1" fill="white" opacity="0.9" />
        </g>

        {/* Thinking: small drifting dots instead of a mouth */}
        {state === "thinking" ? (
          <g fill="white" opacity="0.9">
            <circle cx="42" cy="68" r="2.6">
              <animate attributeName="cy" values="68;64;68" dur="1s" repeatCount="indefinite" begin="0s" />
            </circle>
            <circle cx="50" cy="68" r="2.6">
              <animate attributeName="cy" values="68;64;68" dur="1s" repeatCount="indefinite" begin="0.15s" />
            </circle>
            <circle cx="58" cy="68" r="2.6">
              <animate attributeName="cy" values="68;64;68" dur="1s" repeatCount="indefinite" begin="0.3s" />
            </circle>
          </g>
        ) : (
          <g style={{ transition: "transform 60ms linear" }}>
            {/* Outer lip shape */}
            <rect
              x="38"
              y={66 - (2.5 + mouthOpen * 9)}
              width="24"
              height={(2.5 + mouthOpen * 9) * 2}
              rx={(2.5 + mouthOpen * 9)}
              fill={`url(#${uid}-mouth)`}
              opacity="0.9"
            />
            {/* Inner highlight sliver when open, for a soft rounded-3D lip edge */}
            {mouthOpen > 0.15 && (
              <ellipse cx="50" cy={66 - (2.5 + mouthOpen * 9) * 0.55} rx="9" ry="1.4" fill="#F2A6A6" opacity="0.35" />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
