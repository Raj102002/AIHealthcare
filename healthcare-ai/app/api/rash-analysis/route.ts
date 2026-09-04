import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";
import { buildContext } from "@/lib/generation";
import { buildVisionSystemPrompt, buildContextBlock } from "@/lib/prompts/aura";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { rashAnalysisRequestSchema, formatZodError } from "@/lib/validation";
import { GROQ_VISION_MODEL, GROQ_REASONING_EFFORT } from "@/lib/models";
import { logger } from "@/lib/logger";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Fixed retrieval query -- this route always wants the same slice of the
// corpus (erythema migrans / tick-bite-site description material), not a
// user-typed question, so there's nothing to rewrite or vary per call.
const RETRIEVAL_QUERY = "erythema migrans rash appearance expanding bullseye characteristics tick bite site";

// Wires up lib/prompts/aura.ts's buildVisionSystemPrompt(), written and
// reviewed ahead of time but deliberately left unwired until a vision-capable
// model was available on this Groq account (see that function's docblock and
// lib/models.ts's GROQ_VISION_MODEL comment). Grounds the model's visual
// description in the same retrieved CDC reference material chat uses,
// through the same buildContextBlock() "invisible reference material"
// mechanism -- this is a description aid, never a diagnosis, per the system
// prompt's own rules (never rule Lyme out, never declare it Lyme).
export const POST = withMetrics("rash-analysis", async (request: NextRequest) => {
  if (!GROQ_VISION_MODEL) {
    return NextResponse.json(
      { error: "Photo analysis isn't configured yet — no vision-capable model is enabled for this app." },
      { status: 501 }
    );
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(`rash-analysis:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = rashAnalysisRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { imageUrl, note } = parsed.data;
    const groq = getGroq();

    const retrieved = await retrieve(RETRIEVAL_QUERY, groq);
    const { sources, chunks } = buildContext(retrieved);
    const contextBlock = buildContextBlock(chunks.map((c) => ({ text: c.text, source: c.metadata.source_name })));

    const userText = note
      ? `The patient added this note about the photo: "${note}"`
      : "No note was provided with this photo.";

    const completion = await groq.chat.completions.create({
      model: GROQ_VISION_MODEL,
      max_tokens: 500,
      reasoning_effort: GROQ_REASONING_EFFORT,
      messages: [
        { role: "system", content: buildVisionSystemPrompt() },
        { role: "system", content: contextBlock },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
          // groq-sdk's Chat Completions types are generated for text-only
          // messages; Groq's multimodal endpoint accepts this OpenAI-style
          // content-part array at runtime (documented at
          // console.groq.com/docs/vision), so this cast is bridging a types
          // gap, not working around a real runtime mismatch.
        } as Groq.Chat.Completions.ChatCompletionMessageParam,
      ],
    });

    const analysis = completion.choices[0]?.message?.content?.trim();
    if (!analysis) {
      return NextResponse.json({ error: "Couldn't generate a description for this photo. Try again." }, { status: 502 });
    }

    return NextResponse.json({ analysis, sources });
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
    logger.warn("rash-analysis failed", { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "Failed to analyze photo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
