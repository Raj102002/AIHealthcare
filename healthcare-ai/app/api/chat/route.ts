import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/retrieval";
import { rewriteQuery } from "@/lib/query-rewrite";
import { buildContext, buildSystemPrompt, type HealthProfile } from "@/lib/generation";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

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

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-RAG-Sources": Buffer.from(JSON.stringify(sources)).toString("base64"),
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
}
