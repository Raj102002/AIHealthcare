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
 * Original illustrated character (not a photo, not a reproduction of any
 * real person or existing product's avatar) — a simple human bust: face,
 * hair, shoulders/collar, cropped into a circle like a portrait photo. Built
 * entirely from inline SVG in the app's own palette so it never needs a
 * network image asset, and never raises the likeness/licensing problems a
 * real photo or a generated photoreal face would.
 *
 * Mouth openness follows `level` when we have real amplitude data (Groq TTS
 * playback, or mic input while listening); when we don't (browser
 * SpeechSynthesis fallback has no readable audio buffer) it falls back to a
 * synthetic talk cadence. While speaking, the head also turns/tilts gently
 * on its own cadence — independent of amplitude — so it reads as a person
 * animatedly explaining something, not just a mouth flapping in place.
 */
export default function TalkingAvatar({ state, level = 0, size = 72, className = "" }: Props) {
  const [blinking, setBlinking] = useState(false);
  const [synthTick, setSynthTick] = useState(0);
  const [gesture, setGesture] = useState({ turn: 0, tilt: 0, brow: 0 });

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

  // Head turn/tilt/brow-raise while speaking — deliberately on its own,
  // slower cadence than the mouth, and independent of amplitude, so the
  // character reads as gesturing through an explanation rather than just a
  // mouth animating on an otherwise frozen head.
  useEffect(() => {
    if (state !== "speaking") return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      setGesture({
        turn: Math.sin(t * 0.7) * 3.2,
        tilt: Math.sin(t * 0.5 + 1) * 2.2,
        brow: Math.max(0, Math.sin(t * 1.3)) * (Math.sin(t * 0.35) > 0.6 ? 1 : 0),
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const activeGesture = state === "speaking" ? gesture : { turn: 0, tilt: 0, brow: 0 };
  const mouthOpen = state === "speaking" ? Math.max(level, level > 0.04 ? level : synthTick * 0.7) : 0;
  const eyeScaleY = blinking ? 0.08 : state === "listening" ? 1.1 : 1;
  const browLift = (state === "listening" ? -1.2 : 0) - activeGesture.brow * 1.4;
  const ringScale = 1 + (state === "listening" || state === "speaking" ? level * 0.5 : 0);

  const ringColor =
    state === "listening" ? "#2DB49E" : state === "speaking" ? "#5EEAD4" : state === "thinking" ? "#E8A83C" : "transparent";

  const uid = "av";

  return (
    <div
      className={`relative shrink-0 ${className} ${state === "idle" ? "animate-avatar-bob" : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        state === "listening"
          ? "Aura is listening"
          : state === "speaking"
          ? "Aura is speaking"
          : state === "thinking"
          ? "Aura is thinking"
          : "Aura"
      }
    >
      {/* Reactive ring — level while listening/speaking, gentle breathing while idle */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-full ${state === "idle" ? "animate-pulse" : ""}`}
        style={{
          background: ringColor,
          opacity: state === "idle" ? 0.12 : 0.3,
          transform: `scale(${ringScale})`,
          transition: "transform 90ms linear",
        }}
      />

      <svg viewBox="0 0 100 100" width={size} height={size} className="relative overflow-visible">
        <defs>
          <clipPath id={`${uid}-crop`}>
            <circle cx="50" cy="50" r="46" />
          </clipPath>
          <radialGradient id={`${uid}-backdrop`} cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#EAF7F4" />
            <stop offset="100%" stopColor="#BFE6DE" />
          </radialGradient>
          <linearGradient id={`${uid}-skin`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F3BE97" />
            <stop offset="100%" stopColor="#E0A277" />
          </linearGradient>
          <linearGradient id={`${uid}-hair`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#233A5C" />
            <stop offset="100%" stopColor="#132540" />
          </linearGradient>
          <linearGradient id={`${uid}-collar`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2FC7AE" />
            <stop offset="100%" stopColor="#178E7A" />
          </linearGradient>
        </defs>

        <circle cx="50" cy="50" r="47" fill="#0B1F3A" opacity="0.06" />

        <g clipPath={`url(#${uid}-crop)`}>
          <rect x="0" y="0" width="100" height="100" fill={`url(#${uid}-backdrop)`} />

          {/* Shoulders / collar — reads as "portrait from the chest up" */}
          <path d="M6,100 C6,78 24,68 50,68 C76,68 94,78 94,100 Z" fill={`url(#${uid}-collar)`} />
          <path d="M38,100 L38,74 Q50,80 62,74 L62,100 Z" fill="white" opacity="0.85" />

          {/* Head + neck group — this is what turns/tilts while speaking */}
          <g
            style={{
              transformOrigin: "50px 58px",
              transform: `rotate(${activeGesture.tilt}deg) translateX(${activeGesture.turn}px)`,
              transition: "transform 120ms ease-out",
            }}
          >
            <rect x="43" y="55" width="14" height="16" rx="6" fill={`url(#${uid}-skin)`} />

            {/* Hair — back layer, behind head */}
            <path d="M20,48 C20,24 34,12 50,12 C66,12 80,24 80,48 L80,58 C74,44 64,38 50,38 C36,38 26,44 20,58 Z" fill={`url(#${uid}-hair)`} />

            {/* Head */}
            <ellipse cx="50" cy="42" rx="21" ry="23" fill={`url(#${uid}-skin)`} />

            {/* Ears */}
            <ellipse cx="29.5" cy="43" rx="2.6" ry="4" fill={`url(#${uid}-skin)`} />
            <ellipse cx="70.5" cy="43" rx="2.6" ry="4" fill={`url(#${uid}-skin)`} />

            {/* Hair — front layer / fringe */}
            <path
              d="M22,38 C22,20 34,10 50,10 C66,10 78,20 78,38 C78,32 70,24 50,24 C30,24 22,32 22,38 Z"
              fill={`url(#${uid}-hair)`}
            />

            {/* Cheeks */}
            <ellipse cx="33" cy="49" rx="4.5" ry="3" fill="#F2A6A6" opacity="0.4" />
            <ellipse cx="67" cy="49" rx="4.5" ry="3" fill="#F2A6A6" opacity="0.4" />

            {/* Eyebrows */}
            <g stroke="#3A2718" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.75">
              <path d={`M39,${33 + browLift} q5,-2.5 10,0`} />
              <path d={`M51,${33 + browLift} q5,-2.5 10,0`} />
            </g>

            {/* Eyes */}
            <g style={{ transformOrigin: "43.5px 40px", transition: "transform 90ms ease" }}>
              <ellipse cx="43.5" cy="40" rx="4.6" ry={5.2 * eyeScaleY} fill="white" />
              <circle cx="43.5" cy={40 + (1 - eyeScaleY) * 1.6} r="2.5" fill="#5A3A22" />
              <circle cx="43.5" cy={40 + (1 - eyeScaleY) * 1.6} r="1.15" fill="#1A1006" />
              <circle cx="42.6" cy={38.6 + (1 - eyeScaleY) * 1.6} r="0.7" fill="white" opacity="0.95" />
            </g>
            <g style={{ transformOrigin: "56.5px 40px", transition: "transform 90ms ease" }}>
              <ellipse cx="56.5" cy="40" rx="4.6" ry={5.2 * eyeScaleY} fill="white" />
              <circle cx="56.5" cy={40 + (1 - eyeScaleY) * 1.6} r="2.5" fill="#5A3A22" />
              <circle cx="56.5" cy={40 + (1 - eyeScaleY) * 1.6} r="1.15" fill="#1A1006" />
              <circle cx="55.6" cy={38.6 + (1 - eyeScaleY) * 1.6} r="0.7" fill="white" opacity="0.95" />
            </g>

            {/* Nose hint */}
            <path d="M49,42 Q48,47 50,48.5 Q52,47.5 51,42" stroke="#C98A5C" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round" />

            {/* Thinking: small drifting dots instead of a mouth */}
            {state === "thinking" ? (
              <g fill="#3A2718" opacity="0.75">
                <circle cx="46" cy="56" r="1.5">
                  <animate attributeName="cy" values="56;53;56" dur="1s" repeatCount="indefinite" begin="0s" />
                </circle>
                <circle cx="50" cy="56" r="1.5">
                  <animate attributeName="cy" values="56;53;56" dur="1s" repeatCount="indefinite" begin="0.15s" />
                </circle>
                <circle cx="54" cy="56" r="1.5">
                  <animate attributeName="cy" values="56;53;56" dur="1s" repeatCount="indefinite" begin="0.3s" />
                </circle>
              </g>
            ) : (
              <g style={{ transition: "transform 60ms linear" }}>
                {/* Lip shape */}
                <rect
                  x="43.5"
                  y={55.5 - (1.4 + mouthOpen * 5.5)}
                  width="13"
                  height={(1.4 + mouthOpen * 5.5) * 2}
                  rx={1.4 + mouthOpen * 5.5}
                  fill="#B3583F"
                  opacity="0.85"
                />
                {/* Teeth suggestion when the mouth is open enough */}
                {mouthOpen > 0.22 && (
                  <rect x="45" y={55.5 - (1.4 + mouthOpen * 5.5) + 0.8} width="10" height="1.6" rx="0.8" fill="white" opacity="0.85" />
                )}
              </g>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}
