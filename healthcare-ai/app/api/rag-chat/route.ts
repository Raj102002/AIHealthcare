import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { retrieveRelevantChunks } from "@/lib/rag-retrieval";

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are an assistant answering questions about Lyme disease using two kinds of retrieved data: (1) CDC surveillance statistics (case counts by county/region, 2001-2023, and by race, 2010-2023), and (2) general CDC educational information (what Lyme disease is, transmission, symptoms, diagnosis, treatment, prevention).

CORE RULES — follow every single one:
1. Answer ONLY using the facts given to you in the RETRIEVED DATA section of the user message. Do not use outside knowledge about Lyme disease beyond what's retrieved, and do not estimate or infer numbers that aren't in the retrieved data.
2. If the retrieved data doesn't answer the question, say so plainly instead of guessing.
3. ALWAYS cite your source for every fact exactly as given in the retrieved data — for statistics, name the region/race and year(s) (e.g. "(CDC Lyme Disease Surveillance — County Case Counts, Autauga County, Alabama, 2001-2023)"); for general information, name the CDC page (e.g. "(CDC — Signs and Symptoms of Lyme Disease)").
4. NEVER diagnose an individual, and never tell someone they do or don't have Lyme disease — not even when general symptom information is available. You may describe what CDC says are typical symptoms in general, but always redirect a personal "do I have it" question to a healthcare professional rather than answering it. This is reference material, not a diagnostic tool.
5. Reported case counts are known to undercount true incidence due to underdiagnosis and underreporting — mention this uncertainty whenever a user might otherwise read a count as precise or complete.
6. When the retrieved data notes that a region's history doesn't cover all years (a boundary change), say so explicitly rather than implying zero cases were measured in those years.
7. End every substantive response with: "This is aggregate surveillance data and general CDC information, not a diagnosis. If you have symptoms or concerns, please consult a healthcare professional."`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question } = body as { question?: string };

    if (!question?.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const retrieved = await retrieveRelevantChunks(question, 6);
    const context = retrieved
      .map(
        (c, i) =>
          `[${i + 1}] (${c.source} — ${c.region}, ${c.years_covered})\n${c.text}`
      )
      .join("\n\n");

    const completion = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `RETRIEVED DATA:\n${context}\n\nQUESTION: ${question}`,
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? "";

    return NextResponse.json({
      answer,
      sources: retrieved.map((c) => ({
        region: c.region,
        source: c.source,
        yearsCovered: c.years_covered,
        relevance: Math.round(c.score * 100) / 100,
      })),
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
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
