import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { cached, cacheKeyFromText } from "@/lib/cache";
import { speakRequestSchema, formatZodError } from "@/lib/validation";
import { GROQ_TTS_MODEL } from "@/lib/models";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_INPUT_CHARS = 1000;
// Audio bytes for identical text (same voice/model) never change — this is a
// zero-staleness cache, unlike the retrieval cache. Sentences repeat often in
// practice: "This is not a diagnosis..." disclaimer lines, common answers to
// common questions, etc.
const TTS_CACHE_TTL_MS = 60 * 60 * 1000;

export const POST = withMetrics("speak", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`speak:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = speakRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const trimmedText = parsed.data.text.slice(0, MAX_INPUT_CHARS);
    const audio = await cached(`tts:${cacheKeyFromText(trimmedText)}`, TTS_CACHE_TTL_MS, async () => {
      const speech = await getGroq().audio.speech.create({
        input: trimmedText,
        model: GROQ_TTS_MODEL,
        voice: "Fritz-PlayAI",
        response_format: "mp3",
      });
      return speech.arrayBuffer();
    });

    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
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
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
