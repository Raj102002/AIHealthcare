import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";
import { rewriteQuery } from "@/lib/query-rewrite";
import { buildContext, buildSystemPrompt, type HealthProfile } from "@/lib/generation";
import { screenRedFlags } from "@/lib/red-flag";
import { detectCoinfectionSignals, COINFECTION_QUESTIONS } from "@/lib/co-infection";
import { loadCorpusChunks } from "@/lib/corpus-lookup";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

function redFlagResponse(copy: string, severity: string): NextResponse {
  const prefixed = severity === "urgent" ? copy : `[EMERGENCY]\n${copy}`;
  return new NextResponse(prefixed, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Red-Flag": severity,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, userProfile } = body as {
      messages: { role: "user" | "assistant"; content: string }[];
      userProfile?: HealthProfile;
    };

    if (!messages?.length) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "user" || !lastMessage.content.trim()) {
      return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
    }

    // Runs before anything else, on the raw message only — deterministic pattern
    // matching, no model in the loop. On a match this returns immediately: no
    // query rewriting, no retrieval, no citations, no generation call.
    const redFlag = screenRedFlags(lastMessage.content);
    if (redFlag) {
      return redFlagResponse(redFlag.rule.copy, redFlag.rule.severity);
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
    const { block, sources } = buildContext(retrieved);

    const systemPrompt = buildSystemPrompt(userProfile, block.length > 0);
    const finalUserTurn = block
      ? `RETRIEVED CONTEXT:\n${block}\n\nUSER MESSAGE: ${lastMessage.content}`
      : lastMessage.content;

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: finalUserTurn },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? "";
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-RAG-Sources": Buffer.from(JSON.stringify(sources)).toString("base64"),
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
      return NextResponse.json(
        { error: "Rate limit reached. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
