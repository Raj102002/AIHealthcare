import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { GROQ_GENERATION_MODEL, GROQ_REASONING_EFFORT } from "@/lib/models";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics } from "@/lib/metrics";
import { chatInsightsRequestSchema, formatZodError } from "@/lib/validation";
import { analyzeConversationTopics, fallbackNarrative } from "@/lib/log-analysis";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 10 * 60 * 1000;

// Mirrors app/api/health-insights/route.ts's shape (same rate limit, zod
// validation, withMetrics, single non-agentic Groq call) but analyzes saved
// Conversation records instead of HealthLog entries -- "how many diseases
// has this patient been asking about" rather than "what patterns are in
// their logged symptoms". The topic counts are computed deterministically by
// lib/log-analysis.ts and handed to the model as ground truth; the model's
// only job is to narrate those real numbers, not invent its own.
export const POST = withMetrics("chat-insights", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`chat-insights:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = chatInsightsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { conversations } = parsed.data;
    const analysis = analyzeConversationTopics(conversations);

    if (analysis.totalConversations === 0) {
      return NextResponse.json({ analysis, narrative: fallbackNarrative(analysis) });
    }

    const topicLines = (label: string, topics: typeof analysis.diseaseTopics) =>
      topics.length
        ? topics
            .map(
              (t) =>
                `• ${t.name}: ${t.count} question${t.count === 1 ? "" : "s"} across ${t.conversationCount} conversation${t.conversationCount === 1 ? "" : "s"} (first: ${new Date(t.firstAsked!).toLocaleDateString()}, most recent: ${new Date(t.lastAsked!).toLocaleDateString()})`
            )
            .join("\n")
        : `(none of the tracked ${label} came up)`;

    const userContent = `PATIENT'S SAVED CHAT HISTORY SUMMARY
Total saved conversations: ${analysis.totalConversations}
Total questions asked (across all conversations): ${analysis.totalUserQuestions}
Date range: ${analysis.dateRange.earliest ? new Date(analysis.dateRange.earliest).toLocaleDateString() : "n/a"} to ${analysis.dateRange.latest ? new Date(analysis.dateRange.latest).toLocaleDateString() : "n/a"}

DISEASES/CONDITIONS MENTIONED (exact counts, already computed — do not recompute or contradict these numbers):
${topicLines("disease topics", analysis.diseaseTopics)}

OTHER RECURRING TOPICS (exact counts, already computed):
${topicLines("other topics", analysis.otherTopics)}

Write a short report (3-5 sentences) summarizing which diseases/conditions this patient has been asking about most, using ONLY the numbers above. Mention the top 1-3 disease topics by name and count. Note any topic that appears to be a growing or recent focus (most recent date close to today) versus one that hasn't come up lately. Do not add disease names or counts that aren't in the data above.`;

    let narrative: string;
    try {
      const completion = await getGroq().chat.completions.create({
        model: GROQ_GENERATION_MODEL,
        max_tokens: 500,
        reasoning_effort: GROQ_REASONING_EFFORT,
        messages: [
          {
            role: "system",
            content:
              "You are a data-summary assistant reporting on which diseases/conditions a patient has asked their AI health navigator about over time, so they and their clinician can see the pattern at a glance. You are not diagnosing anything — you are only describing what topics came up in their own questions, using the exact counts you're given. Never say the patient has or doesn't have a condition. Never invent a number not present in the input. Be concise and concrete.",
          },
          { role: "user", content: userContent },
        ],
      });
      narrative = completion.choices[0]?.message?.content?.trim() || fallbackNarrative(analysis);
    } catch {
      // Demo/production must not go blank if Groq hiccups -- the deterministic
      // counts above are always correct, so fall back to a plain-English
      // rendering of them instead of surfacing an error for this feature.
      narrative = fallbackNarrative(analysis);
    }

    return NextResponse.json({ analysis, narrative });
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
    const message = error instanceof Error ? error.message : "Failed to analyze chat history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
