import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { NARRATIVE_SYSTEM_PROMPT, validateNarrative, buildTemplatedNarrative } from "@/lib/handoff-narrative";
import type { HandoffAnalysis } from "@/lib/handoff-analysis";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics, recordTokenUsage } from "@/lib/metrics";
import { handoffNarrativeRequestSchema, formatZodError } from "@/lib/validation";
import { GROQ_GENERATION_MODEL } from "@/lib/models";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export const POST = withMetrics("handoff-narrative", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`handoff-narrative:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = handoffNarrativeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const analysis = parsed.data.analysis as unknown as HandoffAnalysis;

    const templated = buildTemplatedNarrative(analysis);

    // A generated summary is only used if it passes validation — any failure
    // (API error, rate limit, malformed output, banned phrase, condition name)
    // falls straight through to the deterministic template. That fallback is
    // not a degraded experience to apologize for; it's the safer default.
    try {
      const groq = getGroq();
      const completion = await groq.chat.completions.create({
        model: GROQ_GENERATION_MODEL,
        max_tokens: 300,
        temperature: 0,
        messages: [
          { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
          { role: "user", content: `DATA:\n${JSON.stringify(analysis, null, 2)}` },
        ],
      });
      if (completion.usage) {
        recordTokenUsage(completion.usage.prompt_tokens ?? 0, completion.usage.completion_tokens ?? 0);
      }
      const generated = completion.choices[0]?.message?.content?.trim();
      if (generated) {
        const { valid } = validateNarrative(generated);
        if (valid) {
          return NextResponse.json({ narrative: generated, source: "generated" });
        }
      }
    } catch {
      // fall through to templated
    }

    return NextResponse.json({ narrative: templated, source: "templated" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
