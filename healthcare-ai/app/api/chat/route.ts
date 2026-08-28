import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";
import { rewriteQuery } from "@/lib/query-rewrite";
import { buildContext, buildOperationalAddendum, type HealthProfile } from "@/lib/generation";
import { buildChatSystemPrompt, buildContextBlock } from "@/lib/prompts/aura";
import { screenRedFlags } from "@/lib/red-flag";
import { detectCoinfectionSignals, COINFECTION_QUESTIONS } from "@/lib/co-infection";
import { loadCorpusChunks } from "@/lib/corpus-lookup";
import { checkRateLimit, clientKeyFrom } from "@/lib/rate-limit";
import { recordRequest, recordTokenUsage } from "@/lib/metrics";
import { chatRequestSchema, formatZodError } from "@/lib/validation";
import { flagPromptInjection } from "@/lib/prompt-injection";
import { logger } from "@/lib/logger";
import { GROQ_GENERATION_MODEL, GROQ_REASONING_EFFORT } from "@/lib/models";
import { computeEvidenceTier, computeEvidenceScore } from "@/lib/evidence-tier";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

// This route was the one gap flagged in design.md's API table — every other
// AI-calling route already had rate limiting. Higher limit than the other
// routes since this is the primary chat surface.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function redFlagResponse(copy: string, severity: string, evidenceTier: string): NextResponse {
  const prefixed = severity === "urgent" ? copy : `[EMERGENCY]\n${copy}`;
  return new NextResponse(prefixed, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Red-Flag": severity,
      "X-Evidence-Tier": evidenceTier,
      // No retrieval ran on this path (red-flag short-circuits before it),
      // so there's no real score to report -- 0 here means "not applicable,"
      // same as the empty-retrieval case, not "zero confidence in an answer."
      "X-Evidence-Score": "0",
    },
  });
}

export async function POST(request: NextRequest) {
  const requestStart = Date.now();
  const { allowed, retryAfterSeconds } = checkRateLimit(`chat:${clientKeyFrom(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!allowed) {
    recordRequest({ route: "chat", durationMs: Date.now() - requestStart, status: "rate_limited" });
    return NextResponse.json(
      { error: "Rate limit reached. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = chatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { messages, userProfile } = parsed.data as {
      messages: { role: "user" | "assistant"; content: string }[];
      userProfile?: HealthProfile;
    };

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user" || !lastMessage.content.trim()) {
      return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
    }

    // Logged, not blocked: a health chat legitimately discusses phrases that
    // overlap with injection patterns ("ignore" symptoms, "disregard" a prior
    // diagnosis), so hard-rejecting would cause real false positives. This
    // gives observability into attempts without breaking legitimate use —
    // see docs/security-audit.md for why blocking wasn't chosen here.
    if (flagPromptInjection(lastMessage.content)) {
      logger.warn("prompt-injection pattern matched in user message", { route: "chat" });
    }

    // Runs before anything else, on the raw message only — deterministic pattern
    // matching, no model in the loop. On a match this returns immediately: no
    // query rewriting, no retrieval, no citations, no generation call.
    const redFlag = screenRedFlags(lastMessage.content);
    if (redFlag) {
      recordRequest({ route: "chat", durationMs: Date.now() - requestStart, status: "success", model: `red-flag:${redFlag.rule.id}` });
      return redFlagResponse(redFlag.rule.copy, redFlag.rule.severity, "no_diagnosis_applicable");
    }

    // Non-blocking, deterministic, no model in the loop — the same tick that
    // spreads Lyme disease can carry other pathogens, and this is never framed
    // as a differential diagnosis, only a question worth bringing to a
    // clinician who may not have asked it. Runs alongside the normal answer,
    // never in place of it.
    const coinfectionSignals = detectCoinfectionSignals(lastMessage.content);
    const coinfectionNotes = coinfectionSignals.map((signal) => {
      const chunk = loadCorpusChunks().find((c) => c.id === `doc:tick-borne-co-infections:${signal}-signals`);
      return {
        signal,
        question: COINFECTION_QUESTIONS[signal],
        source: chunk
          ? { source_name: chunk.metadata.source_name, source_url: chunk.metadata.source_url, section_path: chunk.metadata.section_path }
          : null,
      };
    });

    const groq = getGroq();
    const history = messages.slice(0, -1);

    const rewrittenQuery = await rewriteQuery(history, lastMessage.content, groq);
    const retrieved = await retrieve(rewrittenQuery, groq);
    const evidenceTier = computeEvidenceTier(retrieved);
    const evidenceScore = computeEvidenceScore(retrieved);
    const { sources, chunks } = buildContext(retrieved);

    // Context goes in as its own system turn, and the user's message is sent
    // completely raw — see lib/prompts/aura.ts's file header for why: appending
    // "RETRIEVED CONTEXT:" to the user turn is what previously made the model
    // say things like "the CDC materials you provided", since from its view the
    // human handed it documents in that same turn. The `sources` list below is
    // still shown to the user as its own UI element (components/ui/Turn.tsx) — this
    // only stops the model from narrating its own retrieval mechanics in prose.
    const contextBlock = buildContextBlock(chunks.map((c) => ({ text: c.text, source: c.metadata.source_name })));

    const stream = await groq.chat.completions.create({
      model: GROQ_GENERATION_MODEL,
      max_tokens: 1400,
      reasoning_effort: GROQ_REASONING_EFFORT,
      messages: [
        { role: "system", content: buildChatSystemPrompt() },
        { role: "system", content: buildOperationalAddendum(userProfile) },
        { role: "system", content: contextBlock },
        ...history,
        { role: "user", content: lastMessage.content },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
            // Groq includes usage on the final chunk of a stream, not every chunk.
            if (chunk.x_groq?.usage) usage = chunk.x_groq.usage;
          }
        } finally {
          controller.close();
          const promptTokens = usage?.prompt_tokens ?? 0;
          const completionTokens = usage?.completion_tokens ?? 0;
          if (promptTokens || completionTokens) recordTokenUsage(promptTokens, completionTokens);
          recordRequest({
            route: "chat",
            durationMs: Date.now() - requestStart,
            status: "success",
            model: GROQ_GENERATION_MODEL,
            promptTokens,
            completionTokens,
          });
        }
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-RAG-Sources": Buffer.from(JSON.stringify(sources)).toString("base64"),
      "X-Evidence-Tier": evidenceTier,
      "X-Evidence-Score": String(evidenceScore),
    };
    if (coinfectionNotes.length > 0) {
      headers["X-Coinfection-Notes"] = Buffer.from(JSON.stringify(coinfectionNotes)).toString("base64");
    }

    return new NextResponse(readable, { headers });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status: number }).status === 429
    ) {
      recordRequest({ route: "chat", durationMs: Date.now() - requestStart, status: "rate_limited" });
      return NextResponse.json(
        { error: "Rate limit reached. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    recordRequest({ route: "chat", durationMs: Date.now() - requestStart, status: "error", errorMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
