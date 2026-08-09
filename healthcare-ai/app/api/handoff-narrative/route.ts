import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { NARRATIVE_SYSTEM_PROMPT, validateNarrative, buildTemplatedNarrative } from "@/lib/handoff-narrative";
import type { HandoffAnalysis } from "@/lib/handoff-analysis";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { allowed, retryAfterSeconds } = checkRateLimit(`handoff-narrative:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json();
    const analysis = body.analysis as HandoffAnalysis | undefined;
    if (!analysis) {
      return NextResponse.json({ error: "analysis is required" }, { status: 400 });
    }

    const templated = buildTemplatedNarrative(analysis);

    // A generated summary is only used if it passes validation — any failure
    // (API error, rate limit, malformed output, banned phrase, condition name)
    // falls straight through to the deterministic template. That fallback is
    // not a degraded experience to apologize for; it's the safer default.
    try {
      const groq = getGroq();
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        temperature: 0,
        messages: [
          { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
          { role: "user", content: `DATA:\n${JSON.stringify(analysis, null, 2)}` },
        ],
      });
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
}
