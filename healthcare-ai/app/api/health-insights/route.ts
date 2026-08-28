import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { GROQ_GENERATION_MODEL, GROQ_REASONING_EFFORT } from "@/lib/models";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { healthInsightsRequestSchema, formatZodError } from "@/lib/validation";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

// This route was found without rate limiting, zod validation, or withMetrics
// during the v2 pass -- every other Groq-calling route already has all
// three. It's not dead code (components/HealthInsights.tsx on the dashboard
// calls it), so it gets brought up to the same bar rather than removed.
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export const POST = withMetrics("health-insights", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`health-insights:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = healthInsightsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { logs, profile } = parsed.data;

    if (logs.length === 0) {
      return NextResponse.json({
        insights: "No health logs found. Start logging your symptoms and vitals to receive personalized AI insights.",
      });
    }

    const profileSection = profile
      ? [
          profile.age ? `Age: ${profile.age}` : null,
          profile.bloodType ? `Blood type: ${profile.bloodType}` : null,
          profile.allergies?.length ? `Allergies: ${profile.allergies.join(", ")}` : null,
          profile.conditions?.length ? `Conditions: ${profile.conditions.join(", ")}` : null,
          profile.medications?.length ? `Medications: ${profile.medications.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const logLines = logs
      .slice(0, 20)
      .map((l) => {
        const vitalsStr =
          l.vitals && Object.keys(l.vitals).length
            ? ` | vitals: ${Object.entries(l.vitals)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}`
            : "";
        return `• [${new Date(l.createdAt).toLocaleDateString()}] ${l.symptoms} (${l.severity})${l.notes ? ` — ${l.notes}` : ""}${vitalsStr}`;
      })
      .join("\n");

    const userContent = `${profileSection ? `PATIENT PROFILE:\n${profileSection}\n\n` : ""}RECENT HEALTH LOGS (${logs.length} total, showing up to 20):\n${logLines}

Please provide a structured health log analysis with these sections:
1. **Patterns** — recurring symptoms or trends you notice
2. **Observations** — notable findings (e.g., severity trends, vital sign patterns)
3. **Wellness Recommendations** — general lifestyle or self-care suggestions based on the data
4. **When to Seek Care** — any flags that warrant a doctor visit

Be concise and practical. This is general wellness guidance only.`;

    const completion = await getGroq().chat.completions.create({
      model: GROQ_GENERATION_MODEL,
      max_tokens: 950,
      reasoning_effort: GROQ_REASONING_EFFORT,
      messages: [
        {
          role: "system",
          content:
            "You are a health data analyst providing general wellness insights from symptom logs. Never diagnose medical conditions. Always recommend consulting a qualified healthcare professional for medical concerns. Be empathetic, clear, and concise.",
        },
        { role: "user", content: userContent },
      ],
    });

    const insights = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ insights });
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
    const message = error instanceof Error ? error.message : "Failed to generate insights";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
