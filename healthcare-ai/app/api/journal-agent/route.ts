import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { withMetrics, recordTokenUsage } from "@/lib/metrics";
import { journalAgentRequestSchema, formatZodError } from "@/lib/validation";
import { JOURNAL_TOOLS, dispatchTool } from "@/lib/journal-tools";
import { logger } from "@/lib/logger";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MODEL = "llama-3.3-70b-versatile";
const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `You are a data-analysis assistant that answers questions about a patient's own symptom journal using the tools provided. You are not a diagnostic tool.

RULES:
- Answer ONLY using data returned by the tools. Call as many tools, in as many steps, as you need to answer accurately — you don't have to get it right in one call.
- NEVER diagnose a condition, and never say the patient does or does not have a specific disease (including Lyme disease), even if the data seems suggestive. If asked "do I have X", say that's a question for a clinician and offer to summarize the relevant logged data instead.
- NEVER prescribe or suggest medications or dosages.
- Report only what the tool results actually show. Do not infer causation from correlation (e.g. two things trending together is not "X caused Y").
- Be concise and concrete — cite actual numbers and dates from the tool results.
- If the tools don't have data to answer the question, say so plainly.
- End your final answer with: "This is a summary of your own logged data, not medical advice."`;

// Real agentic AI: the model decides which tools to call, in what order, and
// whether it needs more than one before it has enough to answer — this loop
// keeps calling tools until the model returns a plain answer, up to
// MAX_ITERATIONS. See lib/journal-tools.ts for the tool implementations and
// design.md's AI component diagram for how this differs from the rest of the
// app's fixed retrieval pipeline.
export const POST = withMetrics("journal-agent", async (request: NextRequest) => {
  const { allowed, retryAfterSeconds } = checkRateLimit(`journal-agent:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = journalAgentRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { question, journalData } = parsed.data;
    const groq = getGroq();

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ];

    const toolCallLog: { tool: string; args: unknown }[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const completion = await groq.chat.completions.create({
        model: MODEL,
        max_tokens: 600,
        temperature: 0,
        messages,
        tools: JOURNAL_TOOLS,
        tool_choice: "auto",
      });

      if (completion.usage) {
        recordTokenUsage(completion.usage.prompt_tokens ?? 0, completion.usage.completion_tokens ?? 0);
      }

      const choice = completion.choices[0];
      const toolCalls = choice?.message?.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        const answer = choice?.message?.content?.trim() ?? "I wasn't able to work out an answer from your logged data.";
        return NextResponse.json({ answer, toolCalls: toolCallLog, iterations: iteration + 1 });
      }

      messages.push({ role: "assistant", content: choice.message.content ?? "", tool_calls: toolCalls });

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // malformed arguments — dispatchTool below gets {} and most tools
          // treat that as "no filter", a reasonable degrade rather than a hard failure
        }
        const result = dispatchTool(call.function.name, args, journalData);
        toolCallLog.push({ tool: call.function.name, args });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    logger.warn("journal agent hit max iterations without a final answer", { question, iterations: MAX_ITERATIONS });
    return NextResponse.json({
      answer: "I gathered some data but couldn't finish putting together an answer — try asking a more specific question.",
      toolCalls: toolCallLog,
      iterations: MAX_ITERATIONS,
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
