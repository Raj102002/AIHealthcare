import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { GROQ_TRANSCRIBE_MODEL } from "@/lib/models";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Seeds Whisper with domain vocabulary it would otherwise mishear — drug names,
// the pathogen, clinical terms, and proper nouns from the RAG corpus.
const DOMAIN_VOCABULARY_PROMPT =
  "Lyme disease, Borrelia burgdorferi, Borrelia mayonii, blacklegged tick, erythema migrans, " +
  "doxycycline, amoxicillin, cefuroxime, ELISA, Western blot, CDC, facial palsy, " +
  "erythema, arthralgia, myalgia.";

export const POST = withMetrics("transcribe", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(
    `transcribe:${clientKeyFrom(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("audio");
    const language = formData.get("language");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const transcription = await getGroq().audio.transcriptions.create({
      file,
      model: GROQ_TRANSCRIBE_MODEL,
      prompt: DOMAIN_VOCABULARY_PROMPT,
      ...(typeof language === "string" && language ? { language } : {}),
    });

    return NextResponse.json({ text: transcription.text });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status: number }).status === 429
    ) {
      return NextResponse.json(
        { error: "Rate limit reached. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
